import { mkdir, readFile, writeFile, access, readdir, rm } from 'node:fs/promises';
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
  const listsDir = join(dataDir, 'lists');

  async function ensureDataFile() {
    await mkdir(dataDir, { recursive: true });
    try {
      await access(dataFile);
    } catch {
      await writeFile(dataFile, '[]', 'utf8');
    }
  }

  async function ensureListsDir() {
    await mkdir(listsDir, { recursive: true });
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
    async readLists() {
      try {
        await ensureListsDir();
        const files = await readdir(listsDir);
        return files
          .filter((f) => f.endsWith('.json'))
          .map((f) => f.slice(0, -5));
      } catch {
        return [];
      }
    },
    async readList(name) {
      await ensureListsDir();
      const file = join(listsDir, `${name}.json`);
      try {
        const raw = await readFile(file, 'utf8');
        return Array.isArray(JSON.parse(raw)) ? JSON.parse(raw) : [];
      } catch {
        return [];
      }
    },
    async writeList(name, entryIds) {
      await ensureListsDir();
      const file = join(listsDir, `${name}.json`);
      const payload = Array.isArray(entryIds) ? entryIds : [];
      await writeFile(file, JSON.stringify(payload, null, 2), 'utf8');
    },
    async deleteList(name) {
      await ensureListsDir();
      const file = join(listsDir, `${name}.json`);
      try {
        await rm(file);
      } catch {
        // Already deleted or doesn't exist
      }
    },
    async listExists(name) {
      await ensureListsDir();
      const file = join(listsDir, `${name}.json`);
      try {
        await access(file);
        return true;
      } catch {
        return false;
      }
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
  const listsBaseUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent('data/lists')}`;
  let cachedSha = null;
  const cachedListShas = new Map();

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

  async function getRemoteListFile(name) {
    const fileUrl = `${listsBaseUrl}/${encodeURIComponent(`${name}.json`)}`;
    const response = await fetchImpl(`${fileUrl}?ref=${encodeURIComponent(branch)}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
      },
    });

    if (response.status === 404) {
      cachedListShas.delete(name);
      return { exists: false, sha: null, entries: [] };
    }

    if (!response.ok) {
      const message = await response.text();
      throw new Error(`GitHub read list failed (${response.status}): ${message}`);
    }

    const payload = await response.json();
    const decoded = decodeBase64Utf8((payload.content || '').replace(/\n/g, ''));
    const parsed = JSON.parse(decoded || '[]');
    cachedListShas.set(name, payload.sha);
    return { exists: true, sha: payload.sha, entries: Array.isArray(parsed) ? parsed : [] };
  }

  async function putRemoteListFile(name, entryIds, sha, attempt = 1) {
    const fileUrl = `${listsBaseUrl}/${encodeURIComponent(`${name}.json`)}`;
    const body = {
      message: `Update custom list "${name}" (${new Date().toISOString()})`,
      content: encodeBase64Utf8(JSON.stringify(entryIds, null, 2)),
      branch,
    };

    if (sha) body.sha = sha;

    const response = await fetchImpl(fileUrl, {
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
      cachedListShas.set(name, payload?.content?.sha ?? sha);
      return;
    }

    if (response.status === 409 && attempt < 2) {
      const latest = await getRemoteListFile(name);
      await putRemoteListFile(name, entryIds, latest.sha, attempt + 1);
      return;
    }

    const message = await response.text();
    throw new Error(`GitHub write list failed (${response.status}): ${message}`);
  }

  async function deleteRemoteListFile(name) {
    const fileUrl = `${listsBaseUrl}/${encodeURIComponent(`${name}.json`)}`;
    const remote = await getRemoteListFile(name);
    if (!remote.exists) return;

    const response = await fetchImpl(fileUrl, {
      method: 'DELETE',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: `Delete custom list "${name}" (${new Date().toISOString()})`,
        sha: remote.sha,
        branch,
      }),
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(`GitHub delete list failed (${response.status}): ${message}`);
    }

    cachedListShas.delete(name);
  }

  async function getRemoteListNames() {
    const response = await fetchImpl(`${listsBaseUrl}?ref=${encodeURIComponent(branch)}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
      },
    });

    if (response.status === 404) {
      return [];
    }

    if (!response.ok) {
      const message = await response.text();
      throw new Error(`GitHub list files failed (${response.status}): ${message}`);
    }

    const payload = await response.json();
    if (!Array.isArray(payload)) return [];

    return payload
      .filter((f) => f.type === 'file' && f.name.endsWith('.json'))
      .map((f) => f.name.slice(0, -5));
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
    async readLists() {
      return getRemoteListNames();
    },
    async readList(name) {
      const remote = await getRemoteListFile(name);
      return remote.entries;
    },
    async writeList(name, entryIds) {
      const sha = cachedListShas.get(name) ?? null;
      if (sha === null) {
        const remote = await getRemoteListFile(name);
        await putRemoteListFile(name, entryIds, remote.sha);
        return;
      }

      await putRemoteListFile(name, entryIds, sha);
    },
    async deleteList(name) {
      await deleteRemoteListFile(name);
    },
    async listExists(name) {
      const remote = await getRemoteListFile(name);
      return remote.exists;
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
