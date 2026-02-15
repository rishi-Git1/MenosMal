const KEY = "menosmal.anime.entries.v1";

export function readEntries() {
  const raw = localStorage.getItem(KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeEntries(entries) {
  localStorage.setItem(KEY, JSON.stringify(entries));
}

export function addEntry({ title, rating }) {
  const entries = readEntries();
  const now = new Date().toISOString();
  entries.push({
    id: crypto.randomUUID(),
    title: title.trim(),
    rating: Number(rating),
    createdAt: now,
    updatedAt: now,
  });
  writeEntries(entries);
}

export function updateEntry(id, updates) {
  const entries = readEntries();
  const next = entries.map((entry) =>
    entry.id === id
      ? {
          ...entry,
          ...updates,
          rating: Number(updates.rating ?? entry.rating),
          title: (updates.title ?? entry.title).trim(),
          updatedAt: new Date().toISOString(),
        }
      : entry,
  );
  writeEntries(next);
}

export function deleteEntry(id) {
  const entries = readEntries();
  writeEntries(entries.filter((entry) => entry.id !== id));
}

export function parseBulkImport(text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const parsed = [];
  const issues = [];

  if (lines.length % 2 !== 0) {
    issues.push("Uneven lines detected. Last item may be incomplete.");
  }

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
