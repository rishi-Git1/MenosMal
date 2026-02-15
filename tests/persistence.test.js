import test from 'node:test';
import assert from 'node:assert/strict';
import { createGitHubStorage } from '../persistence.js';

function jsonResponse(status, payload) {
  return {
    status,
    ok: status >= 200 && status < 300,
    async json() {
      return payload;
    },
    async text() {
      return JSON.stringify(payload);
    },
  };
}

test('github storage reads entries from repository file', async () => {
  const storage = createGitHubStorage({
    owner: 'o',
    repo: 'r',
    token: 't',
    fetchImpl: async () =>
      jsonResponse(200, {
        sha: 'abc',
        content: Buffer.from(JSON.stringify([{ title: 'Naruto', rating: 8 }]), 'utf8').toString('base64'),
      }),
  });

  const entries = await storage.readEntries();
  assert.deepEqual(entries, [{ title: 'Naruto', rating: 8 }]);
});

test('github storage retries once on sha conflict', async () => {
  const calls = [];
  let putCount = 0;

  const storage = createGitHubStorage({
    owner: 'o',
    repo: 'r',
    token: 't',
    fetchImpl: async (url, options = {}) => {
      calls.push({ url, method: options.method || 'GET' });

      if (!options.method || options.method === 'GET') {
        return jsonResponse(200, {
          sha: putCount === 0 ? 'old-sha' : 'new-sha',
          content: Buffer.from('[]', 'utf8').toString('base64'),
        });
      }

      putCount += 1;
      if (putCount === 1) return jsonResponse(409, { message: 'conflict' });
      return jsonResponse(200, { content: { sha: 'done' } });
    },
  });

  await storage.writeEntries([{ title: 'Bleach', rating: 7.5 }]);

  const putCalls = calls.filter((call) => call.method === 'PUT');
  assert.equal(putCalls.length, 2);
});
