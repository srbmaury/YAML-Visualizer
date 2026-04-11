import axios from 'axios';
import {
  fetchRepositoryTreeImportStyle,
  importStyleTreeToAutoParseChildren,
} from './githubImportStyleParser.js';

/**
 * Skip dependency / build / VCS dirs — aligned with client `githubService` import behavior
 * (`getRepositoryTree` + `shouldSkipDirectory`).
 */
const SKIP_DIR_SEGMENTS = new Set(
  [
    'node_modules',
    'bower_components',
    'jspm_packages',
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
    'e2e',
    'out',
    'target',
    'bin',
    '.pytest_cache',
    '.tox',
    '.nyc_output',
    '__mocks__',
    'pods',
    '__macosx',
    '.svn',
  ].map(s => s.toLowerCase())
);

/** Path prefixes (case-insensitive) — multi-segment skips from client list. */
const SKIP_PATH_PREFIXES = [
  'tests/__snapshots__',
  'cypress/videos',
  'cypress/screenshots',
];

/**
 * @param {string} path - Git tree entry path (e.g. `src/App.tsx`, `pkg/node_modules/foo`)
 * @returns {boolean} true if this path should be excluded from structure YAML
 */
export function shouldSkipRepoTreePath(path) {
  if (!path || typeof path !== 'string') {
    return true;
  }
  let normalized = path.replace(/\\/g, '/').replace(/^\/+/, '').trim();
  while (normalized.startsWith('./')) {
    normalized = normalized.slice(2);
  }
  const lower = normalized.toLowerCase();

  // Fast path: match dependency / VCS dirs anywhere in the path (covers odd segment edge cases).
  if (
    lower === 'node_modules' ||
    lower.startsWith('node_modules/') ||
    lower.includes('/node_modules/') ||
    lower === '.git' ||
    lower.startsWith('.git/') ||
    lower.includes('/.git/')
  ) {
    return true;
  }

  for (const prefix of SKIP_PATH_PREFIXES) {
    const p = prefix.toLowerCase();
    if (lower === p || lower.startsWith(`${p}/`)) {
      return true;
    }
  }

  for (const seg of normalized.split('/')) {
    const name = seg.trim();
    if (!name) {
      continue;
    }
    if (SKIP_DIR_SEGMENTS.has(name.toLowerCase())) {
      return true;
    }
  }

  return false;
}

function githubHeaders() {
  return {
    Accept: 'application/vnd.github.v3+json',
    ...(process.env.GITHUB_TOKEN && {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`
    })
  };
}

/**
 * Repository metadata (same REST resource as client `getRepositoryInfo`).
 * Used so auto-parse YAML matches import/connect-repo visualization (stars, language, url, etc.).
 */
export async function fetchRepositoryMetadata(owner, repo) {
  const { data } = await axios.get(`https://api.github.com/repos/${owner}/${repo}`, {
    headers: githubHeaders()
  });
  return data;
}

/**
 * Tree SHA for the tip of a branch (REST: branch → commit → tree).
 */
async function resolveTreeShaFromBranch(owner, repo, branch) {
  const { data } = await axios.get(
    `https://api.github.com/repos/${owner}/${repo}/branches/${encodeURIComponent(branch)}`,
    { headers: githubHeaders() }
  );
  const treeSha = data?.commit?.commit?.tree?.sha;
  if (!treeSha) {
    throw new Error(`Could not resolve tree for branch "${branch}"`);
  }
  return treeSha;
}

/**
 * Tree SHA for a specific commit (e.g. webhook payload `after` — avoids stale branch reads right after push).
 */
async function resolveTreeShaFromCommit(owner, repo, commitSha) {
  const { data } = await axios.get(
    `https://api.github.com/repos/${owner}/${repo}/git/commits/${commitSha}`,
    { headers: githubHeaders() }
  );
  const treeSha = data?.tree?.sha;
  if (!treeSha) {
    throw new Error(`Could not resolve tree for commit ${commitSha}`);
  }
  return treeSha;
}

/**
 * Fetch flat tree entries from GitHub.
 * @param {{ afterCommitSha?: string }} options - If set (webhook `after`), use that commit's tree instead of branch tip.
 */
export async function fetchRepoStructure(owner, repo, branch = 'main', options = {}) {
  try {
    const { afterCommitSha } = options;
    const treeSha = afterCommitSha
      ? await resolveTreeShaFromCommit(owner, repo, afterCommitSha)
      : await resolveTreeShaFromBranch(owner, repo, branch);

    const treeResponse = await axios.get(
      `https://api.github.com/repos/${owner}/${repo}/git/trees/${treeSha}?recursive=1`,
      { headers: githubHeaders() }
    );

    if (treeResponse.data?.truncated) {
      console.error(
        `GitHub tree truncated for ${owner}/${repo} (>${treeResponse.data.tree?.length || '?'} entries). Set GITHUB_TOKEN or reduce repo size.`
      );
      throw new Error(
        'Repository tree is too large for a single recursive fetch (GitHub truncated=true).'
      );
    }

    const raw = treeResponse.data.tree || [];
    return raw.filter(entry => {
      const p = entry?.path;
      return typeof p === 'string' && p.length > 0 && !shouldSkipRepoTreePath(p);
    });
  } catch (error) {
    console.error('Error fetching repo structure:', error.response?.data || error.message);
    throw new Error(`Failed to fetch repository structure: ${error.message}`);
  }
}

/**
 * Convert flat GitHub tree to nested YAML structure
 * @param {Array} tree - GitHub tree array
 * @param {string} repoName - Repository name
 * @returns {Object} Nested structure for YAML
 */
export function buildNestedStructure(tree, repoName) {
  const root = {
    [repoName]: {}
  };

  const items = tree.filter(
    item =>
      item &&
      typeof item.path === 'string' &&
      !shouldSkipRepoTreePath(item.path) &&
      (item.type === 'blob' || item.type === 'tree')
  );
  items.sort((a, b) => a.path.localeCompare(b.path));

  for (const item of items) {
    const parts = item.path.split('/');
    let current = root[repoName];

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;

      if (isLast) {
        if (item.type === 'blob') {
          current[part] = {
            type: 'file',
            size: item.size,
            path: item.path,
            sha: item.sha
          };
        } else {
          if (!current[part]) {
            current[part] = {};
          }
        }
      } else {
        if (!current[part]) {
          current[part] = {};
        }
        current = current[part];
      }
    }
  }

  return root;
}

