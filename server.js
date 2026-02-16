import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { createStorageFromEnv } from './persistence.js';

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

const storage = createStorageFromEnv();
const CANONICAL_HOST = process.env.CANONICAL_HOST?.trim().toLowerCase() || '';
const ENFORCE_HTTPS = process.env.ENFORCE_HTTPS === 'true';

async function readEntries() {
  return storage.readEntries();
}

async function writeEntries(entries) {
  return storage.writeEntries(entries);
}

async function readLists() {
  return storage.readLists();
}

async function readList(name) {
  return storage.readList(name);
}

async function writeList(name, entryIds) {
  return storage.writeList(name, entryIds);
}

async function deleteList(name) {
  return storage.deleteList(name);
}

async function listExists(name) {
  return storage.listExists(name);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';

    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error('Request body too large'));
      }
    });

    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });

    req.on('error', reject);
  });
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function isValidEntryPayload(payload) {
  const { title, rating } = normalizeEntryPayload(payload);

  if (!title) return false;
  if (Number.isNaN(rating) || rating < 0 || rating > 10) return false;

  return true;
}

function normalizeEntryPayload(payload) {
  const title = typeof payload.title === 'string' ? payload.title.trim() : '';
  const rating = Number(payload.rating);
  return { title, rating };
}


function getRequestHost(req) {
  return (req.headers.host ?? '').toString().toLowerCase();
}

function getForwardedProto(req) {
  return (req.headers['x-forwarded-proto'] ?? '').toString().toLowerCase();
}

function maybeRedirectToCanonical(req, res) {
  if (!CANONICAL_HOST) return false;

  const host = getRequestHost(req);
  const isWrongHost = host && host !== CANONICAL_HOST;
  const needsHttps = ENFORCE_HTTPS && getForwardedProto(req) && getForwardedProto(req) !== 'https';

  if (!isWrongHost && !needsHttps) return false;

  const targetHost = CANONICAL_HOST;
  const targetPath = req.url ?? '/';
  const redirectLocation = `https://${targetHost}${targetPath}`;

  res.writeHead(308, { Location: redirectLocation });
  res.end();
  return true;
}

