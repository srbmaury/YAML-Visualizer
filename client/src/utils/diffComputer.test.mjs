import assert from 'node:assert/strict';
import DiffComputer from './diffComputer.js';

const unchanged = DiffComputer.computeLineDiff(['a', 'b'], ['a', 'b']);
assert.deepEqual(DiffComputer.getDiffStats(unchanged), {
  additions: 0,
  deletions: 0,
  modifications: 0,
  unchanged: 2,
});

const modified = DiffComputer.computeLineDiff(
  ['server:', '  replicas: 2', '  timeout: 30'],
  ['server:', '  replicas: 4', '  timeout: 30']
);
assert.equal(modified[1].type, 'modify');
assert.equal(modified[1].leftLine, '  replicas: 2');
assert.equal(modified[1].rightLine, '  replicas: 4');
assert.deepEqual(DiffComputer.getDiffStats(modified), {
  additions: 0,
  deletions: 0,
  modifications: 1,
  unchanged: 2,
});

const inserted = DiffComputer.computeLineDiff(['a'], ['a', 'b']);
assert.equal(inserted.at(-1).type, 'insert');

const deleted = DiffComputer.computeLineDiff(['a', 'b'], ['a']);
assert.equal(deleted.at(-1).type, 'delete');

const unified = DiffComputer.generateUnifiedDiff(modified, 'before.yml', 'after.yml');
assert.match(unified, /-  replicas: 2/);
assert.match(unified, /\+  replicas: 4/);

console.log('diffComputer regression tests passed');
