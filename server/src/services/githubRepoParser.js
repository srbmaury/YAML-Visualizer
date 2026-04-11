import axios from 'axios';

function githubHeaders() {
  return {
    Accept: 'application/vnd.github.v3+json',
    ...(process.env.GITHUB_TOKEN && {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`
    })
  };
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

    return treeResponse.data.tree || [];
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

  const items = tree.filter(item => item.type === 'blob' || item.type === 'tree');
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
export async function generateRepoYAML(owner, repo, branch = 'main', afterCommitSha = null) {
  const tree = await fetchRepoStructure(owner, repo, branch, { afterCommitSha });
  const nested = buildNestedStructure(tree, repo);
  const simplified = simplifyStructure(nested);
  return objectToYAML(simplified, 0);
}

function objectToYAML(obj, indent = 0) {
  const spaces = '  '.repeat(indent);
  let yaml = '';

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      yaml += `${spaces}${key}: ${value}\n`;
    } else if (typeof value === 'object' && value !== null) {
      yaml += `${spaces}${key}:\n`;
      yaml += objectToYAML(value, indent + 1);
    } else {
      yaml += `${spaces}${key}: ${value}\n`;
    }
  }

  return yaml;
}
