import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBulkImport } from '../storage.js';

test('parses valid entries', () => {
  const { parsed, issues } = parseBulkImport('Naruto\n7.8/10\nMy Hero\n9.8/10');
  assert.equal(issues.length, 0);
  assert.deepEqual(parsed, [
    { title: 'Naruto', rating: 7.8 },
    { title: 'My Hero', rating: 9.8 },
  ]);
});

test('reports invalid rating', () => {
  const { parsed, issues } = parseBulkImport('Naruto\n11/10');
  assert.equal(parsed.length, 0);
  assert.equal(issues.length, 1);
});