async function handleApi(req, res) {
  const method = req.method ?? 'GET';
  const url = new URL(req.url ?? '/', 'http://localhost');

  if (url.pathname === '/api/entries' && method === 'GET') {
    const entries = await readEntries();
    sendJson(res, 200, entries);
    return true;
  }

  if (url.pathname === '/api/entries' && method === 'POST') {
    const payload = await readJsonBody(req);
    if (!isValidEntryPayload(payload)) {
      sendJson(res, 400, { error: 'Title and rating (0-10) are required.' });
      return true;
    }

    const entries = await readEntries();
    const now = new Date().toISOString();
    const created = {
      id: randomUUID(),
      title: payload.title.trim(),
      rating: Number(payload.rating),
      createdAt: now,
      updatedAt: now,
    };

    entries.push(created);
    await writeEntries(entries);
    sendJson(res, 201, created);
    return true;
  }


  if (url.pathname === '/api/entries/bulk' && method === 'POST') {
    const payload = await readJsonBody(req);
    const items = Array.isArray(payload.entries) ? payload.entries : [];

    if (!items.length) {
      sendJson(res, 400, { error: 'At least one entry is required.' });
      return true;
    }

    const invalidIndex = items.findIndex((item) => !isValidEntryPayload(item));
    if (invalidIndex !== -1) {
      sendJson(res, 400, { error: `Invalid entry at index ${invalidIndex}.` });
      return true;
    }

    const entries = await readEntries();
    const now = new Date().toISOString();
    const created = items.map((item) => {
      const normalized = normalizeEntryPayload(item);
      return {
        id: randomUUID(),
        title: normalized.title,
        rating: normalized.rating,
        createdAt: now,
        updatedAt: now,
      };
    });

    entries.push(...created);
    await writeEntries(entries);
    sendJson(res, 201, created);
    return true;
  }

  if (url.pathname.startsWith('/api/entries/') && method === 'PUT') {
    const id = decodeURIComponent(url.pathname.replace('/api/entries/', ''));
    const payload = await readJsonBody(req);
    if (!isValidEntryPayload(payload)) {
      sendJson(res, 400, { error: 'Title and rating (0-10) are required.' });
      return true;
    }

    const entries = await readEntries();
    const index = entries.findIndex((entry) => entry.id === id);

    if (index === -1) {
      sendJson(res, 404, { error: 'Entry not found.' });
      return true;
    }

    const updated = {
      ...entries[index],
      title: payload.title.trim(),
      rating: Number(payload.rating),
      updatedAt: new Date().toISOString(),
    };

    entries[index] = updated;
    await writeEntries(entries);
    sendJson(res, 200, updated);
    return true;
  }

  if (url.pathname.startsWith('/api/entries/') && method === 'DELETE') {
    const id = decodeURIComponent(url.pathname.replace('/api/entries/', ''));
    const entries = await readEntries();
    const next = entries.filter((entry) => entry.id !== id);

    if (next.length === entries.length) {
      sendJson(res, 404, { error: 'Entry not found.' });
      return true;
    }

    await writeEntries(next);
    res.writeHead(204);
    res.end();
    return true;
  }

  if (url.pathname === '/api/health' && method === 'GET') {
    sendJson(res, 200, { status: 'ok' });
    return true;
  }

  if (url.pathname === '/api/lists' && method === 'GET') {
    try {
      const listNames = await readLists();
      const entries = await readEntries();
      const lists = await Promise.all(
        listNames.map(async (name) => {
          const entryIds = await readList(name);
          return {
            name,
            count: entryIds.length,
          };
        })
      );
      sendJson(res, 200, lists);
    } catch (err) {
      sendJson(res, 500, { error: err.message || 'Failed to read lists' });
    }
    return true;
  }

  if (url.pathname === '/api/lists' && method === 'POST') {
    try {
      const payload = await readJsonBody(req);
      const name = typeof payload.name === 'string' ? payload.name.trim() : '';

      if (!name) {
        sendJson(res, 400, { error: 'List name is required.' });
        return true;
      }

      const exists = await listExists(name);
      if (exists) {
        sendJson(res, 400, { error: 'List already exists.' });
        return true;
      }

      await writeList(name, []);
      sendJson(res, 201, { name, count: 0 });
    } catch (err) {
      sendJson(res, 500, { error: err.message || 'Failed to create list' });
    }
    return true;
  }

  if (url.pathname.startsWith('/api/lists/') && method === 'GET') {
    try {
      const pathname = url.pathname.replace('/api/lists/', '');
      const name = decodeURIComponent(pathname);

      const exists = await listExists(name);
      if (!exists) {
        sendJson(res, 404, { error: 'List not found.' });
        return true;
      }

      const entryIds = await readList(name);
      sendJson(res, 200, { name, entryIds });
    } catch (err) {
      sendJson(res, 500, { error: err.message || 'Failed to read list' });
    }
    return true;
  }

  if (url.pathname.startsWith('/api/lists/') && method === 'PUT') {
    try {
      const pathname = url.pathname.replace('/api/lists/', '');
      const oldName = decodeURIComponent(pathname);
      const payload = await readJsonBody(req);
      const newName = typeof payload.name === 'string' ? payload.name.trim() : '';

      if (!newName) {
        sendJson(res, 400, { error: 'New list name is required.' });
        return true;
      }

      const exists = await listExists(oldName);
      if (!exists) {
        sendJson(res, 404, { error: 'List not found.' });
        return true;
      }

      const newExists = await listExists(newName);
      if (newExists && oldName !== newName) {
        sendJson(res, 400, { error: 'List with new name already exists.' });
        return true;
      }

      const entryIds = await readList(oldName);
      await writeList(newName, entryIds);
      if (oldName !== newName) {
        await deleteList(oldName);
      }

      sendJson(res, 200, { name: newName, count: entryIds.length });
    } catch (err) {
      sendJson(res, 500, { error: err.message || 'Failed to rename list' });
    }
    return true;
  }

  if (url.pathname.startsWith('/api/lists/') && method === 'DELETE') {
    try {
      const pathname = url.pathname.replace('/api/lists/', '');
      const name = decodeURIComponent(pathname);

      const exists = await listExists(name);
      if (!exists) {
        sendJson(res, 404, { error: 'List not found.' });
        return true;
      }

      await deleteList(name);
      res.writeHead(204);
      res.end();
    } catch (err) {
      sendJson(res, 500, { error: err.message || 'Failed to delete list' });
    }
    return true;
  }

  if (url.pathname.match(/^\/api\/lists\/[^/]+\/entries\/[^/]+$/) && method === 'POST') {
    try {
      const parts = url.pathname.split('/');
      const listName = decodeURIComponent(parts[3]);
      const entryId = decodeURIComponent(parts[5]);

      const exists = await listExists(listName);
      if (!exists) {
        sendJson(res, 404, { error: 'List not found.' });
        return true;
      }

      const entryIds = await readList(listName);
      if (!entryIds.includes(entryId)) {
        entryIds.push(entryId);
        await writeList(listName, entryIds);
      }

      sendJson(res, 200, { name: listName, entryIds });
    } catch (err) {
      sendJson(res, 500, { error: err.message || 'Failed to add entry to list' });
    }
    return true;
  }

  if (url.pathname.match(/^\/api\/lists\/[^/]+\/entries\/[^/]+$/) && method === 'DELETE') {
    try {
      const parts = url.pathname.split('/');
      const listName = decodeURIComponent(parts[3]);
      const entryId = decodeURIComponent(parts[5]);

      const exists = await listExists(listName);
      if (!exists) {
        sendJson(res, 404, { error: 'List not found.' });
        return true;
      }

      const entryIds = await readList(listName);
      const next = entryIds.filter((id) => id !== entryId);
      await writeList(listName, next);

      res.writeHead(204);
      res.end();
    } catch (err) {
      sendJson(res, 500, { error: err.message || 'Failed to remove entry from list' });
    }
    return true;
  }

  return false;
}

async function handleStatic(req, res) {
  const urlPath = (req.url === '/' ? '/index.html' : req.url) ?? '/index.html';
  const pathname = decodeURIComponent(urlPath.split('?')[0]);
  const safePath = normalize(pathname).replace(/^([.][.][/\\])+/, '');
  const filePath = join(process.cwd(), safePath);
  const content = await readFile(filePath);

  res.writeHead(200, { 'Content-Type': mime[extname(filePath)] ?? 'application/octet-stream' });
  res.end(content);
}

const server = createServer(async (req, res) => {
  try {
    if (maybeRedirectToCanonical(req, res)) {
      return;
    }

    if ((req.url ?? '').startsWith('/api/')) {
      const handled = await handleApi(req, res);
      if (!handled) sendJson(res, 404, { error: 'Not found' });
      return;
    }

    await handleStatic(req, res);
  } catch (error) {
    if ((req.url ?? '').startsWith('/api/')) {
      sendJson(res, 500, { error: error.message || 'Server error' });
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
});

const port = Number(process.env.PORT) || 3000;
server.listen(port, () => console.log(`MenosMal running at http://localhost:${port}`));
