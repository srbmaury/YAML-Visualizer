import {
  calculateDelta,
  applyDelta,
  reconstructFromDeltas,
  calculateChangeStats,
  generateChangeSummary,
  shouldCreateSnapshot,
} from '../../src/services/deltaService.js';

describe('Delta Service', () => {
  describe('calculateDelta', () => {
    it('should return empty delta for identical strings', () => {
      const delta = calculateDelta('hello', 'hello');
      expect(delta).toEqual([]);
    });

    it('should calculate delta for text insertion', () => {
      const delta = calculateDelta('hello', 'hello world');
      expect(delta.length).toBeGreaterThan(0);
      expect(delta.some(op => op.op === 'insert')).toBe(true);
    });

    it('should calculate delta for text deletion', () => {
      const delta = calculateDelta('hello world', 'hello');
      expect(delta.length).toBeGreaterThan(0);
      expect(delta.some(op => op.op === 'delete')).toBe(true);
    });

    it('should handle empty strings', () => {
      const delta1 = calculateDelta('', 'new content');
      expect(delta1.some(op => op.op === 'insert')).toBe(true);

      const delta2 = calculateDelta('old content', '');
      expect(delta2.some(op => op.op === 'delete')).toBe(true);
    });

    it('should handle null/undefined inputs', () => {
      const delta1 = calculateDelta(null, 'new');
      expect(delta1.some(op => op.op === 'insert')).toBe(true);

      const delta2 = calculateDelta('old', null);
      expect(delta2.some(op => op.op === 'delete')).toBe(true);
    });

    it('should calculate delta for complex changes', () => {
      const oldText = 'name: Service\ntype: app';
      const newText = 'name: MicroService\ntype: microservice\nversion: 1.0';
      const delta = calculateDelta(oldText, newText);
      expect(delta.length).toBeGreaterThan(0);
    });
  });

  describe('applyDelta', () => {
    it('should apply insert operation', () => {
      const delta = [
        { op: 'retain', data: 5 },
        { op: 'insert', data: ' world' },
      ];
      const result = applyDelta('hello', delta);
      expect(result).toBe('hello world');
    });

    it('should apply delete operation', () => {
      const delta = [
        { op: 'retain', data: 5 },
        { op: 'delete', data: 6 },
      ];
      const result = applyDelta('hello world', delta);
      expect(result).toBe('hello');
    });

    it('should apply multiple operations', () => {
      const delta = [
        { op: 'retain', data: 5 },
        { op: 'delete', data: 1 },
        { op: 'insert', data: '!' },
      ];
      const result = applyDelta('hello world', delta);
      expect(result).toContain('hello');
    });

    it('should handle delete at the beginning', () => {
      const delta = [
        { op: 'delete', data: 6 },
        { op: 'retain', data: 5 },
      ];
      const result = applyDelta('hello world', delta);
      expect(result).toBe('world');
    });

    it('should handle empty base text', () => {
      const delta = [{ op: 'insert', data: 'new content' }];
      const result = applyDelta('', delta);
      expect(result).toBe('new content');
    });

    it('should handle null base text', () => {
      const delta = [{ op: 'insert', data: 'new' }];
      const result = applyDelta(null, delta);
      expect(result).toBe('new');
    });

    it('should handle complex operations sequence', () => {
      const delta = [
        { op: 'insert', data: 'Start: ' },
        { op: 'retain', data: 3 },
        { op: 'delete', data: 2 },
        { op: 'insert', data: 'XX' },
        { op: 'retain', data: 2 },
      ];
      const result = applyDelta('abcdefgh', delta);
      expect(result).toContain('Start:');
    });
  });

  describe('reconstructFromDeltas', () => {
    it('should reconstruct content from single delta', () => {
      const base = 'v1';
      const deltas = [
        [{ op: 'retain', data: 2 }, { op: 'insert', data: ' updated' }]
      ];
      const result = reconstructFromDeltas(base, deltas);
      expect(result).toBe('v1 updated');
    });

    it('should reconstruct content from multiple deltas', () => {
      const base = 'start';
      const deltas = [
        [{ op: 'retain', data: 5 }, { op: 'insert', data: ' v1' }],
        [{ op: 'retain', data: 8 }, { op: 'insert', data: ' v2' }],
      ];
      const result = reconstructFromDeltas(base, deltas);
      expect(result).toBe('start v1 v2');
    });

    it('should handle empty base content', () => {
      const deltas = [
        [{ op: 'insert', data: 'first' }],
        [{ op: 'retain', data: 5 }, { op: 'insert', data: ' second' }],
      ];
      const result = reconstructFromDeltas('', deltas);
      expect(result).toBe('first second');
    });

    it('should handle null base content', () => {
      const deltas = [[{ op: 'insert', data: 'new' }]];
      const result = reconstructFromDeltas(null, deltas);
      expect(result).toBe('new');
    });

    it('should handle empty deltas array', () => {
      const result = reconstructFromDeltas('base', []);
      expect(result).toBe('base');
    });
  });

  describe('calculateChangeStats', () => {
    it('should calculate stats for insertions', () => {
      const delta = [
        { op: 'insert', data: 'hello\nworld' },
      ];
      const stats = calculateChangeStats(delta);
      expect(stats.insertions).toBe(11);
      expect(stats.linesAdded).toBe(1);
      expect(stats.characterDelta).toBe(11);
    });

    it('should calculate stats for deletions', () => {
      const delta = [
        { op: 'delete', data: 10 },
      ];
      const stats = calculateChangeStats(delta);
      expect(stats.deletions).toBe(10);
      expect(stats.characterDelta).toBe(-10);
    });

    it('should calculate stats for retentions', () => {
      const delta = [
        { op: 'retain', data: 5 },
      ];
      const stats = calculateChangeStats(delta);
      expect(stats.retentions).toBe(5);
      expect(stats.characterDelta).toBe(0);
    });

    it('should calculate stats for mixed operations', () => {
      const delta = [
        { op: 'retain', data: 5 },
        { op: 'insert', data: 'abc\ndef' },
        { op: 'delete', data: 3 },
      ];
      const stats = calculateChangeStats(delta);
      expect(stats.insertions).toBe(7);
      expect(stats.deletions).toBe(3);
      expect(stats.retentions).toBe(5);
      expect(stats.linesAdded).toBe(1);
      expect(stats.characterDelta).toBe(4);
    });

    it('should handle empty delta', () => {
      const stats = calculateChangeStats([]);
      expect(stats.insertions).toBe(0);
      expect(stats.deletions).toBe(0);
      expect(stats.retentions).toBe(0);
    });
  });

  describe('generateChangeSummary', () => {
    it('should generate summary for no changes', () => {
      const delta = [];
      const summary = generateChangeSummary(delta);
      expect(summary).toBe('No changes');
    });

    it('should generate summary for line additions', () => {
      const delta = [{ op: 'insert', data: 'line1\nline2\n' }];
      const summary = generateChangeSummary(delta);
      expect(summary).toContain('+2 lines');
    });

    it('should generate summary for single line addition', () => {
      const delta = [{ op: 'insert', data: 'line\n' }];
      const summary = generateChangeSummary(delta);
      expect(summary).toContain('+1 line');
    });

    it('should generate summary for deletions', () => {
      const oldText = 'a\nb\nc\n';
      const newText = 'a\n';
      const delta = calculateDelta(oldText, newText);
      const summary = generateChangeSummary(delta, oldText, newText);
      expect(summary).toContain('char'); // Will detect as character deletions
    });

    it('should generate summary for character-only changes', () => {
      const delta = [
        { op: 'retain', data: 5 },
        { op: 'insert', data: 'abc' },
      ];
      const summary = generateChangeSummary(delta);
      expect(summary).toContain('+3 char');
    });

    it('should generate summary for single character', () => {
      const delta = [{ op: 'insert', data: 'x' }];
      const summary = generateChangeSummary(delta);
      expect(summary).toContain('+1 char');
    });

    it('should generate summary for character deletions', () => {
      const delta = [
        { op: 'retain', data: 5 },
        { op: 'delete', data: 3 },
      ];
      const summary = generateChangeSummary(delta);
      expect(summary).toContain('-3 chars');
    });

    it('should generate summary for mixed changes', () => {
      const delta = [
        { op: 'insert', data: 'new\n' },
        { op: 'delete', data: 5 },
      ];
      const summary = generateChangeSummary(delta);
      expect(summary).toContain('+1 line');
    });

    it('should handle only retentions', () => {
      const delta = [{ op: 'retain', data: 100 }];
      const summary = generateChangeSummary(delta);
      expect(summary).toBe('No changes');
    });

    it('should fallback to generic message', () => {
      // Edge case: changes but no clear additions/deletions counted
      const delta = [
        { op: 'insert', data: '' }, // Empty insert
        { op: 'delete', data: 0 },  // Zero delete
      ];
      const summary = generateChangeSummary(delta);
      expect(summary).toBeDefined();
    });
  });

  describe('shouldCreateSnapshot', () => {
    it('should create snapshot every 10 versions', () => {
      expect(shouldCreateSnapshot(10, 1000)).toBe(true);
      expect(shouldCreateSnapshot(20, 1000)).toBe(true);
      expect(shouldCreateSnapshot(30, 1000)).toBe(true);
    });

    it('should not create snapshot for other version counts', () => {
      expect(shouldCreateSnapshot(5, 1000)).toBe(false);
      expect(shouldCreateSnapshot(11, 1000)).toBe(false);
      expect(shouldCreateSnapshot(19, 1000)).toBe(false);
    });

    it('should create snapshot when deltas get too large', () => {
      expect(shouldCreateSnapshot(5, 50001)).toBe(true);
      expect(shouldCreateSnapshot(7, 100000)).toBe(true);
    });

    it('should not create snapshot for small delta sizes', () => {
      expect(shouldCreateSnapshot(5, 1000)).toBe(false);
      expect(shouldCreateSnapshot(7, 10000)).toBe(false);
      expect(shouldCreateSnapshot(9, 49999)).toBe(false);
    });

    it('should handle version 0', () => {
      expect(shouldCreateSnapshot(0, 1000)).toBe(true);
    });
  });

  describe('Integration: Full round-trip', () => {
    it('should calculate delta and apply it to get same result', () => {
      const oldText = 'name: OldService\ntype: app';
      const newText = 'name: NewService\ntype: microservice\nversion: 1.0';

      const delta = calculateDelta(oldText, newText);
      const reconstructed = applyDelta(oldText, delta);

      expect(reconstructed).toBe(newText);
    });

    it('should handle multiple version reconstructions', () => {
      const v1 = 'version 1';
      const v2 = 'version 1 updated';
      const v3 = 'version 1 updated and extended';

      const delta1to2 = calculateDelta(v1, v2);
      const delta2to3 = calculateDelta(v2, v3);

      const reconstructed = reconstructFromDeltas(v1, [delta1to2, delta2to3]);
      expect(reconstructed).toBe(v3);
    });

    it('should handle empty to content to empty', () => {
      const v1 = '';
      const v2 = 'content';
      const v3 = '';

      const delta1to2 = calculateDelta(v1, v2);
      const delta2to3 = calculateDelta(v2, v3);

      const r2 = applyDelta(v1, delta1to2);
      expect(r2).toBe(v2);

      const r3 = applyDelta(r2, delta2to3);
      expect(r3).toBe(v3);
    });
  });
});
