import axios from 'axios';

/**
 * Mirrors client `githubService.getRepositoryTree` + `processRepository` so webhook / connect-repo
 * YAML matches **Import Repo** (Contents API, depth limits, node caps, skip rules) — not full git tree.
 */

function importHeaders() {
  return {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'YAML-Visualizer-Server/1.0',
    ...(process.env.GITHUB_TOKEN && {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
    }),
  };
}

const SKIP_DIRS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  '__pycache__',
  '.next',
  '.nuxt',
  'vendor',
  '.vscode',
  '.idea',
  'logs',
  'tmp',
  'temp',
  'cache',
  '.cache',
  'coverage',
  'test_data',
  'tests/__snapshots__',
  'e2e',
  'cypress/videos',
  'cypress/screenshots',
];

function shouldSkipImportDirectory(dirName, depth) {
  const name = dirName.toLowerCase();

  if (SKIP_DIRS.includes(name)) {
    return true;
  }

  const alwaysSkipPatterns = [/^\.git$/, /^node_modules$/, /^\.vscode$/, /^\.idea$/];
  if (alwaysSkipPatterns.some(pattern => pattern.test(name))) {
    return true;
  }

  if (depth >= 2) {
    const deepSkipPatterns = [
      /^(dist|build|out|target)$/,
      /^(logs|log|tmp|temp)$/,
      /^(cache|\.cache|\.next|\.nuxt)$/,
      /^(coverage|\.nyc_output)$/,
      /^__pycache__$/,
      /^\.(pytest_cache|tox|coverage)$/,
    ];
    if (deepSkipPatterns.some(pattern => pattern.test(name))) {
      return true;
    }
  }

  return false;
}

function filterLargeDirectory(contents) {
  const priorityPatterns = [
    /^(readme|license|changelog|contributing|package\.json|tsconfig|webpack|vite|next|nuxt)(\.|$)/i,
    /^(src|lib|app|pages|components|utils|hooks|api|server|client)$/i,
    /^(config|configs|public|static|assets)$/i,
    /^(docs|documentation)$/i,
  ];

  const lowPriorityPatterns = [
    /^(test|tests|spec|__tests__|__mocks__|cypress|jest)$/i,
    /^(dist|build|out|target|bin)$/i,
    /^(logs|tmp|temp|cache|\.cache)$/i,
  ];

  const highPriority = [];
  const normalPriority = [];
  const lowPriority = [];

  contents.forEach(item => {
    const n = item.name.toLowerCase();
    if (priorityPatterns.some(pattern => pattern.test(n))) {
      highPriority.push(item);
    } else if (lowPriorityPatterns.some(pattern => pattern.test(n))) {
      lowPriority.push(item);
    } else {
      normalPriority.push(item);
    }
  });

  // Only filter if directory is very large (>150 items)
  // Otherwise return all items prioritized
  const maxItems = 150;

  return [
    ...highPriority,
    ...normalPriority.slice(0, Math.max(0, maxItems - highPriority.length - 5)),
    ...lowPriority.slice(0, 5),
  ].slice(0, maxItems);
}

function getFileExtension(filename) {
  const match = filename.match(/\.([^.]+)$/);
  return match ? match[1].toLowerCase() : '';
}

function categorizeFile(filename, extension) {
  const categories = {
    code: ['js', 'jsx', 'ts', 'tsx', 'py', 'java', 'cpp', 'c', 'h', 'cs', 'php', 'rb', 'go', 'rs', 'kt', 'swift'],
    config: ['json', 'yaml', 'yml', 'toml', 'ini', 'env', 'config'],
    docs: ['md', 'txt', 'rst', 'pdf', 'doc', 'docx'],
    styles: ['css', 'scss', 'sass', 'less', 'styl'],
    assets: ['png', 'jpg', 'jpeg', 'gif', 'svg', 'ico', 'webp'],
    data: ['csv', 'xml', 'sql', 'db', 'sqlite'],
    build: ['dockerfile', 'makefile', 'gradle', 'maven'],
  };

  const lowerName = filename.toLowerCase();
  if (lowerName.includes('readme')) return 'docs';
  if (lowerName.includes('package.json')) return 'config';
  if (lowerName.includes('dockerfile')) return 'build';
  if (lowerName.includes('makefile')) return 'build';

  for (const [category, extensions] of Object.entries(categories)) {
    if (extensions.includes(extension)) {
      return category;
    }
  }
  return 'other';
}

