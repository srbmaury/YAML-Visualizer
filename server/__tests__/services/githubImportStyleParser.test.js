import {
  importStyleTreeToAutoParseChildren,
} from '../../src/services/githubImportStyleParser.js';

describe('GitHub Import Style Parser Service', () => {
  describe('importStyleTreeToAutoParseChildren', () => {
    it('should return empty array for empty input', () => {
      expect(importStyleTreeToAutoParseChildren([])).toEqual([]);
      expect(importStyleTreeToAutoParseChildren(null)).toEqual([]);
      expect(importStyleTreeToAutoParseChildren(undefined)).toEqual([]);
    });

    it('should map file nodes correctly', () => {
      const items = [
        {
          type: 'file',
          name: 'index.js',
          size: 1024,
          extension: 'js',
          category: 'code',
          language: 'JavaScript',
        },
      ];

      const result = importStyleTreeToAutoParseChildren(items);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        name: 'index.js',
        type: 'file',
        extension: 'js',
        category: 'code',
        language: 'JavaScript',
        size: '1KB',
        summary: 'file .js (1KB)',
      });
    });

    it('should map file nodes without size', () => {
      const items = [
        {
          type: 'file',
          name: 'file.txt',
          size: 0,
        },
      ];

      const result = importStyleTreeToAutoParseChildren(items);
      expect(result[0].summary).toBe('file (0B)');
    });

    it('should exclude "other" category from file nodes', () => {
      const items = [
        {
          type: 'file',
          name: 'unknown.xyz',
          category: 'other',
        },
      ];

      const result = importStyleTreeToAutoParseChildren(items);
      expect(result[0]).not.toHaveProperty('category');
    });

    it('should map directory nodes recursively', () => {
      const items = [
        {
          type: 'directory',
          name: 'src',
          children: [
            {
              type: 'file',
              name: 'app.js',
              size: 2048,
              extension: 'js',
            },
          ],
        },
      ];

      const result = importStyleTreeToAutoParseChildren(items);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        name: 'src',
        type: 'directory',
        size: '1 items',
        children: [
          {
            name: 'app.js',
            type: 'file',
            extension: 'js',
            size: '2KB',
            summary: 'file .js (2KB)',
          },
        ],
      });
    });

    it('should handle empty directories', () => {
      const items = [
        {
          type: 'directory',
          name: 'empty',
          children: [],
        },
      ];

      const result = importStyleTreeToAutoParseChildren(items);
      expect(result[0]).toEqual({
        name: 'empty',
        type: 'directory',
        size: '0 items',
        children: [],
      });
    });

    it('should handle truncated nodes', () => {
      const items = [
        {
          type: 'directory',
          name: 'large-dir',
          truncated: true,
          reason: 'max_depth',
        },
      ];

      const result = importStyleTreeToAutoParseChildren(items);
      expect(result[0]).toEqual({
        name: 'large-dir',
        type: 'directory',
        empty: true,
        note: 'max_depth',
      });
    });

    it('should handle failed nodes', () => {
      const items = [
        {
          type: 'directory',
          name: 'failed-dir',
          failed: true,
          error: 'API rate limit exceeded',
        },
      ];

      const result = importStyleTreeToAutoParseChildren(items);
      expect(result[0]).toEqual({
        name: 'failed-dir',
        type: 'directory',
        empty: true,
        note: 'API rate limit exceeded',
      });
    });

    it('should handle skipped nodes', () => {
      const items = [
        {
          type: 'directory',
          name: 'node_modules',
          skipped: true,
        },
      ];

      const result = importStyleTreeToAutoParseChildren(items);
      expect(result[0]).toEqual({
        name: 'node_modules',
        type: 'directory',
        size: '0 items',
        children: [],
      });
    });

    it('should format file names with spaces', () => {
      const items = [
        {
          type: 'file',
          name: 'my file.js',
        },
      ];

      const result = importStyleTreeToAutoParseChildren(items);
      expect(result[0].name).toBe('my-file.js');
    });

    it('should format directory names extracting last segment', () => {
      const items = [
        {
          type: 'directory',
          name: 'path/to/folder',
          children: [],
        },
      ];

      const result = importStyleTreeToAutoParseChildren(items);
      expect(result[0].name).toBe('folder');
    });

    it('should filter out null items', () => {
      const items = [
        {
          type: 'file',
          name: 'valid.js',
        },
        null,
        undefined,
        {
          type: 'file',
          name: 'another.js',
        },
      ];

      const result = importStyleTreeToAutoParseChildren(items);
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('valid.js');
      expect(result[1].name).toBe('another.js');
    });

    it('should handle deeply nested structures', () => {
      const items = [
        {
          type: 'directory',
          name: 'level1',
          children: [
            {
              type: 'directory',
              name: 'level2',
              children: [
                {
                  type: 'file',
                  name: 'deep.js',
                  size: 512,
                  extension: 'js',
                },
              ],
            },
          ],
        },
      ];

      const result = importStyleTreeToAutoParseChildren(items);
      expect(result[0].children[0].children[0].name).toBe('deep.js');
    });

    it('should handle file with large size (MB)', () => {
      const items = [
        {
          type: 'file',
          name: 'large.zip',
          size: 5242880, // 5MB in bytes
          extension: 'zip',
        },
      ];

      const result = importStyleTreeToAutoParseChildren(items);
      expect(result[0].size).toContain('MB');
    });

    it('should handle file with very small size (bytes)', () => {
      const items = [
        {
          type: 'file',
          name: 'tiny.txt',
          size: 50,
        },
      ];

      const result = importStyleTreeToAutoParseChildren(items);
      expect(result[0].size).toBe('50B');
    });

    it('should handle files without extension', () => {
      const items = [
        {
          type: 'file',
          name: 'Dockerfile',
        },
      ];

      const result = importStyleTreeToAutoParseChildren(items);
      expect(result[0].summary).toBe('file (0B)');
      expect(result[0]).not.toHaveProperty('extension');
    });

    it('should handle mixed content (files and dirs)', () => {
      const items = [
        {
          type: 'file',
          name: 'README.md',
          size: 1024,
          extension: 'md',
          category: 'docs',
          language: 'Markdown',
        },
        {
          type: 'directory',
          name: 'src',
          children: [
            {
              type: 'file',
              name: 'index.js',
              size: 2048,
              extension: 'js',
            },
          ],
        },
        {
          type: 'directory',
          name: 'build',
          skipped: true,
        },
      ];

      const result = importStyleTreeToAutoParseChildren(items);
      expect(result).toHaveLength(3);
      expect(result[0].type).toBe('file');
      expect(result[1].type).toBe('directory');
      expect(result[2].type).toBe('directory');
      expect(result[2].skipped).toBeUndefined(); // Transformed to children: []
    });

    it('should handle directory with multiple children', () => {
      const items = [
        {
          type: 'directory',
          name: 'components',
          children: [
            { type: 'file', name: 'Header.jsx', size: 100, extension: 'jsx' },
            { type: 'file', name: 'Footer.jsx', size: 200, extension: 'jsx' },
            { type: 'file', name: 'Sidebar.jsx', size: 300, extension: 'jsx' },
          ],
        },
      ];

      const result = importStyleTreeToAutoParseChildren(items);
      expect(result[0].size).toBe('3 items');
      expect(result[0].children).toHaveLength(3);
    });

    it('should handle truncated without reason', () => {
      const items = [
        {
          type: 'directory',
          name: 'dir',
          truncated: true,
        },
      ];

      const result = importStyleTreeToAutoParseChildren(items);
      expect(result[0].note).toBe('truncated');
    });

    it('should handle failed without error message', () => {
      const items = [
        {
          type: 'directory',
          name: 'dir',
          failed: true,
        },
      ];

      const result = importStyleTreeToAutoParseChildren(items);
      expect(result[0].note).toBe('fetch failed');
    });

    it('should ignore unknown node types', () => {
      const items = [
        {
          type: 'symlink',
          name: 'link',
        },
        {
          type: 'file',
          name: 'valid.txt',
        },
      ];

      const result = importStyleTreeToAutoParseChildren(items);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('valid.txt');
    });

    it('should handle nodes with all optional fields', () => {
      const items = [
        {
          type: 'file',
          name: 'full.js',
          size: 4096,
          extension: 'js',
          category: 'code',
          language: 'JavaScript',
          url: 'https://github.com/owner/repo/blob/main/full.js',
        },
      ];

      const result = importStyleTreeToAutoParseChildren(items);
      expect(result[0]).toEqual({
        name: 'full.js',
        type: 'file',
        extension: 'js',
        category: 'code',
        language: 'JavaScript',
        size: '4KB',
        summary: 'file .js (4KB)',
      });
      // Note: url is not included in output
    });

    it('should handle GB-sized files', () => {
      const items = [
        {
          type: 'file',
          name: 'huge.db',
          size: 2147483648, // 2GB
          extension: 'db',
        },
      ];

      const result = importStyleTreeToAutoParseChildren(items);
      expect(result[0].size).toContain('GB');
    });

    it('should format directory names with spaces in paths', () => {
      const items = [
        {
          type: 'directory',
          name: 'path/to/my folder',
          children: [],
        },
      ];

      const result = importStyleTreeToAutoParseChildren(items);
      expect(result[0].name).toBe('my-folder');
    });
  });
});