/**
 * Simplify nested structure for visualization (paths stay unique; sha/size change on add/edit).
 *
 * Files and empty dirs must stay as **objects** (not plain strings) so the client's
 * `buildTreeFromYAML` creates one diagram node per file; strings become properties on the parent.
 */
export function simplifyStructure(structure) {
  const simplified = {};

  for (const [key, value] of Object.entries(structure)) {
    if (value && typeof value === 'object') {
      if (value.type === 'file') {
        const ext = key.includes('.') ? key.slice(key.lastIndexOf('.') + 1) : '';
        const size = value.size != null ? `${value.size}b` : '?';
        const sha = value.sha ? String(value.sha).slice(0, 7) : '';
        const summary = sha
          ? `file${ext ? ` .${ext}` : ''} (${size}, ${sha})`
          : `file${ext ? ` .${ext}` : ''} (${size})`;
        simplified[key] = {
          type: 'file',
          ...(ext && { extension: ext }),
          size,
          ...(sha && { gitSha: sha }),
          summary,
        };
      } else {
        const children = simplifyStructure(value);
        if (Object.keys(children).length > 0) {
          simplified[key] = children;
        } else {
          simplified[key] = {
            type: 'directory',
            empty: true,
            note: 'empty directory',
          };
        }
      }
    }
  }

  return simplified;
}

/**
 * Extract a commit SHA from a GitHub `push` webhook body for tree pinning.
 * Prefer `after`; fall back to `head_commit.id` when present.
 * Accepts 7–40 hex chars (API resolves short SHAs). Null for branch deletes (`after` all zeros).
 */
export function parsePushCommitSha(pushBody) {
  if (!pushBody || typeof pushBody !== 'object') {
    return null;
  }
  const raw = pushBody.after ?? pushBody.head_commit?.id;
  if (typeof raw !== 'string') {
    return null;
  }
  const s = raw.trim();
  if (!s || /^0+$/.test(s)) {
    return null;
  }
  if (!/^[0-9a-f]{7,40}$/i.test(s)) {
    return null;
  }
  return s;
}

/**
 * Same pipeline as connect-repo / manual sync: branch tip only (no commit pin).
 */
export async function generateAutoParseYamlFromBranch(owner, repo, branch = 'main') {
  return generateRepoYAML(owner, repo, branch, null);
}

/**
 * Push webhook: try the pushed commit's tree first (matches that push), then fall back to
 * branch tip — same end state as `generateAutoParseYamlFromBranch` if pin fails (race, API flake).
 */
export async function generateAutoParseYamlFromPush(owner, repo, branch = 'main', pushBody = null) {
  const pin = parsePushCommitSha(pushBody);
  if (pin) {
    try {
      return await generateRepoYAML(owner, repo, branch, pin);
    } catch (err) {
      console.warn(
        `[githubRepoParser] Pin to commit ${pin.slice(0, 7)} failed (${err.message}); using branch "${branch}" like connect-repo`
      );
    }
  }
  return generateRepoYAML(owner, repo, branch, null);
}

/**
 * Generate YAML string from repository structure.
 * @param {string} afterCommitSha - If provided (GitHub push webhook `after`), pin to that commit's tree (fixes missing new files from stale branch reads).
 */
function sanitizeYamlName(name, isFile = false) {
  if (isFile) {
    return String(name).replace(/\s+/g, '-');
  }
  const last = String(name).split('/').pop() || name;
  return last.replace(/\s+/g, '-');
}