function detectLanguage(extension) {
  const languages = {
    js: 'JavaScript',
    jsx: 'React',
    ts: 'TypeScript',
    tsx: 'React TypeScript',
    py: 'Python',
    java: 'Java',
    cpp: 'C++',
    c: 'C',
    h: 'C/C++',
    cs: 'C#',
    php: 'PHP',
    rb: 'Ruby',
    go: 'Go',
    rs: 'Rust',
    kt: 'Kotlin',
    swift: 'Swift',
    css: 'CSS',
    scss: 'SCSS',
    html: 'HTML',
    md: 'Markdown',
  };
  return languages[extension] || null;
}

function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '0B';
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${Math.round((bytes / Math.pow(1024, i)) * 100) / 100}${sizes[i]}`;
}

function processFileNode(file) {
  const extension = getFileExtension(file.name);
  return {
    type: 'file',
    name: file.name,
    size: file.size || 0,
    extension,
    category: categorizeFile(file.name, extension),
    language: detectLanguage(extension),
    url: file.html_url,
  };
}

function encodePathForContents(path) {
  if (!path) return '';
  return path
    .split('/')
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/');
}

function getItemLimit(totalItems, stats, maxTotalNodes) {
  // Progressive backpressure: as we approach maxTotalNodes, reduce items per directory
  const progressiveFactor = Math.max(0.3, 1 - stats.nodes / maxTotalNodes);

  // Much more generous base limits - let overall limits (maxTotalNodes, maxApiCalls) do the real work
  const baseLimit = 100;

  const adjustedLimit = Math.floor(baseLimit * progressiveFactor);
  return Math.min(totalItems, Math.max(20, adjustedLimit));
}

async function walkContents(owner, repo, ref, path, maxDepth, currentDepth, stats, limits, repoName) {
  if (currentDepth >= maxDepth) {
    return { type: 'directory', name: '...', truncated: true, reason: 'max_depth' };
  }
  if (stats.nodes >= limits.maxTotalNodes) {
    return { type: 'directory', name: '...', truncated: true, reason: 'max_nodes' };
  }
  if (stats.apiCalls >= limits.maxApiCalls) {
    return { type: 'directory', name: '...', truncated: true, reason: 'max_api_calls' };
  }
  if (Date.now() - stats.startTime > limits.timeoutMs) {
    return { type: 'directory', name: '...', truncated: true, reason: 'timeout' };
  }

  const urlPath = encodePathForContents(path);
  const url = `https://api.github.com/repos/${owner}/${repo}/contents${urlPath ? `/${urlPath}` : ''}`;

  stats.apiCalls++;

  try {
    const { data } = await axios.get(url, {
      headers: importHeaders(),
      params: { ref },
      timeout: 45000,
    });

    if (!Array.isArray(data)) {
      stats.nodes++;
      return processFileNode(data);
    }

    let contents = [...data];
    if (contents.length > 150) {
      contents.splice(0, contents.length, ...filterLargeDirectory(contents));
    }

    contents.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'dir' ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });

    const itemsToProcess = contents.slice(
      0,
      getItemLimit(contents.length, stats, limits.maxTotalNodes)
    );

    const tree = {
      type: 'directory',
      name: path || repoName,
      size: contents.length,
      children: [],
      ...(contents.length > 50 && { isLarge: true }),
    };

    if (itemsToProcess.length < contents.length) {
      tree.truncated = true;
      tree.truncatedCount = contents.length - itemsToProcess.length;
    }

    for (const item of itemsToProcess) {
      if (stats.nodes >= limits.maxTotalNodes || stats.apiCalls >= limits.maxApiCalls) {
        break;
      }

      if (item.type === 'dir') {
        if (shouldSkipImportDirectory(item.name, currentDepth)) {
          tree.children.push({
            type: 'directory',
            name: item.name,
            size: '(skipped)',
            skipped: true,
            children: [],
          });
          continue;
        }

        const sub = await walkContents(
          owner,
          repo,
          ref,
          item.path,
          maxDepth,
          currentDepth + 1,
          stats,
          limits,
          repoName
        );
        tree.children.push(sub);
        stats.nodes++;
      } else if (item.type === 'file') {
        tree.children.push(processFileNode(item));
        stats.nodes++;
      }
    }

    return tree;
  } catch (error) {
    const msg = error.response?.data?.message || error.message;
    return {
      type: 'directory',
      name: path || repoName,
      error: msg,
      failed: true,
      children: [],
    };
  }
}

