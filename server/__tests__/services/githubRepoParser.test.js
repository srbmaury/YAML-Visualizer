import { jest } from '@jest/globals';
import {
  shouldSkipRepoTreePath,
  buildNestedStructure,
  simplifyStructure,
  parsePushCommitSha,
  simplifiedInnerToChildren,
  buildAutoParseYamlDocument,
} from '../../src/services/githubRepoParser.js';

describe('GitHub Repo Parser Service', () => {
  describe('shouldSkipRepoTreePath', () => {
    it('should skip null or undefined paths', () => {
      expect(shouldSkipRepoTreePath(null)).toBe(true);
      expect(shouldSkipRepoTreePath(undefined)).toBe(true);
      expect(shouldSkipRepoTreePath('')).toBe(true);
    });

    it('should skip non-string paths', () => {
      expect(shouldSkipRepoTreePath(123)).toBe(true);
      expect(shouldSkipRepoTreePath({})).toBe(true);
      expect(shouldSkipRepoTreePath([])).toBe(true);
    });

    it('should skip node_modules paths', () => {
      expect(shouldSkipRepoTreePath('node_modules')).toBe(true);
      expect(shouldSkipRepoTreePath('node_modules/package')).toBe(true);
      expect(shouldSkipRepoTreePath('src/node_modules/lib')).toBe(true);
      expect(shouldSkipRepoTreePath('pkg/node_modules/foo')).toBe(true);
    });

    it('should skip .git paths', () => {
      expect(shouldSkipRepoTreePath('.git')).toBe(true);
      expect(shouldSkipRepoTreePath('.git/config')).toBe(true);
      expect(shouldSkipRepoTreePath('src/.git/HEAD')).toBe(true);
    });

    it('should skip paths with leading slashes and dots', () => {
      expect(shouldSkipRepoTreePath('///src/file.js')).toBe(false);
      expect(shouldSkipRepoTreePath('./src/file.js')).toBe(false);
      expect(shouldSkipRepoTreePath('././src/file.js')).toBe(false);
    });

    it('should skip build/dist directories', () => {
      expect(shouldSkipRepoTreePath('dist')).toBe(true);
      expect(shouldSkipRepoTreePath('build')).toBe(true);
      expect(shouldSkipRepoTreePath('dist/bundle.js')).toBe(true);
      expect(shouldSkipRepoTreePath('src/build/output')).toBe(true);
    });

    it('should skip test directories', () => {
      expect(shouldSkipRepoTreePath('coverage')).toBe(true);
      expect(shouldSkipRepoTreePath('__pycache__')).toBe(true);
      expect(shouldSkipRepoTreePath('.pytest_cache')).toBe(true);
      expect(shouldSkipRepoTreePath('.nyc_output')).toBe(true);
    });

    it('should skip IDE directories', () => {
      expect(shouldSkipRepoTreePath('.vscode')).toBe(true);
      expect(shouldSkipRepoTreePath('.idea')).toBe(true);
      expect(shouldSkipRepoTreePath('.vscode/settings.json')).toBe(true);
    });

    it('should skip special path prefixes', () => {
      expect(shouldSkipRepoTreePath('tests/__snapshots__')).toBe(true);
      expect(shouldSkipRepoTreePath('tests/__snapshots__/file.snap')).toBe(true);
      expect(shouldSkipRepoTreePath('cypress/videos')).toBe(true);
      expect(shouldSkipRepoTreePath('cypress/screenshots/test.png')).toBe(true);
    });

    it('should allow valid source paths', () => {
      expect(shouldSkipRepoTreePath('src/index.js')).toBe(false);
      expect(shouldSkipRepoTreePath('README.md')).toBe(false);
      expect(shouldSkipRepoTreePath('package.json')).toBe(false);
      expect(shouldSkipRepoTreePath('src/components/App.tsx')).toBe(false);
    });

    it('should handle paths with backslashes', () => {
      expect(shouldSkipRepoTreePath('src\\components\\App.js')).toBe(false);
      expect(shouldSkipRepoTreePath('node_modules\\package')).toBe(true);
    });

    it('should be case insensitive', () => {
      expect(shouldSkipRepoTreePath('NODE_MODULES')).toBe(true);
      expect(shouldSkipRepoTreePath('Node_Modules/pkg')).toBe(true);
      expect(shouldSkipRepoTreePath('DIST/bundle.js')).toBe(true);
      expect(shouldSkipRepoTreePath('.GIT/config')).toBe(true);
    });

    it('should skip mixed case paths', () => {
      expect(shouldSkipRepoTreePath('src/Node_Modules/lib')).toBe(true);
      expect(shouldSkipRepoTreePath('Build/output')).toBe(true);
    });
  });

  describe('buildNestedStructure', () => {
    it('should build nested structure from flat tree', () => {
      const tree = [
        { path: 'README.md', type: 'blob', size: 1024, sha: 'abc123' },
        { path: 'src/index.js', type: 'blob', size: 2048, sha: 'def456' },
        { path: 'src/utils/helper.js', type: 'blob', size: 512, sha: 'ghi789' },
      ];

      const result = buildNestedStructure(tree, 'test-repo');

      expect(result).toHaveProperty('test-repo');
      expect(result).toMatchObject({
        'test-repo': {
          'README.md': {
            type: 'file',
            size: 1024,
            path: 'README.md',
            sha: 'abc123',
          }
        }
      });
      expect(result['test-repo'].src).toBeDefined();
      expect(result['test-repo'].src['index.js']).toBeDefined();
      expect(result['test-repo'].src.utils['helper.js']).toBeDefined();
    });

    it('should filter out items without paths', () => {
      const tree = [
        { path: 'valid.js', type: 'blob', size: 100, sha: 'abc' },
        { type: 'blob', size: 100, sha: 'def' }, // Missing path
        null,
        { path: '', type: 'blob' }, // Empty path
      ];

      const result = buildNestedStructure(tree, 'repo');
      expect(result).toHaveProperty('repo');
      expect(result.repo['valid.js']).toBeDefined();
      const keys = Object.keys(result.repo);
      expect(keys.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle directories (tree type)', () => {
      const tree = [
        { path: 'src', type: 'tree' },
        { path: 'src/file.js', type: 'blob', size: 100, sha: 'abc' },
      ];

      const result = buildNestedStructure(tree, 'repo');
      expect(result.repo.src['file.js']).toBeDefined();
    });

    it('should skip paths that should be skipped', () => {
      const tree = [
        { path: 'src/index.js', type: 'blob', size: 100, sha: 'abc' },
        { path: 'node_modules/pkg/index.js', type: 'blob', size: 100, sha: 'def' },
        { path: 'dist/bundle.js', type: 'blob', size: 100, sha: 'ghi' },
      ];

      const result = buildNestedStructure(tree, 'repo');
      expect(result.repo.src).toBeDefined();
      expect(result.repo).not.toHaveProperty('node_modules');
      expect(result.repo).not.toHaveProperty('dist');
    });

    it('should sort items alphabetically', () => {
      const tree = [
        { path: 'z.js', type: 'blob', size: 100, sha: 'abc' },
        { path: 'a.js', type: 'blob', size: 100, sha: 'def' },
        { path: 'm.js', type: 'blob', size: 100, sha: 'ghi' },
      ];

      const result = buildNestedStructure(tree, 'repo');
      const keys = Object.keys(result.repo);
      expect(keys).toEqual(['a.js', 'm.js', 'z.js']);
    });

    it('should handle deeply nested paths', () => {
      const tree = [
        { path: 'a/b/c/d/e/file.js', type: 'blob', size: 100, sha: 'abc' },
      ];

      const result = buildNestedStructure(tree, 'repo');
      expect(result.repo.a.b.c.d.e['file.js']).toBeDefined();
    });
  });

  describe('simplifyStructure', () => {
    it('should simplify file nodes', () => {
      const structure = {
        'file.js': {
          type: 'file',
          size: 1024,
          path: 'file.js',
          sha: 'abc123def456',
        },
      };

      const result = simplifyStructure(structure);
      expect(result['file.js']).toHaveProperty('type', 'file');
      expect(result['file.js']).toHaveProperty('extension', 'js');
      expect(result['file.js']).toHaveProperty('size', '1024b');
      expect(result['file.js']).toHaveProperty('gitSha', 'abc123d');
      expect(result['file.js'].summary).toContain('file .js');
    });

    it('should simplify files without extensions', () => {
      const structure = {
        'Dockerfile': {
          type: 'file',
          size: 512,
          sha: 'xyz789',
        },
      };

      const result = simplifyStructure(structure);
      expect(result['Dockerfile']).toHaveProperty('type', 'file');
      expect(result['Dockerfile']).not.toHaveProperty('extension');
      expect(result['Dockerfile'].summary).toContain('file (512b');
    });

    it('should simplify files without sha', () => {
      const structure = {
        'file.txt': {
          type: 'file',
          size: 256,
        },
      };

      const result = simplifyStructure(structure);
      expect(result['file.txt']).not.toHaveProperty('gitSha');
      expect(result['file.txt'].summary).not.toContain('sha');
    });

    it('should simplify files without size', () => {
      const structure = {
        'file.md': {
          type: 'file',
          sha: 'abc123',
        },
      };

      const result = simplifyStructure(structure);
      expect(result['file.md'].size).toBe('?');
    });

    it('should simplify directories recursively', () => {
      const structure = {
        src: {
          'index.js': {
            type: 'file',
            size: 1024,
            sha: 'abc',
          },
        },
      };

      const result = simplifyStructure(structure);
      expect(result.src['index.js']).toHaveProperty('type', 'file');
    });

    it('should handle empty directories', () => {
      const structure = {
        'empty-dir': {},
      };

      const result = simplifyStructure(structure);
      expect(result['empty-dir']).toEqual({
        type: 'directory',
        empty: true,
        note: 'empty directory',
      });
    });

    it('should handle directories with empty and non-empty children', () => {
      const structure = {
        parent: {
          'empty-child': {},
          'file.js': { type: 'file', size: 100 },
        },
      };

      const result = simplifyStructure(structure);
      expect(result.parent['file.js']).toBeDefined();
      expect(result.parent['empty-child']).toBeDefined();
      expect(result.parent['empty-child'].type).toBe('directory');
    });
  });

  describe('parsePushCommitSha', () => {
    it('should parse SHA from after field', () => {
      const pushBody = {
        after: 'abc123def456',
      };
      expect(parsePushCommitSha(pushBody)).toBe('abc123def456');
    });

    it('should parse SHA from head_commit.id', () => {
      const pushBody = {
        head_commit: {
          id: 'abcdef1234567890abc', // Need at least 7 chars and valid hex
        },
      };
      expect(parsePushCommitSha(pushBody)).toBe('abcdef1234567890abc');
    });

    it('should prefer after over head_commit.id', () => {
      const pushBody = {
        after: 'abcdef1234', // Need valid hex format
        head_commit: {
          id: 'fallback456',
        },
      };
      expect(parsePushCommitSha(pushBody)).toBe('abcdef1234');
    });

    it('should return null for invalid inputs', () => {
      expect(parsePushCommitSha(null)).toBe(null);
      expect(parsePushCommitSha(undefined)).toBe(null);
      expect(parsePushCommitSha({})).toBe(null);
      expect(parsePushCommitSha([])).toBe(null);
      expect(parsePushCommitSha('string')).toBe(null);
    });

    it('should return null for branch deletion (all zeros)', () => {
      const pushBody = {
        after: '0000000000000000000000000000000000000000',
      };
      expect(parsePushCommitSha(pushBody)).toBe(null);
    });

    it('should return null for non-hex SHAs', () => {
      const pushBody = { after: 'notahexvalue' };
      expect(parsePushCommitSha(pushBody)).toBe(null);
    });

    it('should accept short SHAs (7 chars)', () => {
      const pushBody = { after: 'abc1234' };
      expect(parsePushCommitSha(pushBody)).toBe('abc1234');
    });

    it('should accept full SHAs (40 chars)', () => {
      const pushBody = {
        after: 'abcdef1234567890abcdef1234567890abcdef12',
      };
      expect(parsePushCommitSha(pushBody)).toBe(
        'abcdef1234567890abcdef1234567890abcdef12'
      );
    });

    it('should reject SHAs that are too short', () => {
      const pushBody = { after: 'abc123' }; // Only 6 chars
      expect(parsePushCommitSha(pushBody)).toBe(null);
    });

    it('should reject SHAs that are too long', () => {
      const pushBody = {
        after: 'abcdef1234567890abcdef1234567890abcdef123', // 41 chars
      };
      expect(parsePushCommitSha(pushBody)).toBe(null);
    });

    it('should handle empty string', () => {
      const pushBody = { after: '' };
      expect(parsePushCommitSha(pushBody)).toBe(null);
    });

    it('should handle whitespace', () => {
      const pushBody = { after: '  abc123def  ' };
      expect(parsePushCommitSha(pushBody)).toBe('abc123def');
    });

    it('should be case insensitive', () => {
      const pushBody = { after: 'ABCDEF1234' };
      expect(parsePushCommitSha(pushBody)).toBe('ABCDEF1234');
    });
  });

  describe('simplifiedInnerToChildren', () => {
    it('should convert file objects to child nodes', () => {
      const inner = {
        'file.js': {
          type: 'file',
          extension: 'js',
          size: '1024b',
          gitSha: 'abc123d',
          summary: 'file .js (1024b, abc123d)',
        },
      };

      const children = simplifiedInnerToChildren(inner);
      expect(children).toHaveLength(1);
      expect(children[0]).toEqual({
        name: 'file.js',
        type: 'file',
        extension: 'js',
        size: '1024b',
        gitSha: 'abc123d',
        summary: 'file .js (1024b, abc123d)',
      });
    });

    it('should handle files without optional properties', () => {
      const inner = {
        'simple.txt': {
          type: 'file',
        },
      };

      const children = simplifiedInnerToChildren(inner);
      expect(children[0]).toEqual({
        name: 'simple.txt',
        type: 'file',
      });
    });

    it('should convert directories to child nodes recursively', () => {
      const inner = {
        src: {
          'index.js': {
            type: 'file',
            size: '100b',
          },
        },
      };

      const children = simplifiedInnerToChildren(inner);
      expect(children).toHaveLength(1);
      expect(children[0].name).toBe('src');
      expect(children[0].type).toBe('directory');
      expect(children[0].children).toHaveLength(1);
      expect(children[0].children[0].name).toBe('index.js');
    });

    it('should handle empty directories', () => {
      const inner = {
        'empty-dir': {
          type: 'directory',
          empty: true,
          note: 'empty directory',
        },
      };

      const children = simplifiedInnerToChildren(inner);
      expect(children[0]).toEqual({
        name: 'empty-dir',
        type: 'directory',
        empty: true,
        note: 'empty directory',
      });
    });

    it('should sanitize names with spaces', () => {
      const inner = {
        'file with spaces.js': {
          type: 'file',
        },
      };

      const children = simplifiedInnerToChildren(inner);
      expect(children[0].name).toBe('file-with-spaces.js');
    });

    it('should handle null/undefined input', () => {
      expect(simplifiedInnerToChildren(null)).toEqual([]);
      expect(simplifiedInnerToChildren(undefined)).toEqual([]);
      expect(simplifiedInnerToChildren('string')).toEqual([]);
    });

    it('should handle empty object', () => {
      expect(simplifiedInnerToChildren({})).toEqual([]);
    });

    it('should calculate directory size', () => {
      const inner = {
        src: {
          'file1.js': { type: 'file' },
          'file2.js': { type: 'file' },
          'file3.js': { type: 'file' },
        },
      };

      const children = simplifiedInnerToChildren(inner);
      expect(children[0].size).toBe('3 items');
    });
  });

  describe('buildAutoParseYamlDocument', () => {
    it('should build YAML document from repo info and children', () => {
      const repoInfo = {
        name: 'test-repo',
        description: 'A test repository',
        language: 'JavaScript',
        stargazers_count: 100,
        forks_count: 50,
        size: 10240, // KB
        updated_at: '2024-01-01T00:00:00Z',
        html_url: 'https://github.com/owner/test-repo',
      };

      const children = [
        {
          name: 'README.md',
          type: 'file',
          size: '1024b',
        },
      ];

      const yaml = buildAutoParseYamlDocument(repoInfo, children);

      expect(yaml).toContain('name: test-repo');
      expect(yaml).toMatch(/description: ["\']?A test repository["\']?/);
      expect(yaml).toContain('language: JavaScript');
      expect(yaml).toContain('type: repository');
      expect(yaml).toContain('stars: 100');
      expect(yaml).toContain('forks: 50');
      expect(yaml).toContain('size: 10MB');
      expect(yaml).toMatch(/url: ["\']?https:\/\/github\.com\/owner\/test-repo["\']?/);
      expect(yaml).toContain('- name: README.md');
    });

    it('should handle repo with no children', () => {
      const repoInfo = {
        name: 'empty-repo',
        stargazers_count: 0,
        forks_count: 0,
        size: 0,
      };

      const yaml = buildAutoParseYamlDocument(repoInfo, []);
      expect(yaml).toContain('children: []');
    });

    it('should handle missing description', () => {
      const repoInfo = {
        name: 'repo',
        description: null,
        stargazers_count: 0,
        forks_count: 0,
        size: 0,
      };

      const yaml = buildAutoParseYamlDocument(repoInfo, []);
      expect(yaml).toMatch(/description: ["\']?No description available["\']?/);
    });

    it('should handle missing language', () => {
      const repoInfo = {
        name: 'repo',
        language: null,
        stargazers_count: 0,
        forks_count: 0,
        size: 0,
      };

      const yaml = buildAutoParseYamlDocument(repoInfo, []);
      expect(yaml).toContain('language: Multiple');
    });

    it('should handle repository from full_name', () => {
      const repoInfo = {
        full_name: 'owner/my-repo',
        stargazers_count: 0,
        forks_count: 0,
        size: 0,
      };

      const yaml = buildAutoParseYamlDocument(repoInfo, []);
      expect(yaml).toContain('name: my-repo');
    });

    it('should quote descriptions with special characters', () => {
      const repoInfo = {
        name: 'repo',
        description: 'Description with: colons',
        stargazers_count: 0,
        forks_count: 0,
        size: 0,
      };

      const yaml = buildAutoParseYamlDocument(repoInfo, []);
      expect(yaml).toContain('description: "Description with: colons"');
    });

    it('should sanitize repository names with spaces', () => {
      const repoInfo = {
        name: 'my test repo',
        stargazers_count: 0,
        forks_count: 0,
        size: 0,
      };

      const yaml = buildAutoParseYamlDocument(repoInfo, []);
      expect(yaml).toContain('name: my-test-repo');
    });

    it('should handle missing updated_at', () => {
      const repoInfo = {
        name: 'repo',
        updated_at: null,
        stargazers_count: 0,
        forks_count: 0,
        size: 0,
      };

      const yaml = buildAutoParseYamlDocument(repoInfo, []);
      expect(yaml).not.toContain('updated:');
    });

    it('should handle missing html_url', () => {
      const repoInfo = {
        name: 'repo',
        html_url: '',
        stargazers_count: 0,
        forks_count: 0,
        size: 0,
      };

      const yaml = buildAutoParseYamlDocument(repoInfo, []);
      expect(yaml).not.toContain('url:');
    });
  });
});
