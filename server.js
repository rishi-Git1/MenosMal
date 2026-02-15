import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

const DATA_DIR = join(process.cwd(), 'data');
const DATA_FILE = join(DATA_DIR, 'entries.json');

async function ensureDataFile() {
  await mkdir(DATA_DIR, { recursive: true });
  try {
    await access(DATA_FILE);
  } catch {
    await writeFile(DATA_FILE, '[]', 'utf8');
  }
}

async function readEntries() {
  await ensureDataFile();
  const raw = await readFile(DATA_FILE, 'utf8');
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [];
}

async function writeEntries(entries) {
  await ensureDataFile();
  await writeFile(DATA_FILE, JSON.stringify(entries, null, 2), 'utf8');
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
  const title = typeof payload.title === 'string' ? payload.title.trim() : '';
  const rating = Number(payload.rating);

  if (!title) return false;
  if (Number.isNaN(rating) || rating < 0 || rating > 10) return false;

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