/**
 * Same limits as client `processRepository` (adjusted by repo size in KB).
 * @param {string} ref - branch name, tag, or commit SHA (GitHub `?ref=`).
 */
export async function fetchRepositoryTreeImportStyle(owner, repo, ref, { repoSizeKB = 0 } = {}) {
  let maxDepth = 5;
  let maxTotalNodes = 800;
  let maxApiCalls = 80;
  const timeoutMs = 45000;

  if (repoSizeKB > 50000) {
    maxDepth = 4;
    maxTotalNodes = 500;
    maxApiCalls = 50;
  } else if (repoSizeKB > 20000) {
    maxTotalNodes = 600;
    maxApiCalls = 60;
  }

  const stats = { nodes: 0, apiCalls: 0, startTime: Date.now() };
  const limits = { maxTotalNodes, maxApiCalls, timeoutMs };

  const node = await walkContents(owner, repo, ref, '', maxDepth, 0, stats, limits, repo);

  if (node.type === 'file') {
    return { type: 'directory', name: repo, children: [node] };
  }
  return node;
}

function formatYamlNameFile(name) {
  return String(name).replace(/\s+/g, '-');
}

function formatYamlNameDir(name) {
  const lastPart = String(name).split('/').pop() || name;
  return lastPart.replace(/\s+/g, '-');
}

/**
 * Maps import-style tree nodes to the shape expected by `buildAutoParseYamlDocument` / `emitChildNodeYaml`.
 */
export function importStyleTreeToAutoParseChildren(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return [];
  }

  return items.map(mapImportNode).filter(Boolean);
}

function mapImportNode(item) {
  if (!item) return null;

  if (item.truncated) {
    return {
      name: formatYamlNameDir(item.name),
      type: 'directory',
      empty: true,
      note: item.reason || 'truncated',
    };
  }

  if (item.failed) {
    return {
      name: formatYamlNameDir(item.name),
      type: 'directory',
      empty: true,
      note: String(item.error || 'fetch failed'),
    };
  }

  if (item.skipped) {
    return {
      name: formatYamlNameDir(item.name),
      type: 'directory',
      size: '0 items',
      children: [],
    };
  }

  if (item.type === 'file') {
    const node = {
      name: formatYamlNameFile(item.name),
      type: 'file',
    };
    if (item.category && item.category !== 'other') {
      node.category = item.category;
    }
    if (item.language) {
      node.language = item.language;
    }
    if (item.extension) {
      node.extension = item.extension;
    }
    if (item.size > 0) {
      node.size = formatFileSize(item.size);
    }
    const ext = item.extension ? ` .${item.extension}` : '';
    const sz = node.size || '0B';
    node.summary = `file${ext} (${sz})`;
    return node;
  }

  if (item.type === 'directory') {
    const kids = importStyleTreeToAutoParseChildren(item.children || []);
    return {
      name: formatYamlNameDir(item.name),
      type: 'directory',
      size: `${kids.length} items`,
      children: kids,
    };
  }

  return null;
}
