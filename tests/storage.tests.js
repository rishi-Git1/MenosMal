import test from 'node:test';
import assert from 'node:assert/strict';

function parseBulkImport(text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const parsed = [];
  const issues = [];

  if (lines.length % 2 !== 0) issues.push('Uneven lines detected. Last item may be incomplete.');

  for (let i = 0; i < lines.length; i += 2) {
    const title = lines[i];
    const ratingLine = lines[i + 1];
    if (!title || !ratingLine) {
      issues.push(`Missing pair at lines ${i + 1}-${i + 2}.`);
      continue;
    }
    const match = ratingLine.match(/^(\d+(?:\.\d+)?)\s*\/\s*10$/i);
    if (!match) {
      issues.push(`Invalid rating format at line ${i + 2}: "${ratingLine}"`);
      continue;
    }
    const rating = Number(match[1]);
    if (Number.isNaN(rating) || rating < 0 || rating > 10) {
      issues.push(`Rating out of range at line ${i + 2}: "${ratingLine}"`);
      continue;
    }
    parsed.push({ title, rating });
  }

  return { parsed, issues };
}

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
