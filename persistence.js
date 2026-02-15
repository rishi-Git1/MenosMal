import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';

function decodeBase64Utf8(value) {
  return Buffer.from(value, 'base64').toString('utf8');
}

function encodeBase64Utf8(value) {
  return Buffer.from(value, 'utf8').toString('base64');
}

function normalizeEntries(parsed) {
  return Array.isArray(parsed) ? parsed : [];
}

export function createLocalStorage({ dataDir, dataFile }) {
  async function ensureDataFile() {
    await mkdir(dataDir, { recursive: true });
    try {
      await access(dataFile);
    } catch {
      await writeFile(dataFile, '[]', 'utf8');
    }
  }

  return {
    async readEntries() {
      await ensureDataFile();
      const raw = await readFile(dataFile, 'utf8');
      return normalizeEntries(JSON.parse(raw));
    },
    async writeEntries(entries) {
      await ensureDataFile();
      await writeFile(dataFile, JSON.stringify(entries, null, 2), 'utf8');
    },
  };
}

export function createGitHubStorage({
  owner,
  repo,
  branch = 'main',
  path = 'data/entries.json',
  token,
  fetchImpl = fetch,
}) {
  if (!owner || !repo || !path || !token) {
    throw new Error('GitHub storage requires GITHUB_OWNER, GITHUB_REPO, GITHUB_PATH, and GITHUB_TOKEN.');
  }

  const baseUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`;
  let cachedSha = null;

  async function getRemoteFile() {
    const response = await fetchImpl(`${baseUrl}?ref=${encodeURIComponent(branch)}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
      },
    });

    if (response.status === 404) {
      cachedSha = null;
      return { exists: false, sha: null, entries: [] };
    }

    if (!response.ok) {
      const message = await response.text();
      throw new Error(`GitHub read failed (${response.status}): ${message}`);
    }

    const payload = await response.json();
    const decoded = decodeBase64Utf8((payload.content || '').replace(/\n/g, ''));
    const parsed = JSON.parse(decoded || '[]');
    cachedSha = payload.sha;
    return { exists: true, sha: payload.sha, entries: normalizeEntries(parsed) };
  }

  async function putRemoteFile(entries, sha, attempt = 1) {
    const body = {
      message: `Update anime entries (${new Date().toISOString()})`,
      content: encodeBase64Utf8(JSON.stringify(entries, null, 2)),
      branch,
    };

    if (sha) body.sha = sha;

    const response = await fetchImpl(baseUrl, {
      method: 'PUT',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (response.ok) {
      const payload = await response.json();
      cachedSha = payload?.content?.sha ?? cachedSha;
      return;
    }

    if (response.status === 409 && attempt < 2) {
      const latest = await getRemoteFile();
      await putRemoteFile(entries, latest.sha, attempt + 1);
      return;
    }

    const message = await response.text();
    throw new Error(`GitHub write failed (${response.status}): ${message}`);
  }

  return {
    async readEntries() {
      const remote = await getRemoteFile();
      return remote.entries;
    },
    async writeEntries(entries) {
      const shaToUse = cachedSha;
      if (shaToUse === null) {
        const remote = await getRemoteFile();
        await putRemoteFile(entries, remote.sha);
        return;
      }

      await putRemoteFile(entries, shaToUse);
    },
  };
}

export function createStorageFromEnv({ cwd = process.cwd() } = {}) {
  const dataDir = join(cwd, 'data');
  const dataFile = join(dataDir, 'entries.json');

  const backend = (process.env.STORAGE_BACKEND || '').trim().toLowerCase();
  const githubConfigured = Boolean(
    process.env.GITHUB_OWNER && process.env.GITHUB_REPO && process.env.GITHUB_TOKEN,
  );

  if (backend === 'github' || (!backend && githubConfigured)) {
    return createGitHubStorage({
      owner: process.env.GITHUB_OWNER,
      repo: process.env.GITHUB_REPO,
      branch: process.env.GITHUB_BRANCH || 'main',
      path: process.env.GITHUB_PATH || 'data/entries.json',
      token: process.env.GITHUB_TOKEN,
    });
  }

  return createLocalStorage({ dataDir, dataFile });
}
