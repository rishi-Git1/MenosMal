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

export async function addEntriesBulk(entries) {
  const payload = entries.map((entry) => ({
    title: (entry.title ?? '').trim(),
    rating: Number(entry.rating),
  }));

  const response = await fetch('/api/entries/bulk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entries: payload }),
  });

  if (!response.ok) {
    throw new Error('Failed to bulk add entries.');
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

export async function getCustomLists() {
  const response = await fetch('/api/lists');
  if (!response.ok) {
    throw new Error('Failed to load custom lists.');
  }
  return response.json();
}

export async function createCustomList(name) {
  const response = await fetch('/api/lists', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: name.trim() }),
  });

  if (!response.ok) {
    throw new Error('Failed to create custom list.');
  }

  return response.json();
}

export async function renameCustomList(oldName, newName) {
  const response = await fetch(`/api/lists/${encodeURIComponent(oldName)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: newName.trim() }),
  });

  if (!response.ok) {
    throw new Error('Failed to rename custom list.');
  }

  return response.json();
}

export async function deleteCustomList(name) {
  const response = await fetch(`/api/lists/${encodeURIComponent(name)}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    throw new Error('Failed to delete custom list.');
  }
}

export async function getCustomList(name) {
  const response = await fetch(`/api/lists/${encodeURIComponent(name)}`);

  if (!response.ok) {
    throw new Error('Failed to load custom list.');
  }

  return response.json();
}

export async function addEntryToList(listName, entryId) {
  const response = await fetch(
    `/api/lists/${encodeURIComponent(listName)}/entries/${encodeURIComponent(entryId)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }
  );

  if (!response.ok) {
    throw new Error('Failed to add entry to list.');
  }

  return response.json();
}

export async function removeEntryFromList(listName, entryId) {
  const response = await fetch(
    `/api/lists/${encodeURIComponent(listName)}/entries/${encodeURIComponent(entryId)}`,
    {
      method: 'DELETE',
    }
  );

  if (!response.ok) {
    throw new Error('Failed to remove entry from list.');
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