function yamlQuoteScalar(value) {
  if (typeof value !== 'string') {
    return String(value);
  }
  if (value === '') {
    return '""';
  }
  if (/[\n\r:#]/.test(value) || /^[\s'"`]/.test(value) || /[\s'"`]$/.test(value)) {
    return JSON.stringify(value);
  }
  return value;
}

/**
 * Turn simplified tree (under repo root key) into import-style child nodes (arrays with name/type/children).
 */
export function simplifiedInnerToChildren(inner) {
  if (!inner || typeof inner !== 'object') {
    return [];
  }
  return Object.entries(inner).map(([rawName, value]) => {
    const name = sanitizeYamlName(rawName, value?.type === 'file');
    if (value && typeof value === 'object' && value.type === 'file') {
      const node = {
        name,
        type: 'file'
      };
      if (value.extension) {
        node.extension = value.extension;
      }
      if (value.size != null) {
        node.size = String(value.size);
      }
      if (value.gitSha) {
        node.gitSha = value.gitSha;
      }
      if (value.summary) {
        node.summary = value.summary;
      }
      return node;
    }
    if (value && typeof value === 'object' && value.type === 'directory' && value.empty) {
      return {
        name,
        type: 'directory',
        empty: true,
        note: value.note || 'empty directory'
      };
    }
    const childObj = value;
    const keys = Object.keys(childObj);
    const children = simplifiedInnerToChildren(childObj);
    return {
      name,
      type: 'directory',
      size: `${keys.length} items`,
      children
    };
  });
}

function emitChildNodeYaml(node, indent) {
  const spaces = '  '.repeat(indent);
  const safeName = sanitizeYamlName(node.name, node.type === 'file');
  let yaml = `${spaces}- name: ${safeName}\n`;

  const orderedKeys = [
    'description',
    'language',
    'type',
    'category',
    'framework',
    'size',
    'extension',
    'stars',
    'forks',
    'updated',
    'url',
    'empty',
    'note',
    'gitSha',
    'summary'
  ];
  const emitted = new Set(['name']);

  for (const key of orderedKeys) {
    if (node[key] === undefined || key === 'children') {
      continue;
    }
    emitted.add(key);
    const v = node[key];
    yaml += `${spaces}  ${key}: ${typeof v === 'string' ? yamlQuoteScalar(v) : v}\n`;
  }

  for (const [key, v] of Object.entries(node)) {
    if (emitted.has(key) || key === 'children') {
      continue;
    }
    yaml += `${spaces}  ${key}: ${typeof v === 'string' ? yamlQuoteScalar(v) : v}\n`;
  }

  if (node.children && node.children.length > 0) {
    yaml += `${spaces}  children:\n`;
    for (const ch of node.children) {
      yaml += emitChildNodeYaml(ch, indent + 2);
    }
  }

  return yaml;
}

/**
 * Same shape as client import YAML so `buildTreeFromYAML` shows repository + directory metadata.
 */
export function buildAutoParseYamlDocument(repoInfo, children) {
  const name = sanitizeYamlName(repoInfo.name || repoInfo.full_name?.split('/').pop() || 'repository', false);
  const description = repoInfo.description != null ? String(repoInfo.description) : 'No description available';
  const language = repoInfo.language || 'Multiple';
  const stars = repoInfo.stargazers_count ?? 0;
  const forks = repoInfo.forks_count ?? 0;
  const sizeKb = repoInfo.size ?? 0;
  const updated = repoInfo.updated_at
    ? new Date(repoInfo.updated_at).toLocaleDateString()
    : '';
  const url = repoInfo.html_url || '';

  let yaml = `# Repository Structure: ${name}\n`;
  yaml += `# Generated from GitHub repository analysis\n\n`;
  yaml += `name: ${name}\n`;
  yaml += `description: ${yamlQuoteScalar(description)}\n`;
  yaml += `language: ${language}\n`;
  yaml += `type: repository\n`;
  yaml += `stars: ${stars}\n`;
  yaml += `forks: ${forks}\n`;
  yaml += `size: ${Math.round(sizeKb / 1024)}MB\n`;
  if (updated) {
    yaml += `updated: ${yamlQuoteScalar(updated)}\n`;
  }
  if (url) {
    yaml += `url: ${yamlQuoteScalar(url)}\n`;
  }
  if (children.length === 0) {
    yaml += `children: []\n`;
  } else {
    yaml += `children:\n`;
    for (const ch of children) {
      yaml += emitChildNodeYaml(ch, 1);
    }
  }
  return yaml;
}

export async function generateRepoYAML(owner, repo, branch = 'main', afterCommitSha = null) {
  const ref = afterCommitSha || branch;

  const repoInfo = await fetchRepositoryMetadata(owner, repo).catch(err => {
    console.warn(`[githubRepoParser] Repo metadata fetch failed: ${err.message}; using minimal defaults`);
    return {
      name: repo,
      description: 'No description available',
      language: null,
      stargazers_count: 0,
      forks_count: 0,
      size: 0,
      updated_at: null,
      html_url: `https://github.com/${owner}/${repo}`
    };
  });

  const repoSizeKB = repoInfo.size ?? 0;
  const rootTree = await fetchRepositoryTreeImportStyle(owner, repo, ref, { repoSizeKB });
  const rawChildren = rootTree?.type === 'directory' ? rootTree.children || [] : [];
  const children = importStyleTreeToAutoParseChildren(rawChildren);

  return buildAutoParseYamlDocument(repoInfo, children);
}
