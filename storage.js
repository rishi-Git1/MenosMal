export async function readEntries() {
  const response = await fetch('/api/entries');
  if (!response.ok) {
    throw new Error('Failed to load entries.');
  }
  return response.json();
}

export async function addEntry({ title, rating }) {
  const response = await fetch('/api/entries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: title.trim(), rating: Number(rating) }),
  });

  if (!response.ok) {
    throw new Error('Failed to add entry.');
  }

  return response.json();
}

export async function updateEntry(id, updates) {
  const response = await fetch(`/api/entries/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: (updates.title ?? '').trim(),
      rating: Number(updates.rating),
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to update entry.');
  }

  return response.json();
}

export async function deleteEntry(id) {
  const response = await fetch(`/api/entries/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    throw new Error('Failed to delete entry.');
  }
}

export function parseBulkImport(text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const parsed = [];
  const issues = [];

  if (lines.length % 2 !== 0) {
    issues.push('Uneven lines detected. Last item may be incomplete.');
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
