import { addEntry, readEntries, updateEntry, deleteEntry } from './storage.js';

const form = document.getElementById('quick-add-form');
const entriesBody = document.getElementById('entries');
const emptyState = document.getElementById('empty-state');
const searchInput = document.getElementById('search');
const sortSelect = document.getElementById('sort');
const sortReverse = document.getElementById('sort-reverse');
const toggleMinimizedButton = document.getElementById('toggle-minimized');

const editDialog = document.getElementById('edit-dialog');
const editForm = document.getElementById('edit-form');
const cancelEdit = document.getElementById('cancel-edit');

const infoDialog = document.getElementById('info-dialog');
const infoTitle = document.getElementById('info-title');
const infoRelease = document.getElementById('info-release');
const infoGenres = document.getElementById('info-genres');
const infoDescription = document.getElementById('info-description');
const closeInfo = document.getElementById('close-info');

let allEntries = [];
let isMinimized = false;

const coverCache = new Map();
const animeInfoCache = new Map();
const animeInfoInFlight = new Map();

function getCreatedTimestamp(entry) {
  const parsed = Date.parse(entry.createdAt ?? entry.updatedAt ?? '');
  return Number.isNaN(parsed) ? 0 : parsed;
}

function getVisibleEntries() {
  const query = searchInput.value.trim().toLowerCase();
  const sort = sortSelect.value;
  const reverse = sortReverse.checked;

  const filtered = allEntries.filter((entry) => entry.title.toLowerCase().includes(query));
  const indexById = new Map(allEntries.map((entry, index) => [entry.id, index]));

  filtered.sort((a, b) => {
    let direction = 0;

    if (sort === 'rating_desc') {
      direction = b.rating - a.rating;
      if (direction === 0) direction = a.title.localeCompare(b.title);
    } else if (sort === 'title_asc') {
      direction = a.title.localeCompare(b.title);
    } else {
      direction = getCreatedTimestamp(b) - getCreatedTimestamp(a);
      if (direction === 0) {
        direction = (indexById.get(b.id) ?? 0) - (indexById.get(a.id) ?? 0);
      }
    }

    return reverse ? -direction : direction;
  });

  return filtered;
}

function formatReleaseDate(anime) {
  const from = anime?.aired?.from;
  if (from) {
    const date = new Date(from);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    }
  }

  if (anime?.year) return String(anime.year);
  return 'Unknown';
}

function normalizeAnimeInfo(title, anime) {
  const imageUrl = anime?.images?.jpg?.image_url ?? anime?.images?.webp?.image_url ?? null;
  return {
    title,
    releaseDate: formatReleaseDate(anime),
    synopsis: anime?.synopsis?.trim() || 'No description available.',
    genres: Array.isArray(anime?.genres) ? anime.genres.map((genre) => genre?.name).filter(Boolean) : [],
    imageUrl,
  };
}

async function fetchAnimeInfo(title) {
  if (!title) return null;
  if (animeInfoCache.has(title)) return animeInfoCache.get(title);
  if (animeInfoInFlight.has(title)) return animeInfoInFlight.get(title);

  const promise = (async () => {
    try {
      const response = await fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(title)}&limit=1`);
      if (!response.ok) {
        const fallback = normalizeAnimeInfo(title, null);
        animeInfoCache.set(title, fallback);
        coverCache.set(title, null);
        return fallback;
      }

      const payload = await response.json();
      const first = payload?.data?.[0] ?? null;
      const info = normalizeAnimeInfo(title, first);
      animeInfoCache.set(title, info);
      coverCache.set(title, info.imageUrl);
      return info;
    } catch {
      const fallback = normalizeAnimeInfo(title, null);
      animeInfoCache.set(title, fallback);
      coverCache.set(title, null);
      return fallback;
    } finally {
      animeInfoInFlight.delete(title);
    }
  })();

  animeInfoInFlight.set(title, promise);
  return promise;
}

function createTitleCell(entry) {
  const titleCell = document.createElement('td');

  if (isMinimized) {
    titleCell.textContent = entry.title;
    return titleCell;
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'title-cell';

  const coverImage = document.createElement('img');
  coverImage.className = 'cover-art';
  coverImage.alt = `${entry.title} cover art`;

  const cover = coverCache.get(entry.title);
  if (cover) {
    coverImage.src = cover;
  } else {
    coverImage.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="52" height="72"><rect width="100%" height="100%" fill="%232a2a2a"/></svg>';
  }

  const titleText = document.createElement('span');
  titleText.textContent = entry.title;

  wrapper.appendChild(coverImage);
  wrapper.appendChild(titleText);
  titleCell.appendChild(wrapper);

  return titleCell;
}

function createActionsCell(entry) {
  const actionsCell = document.createElement('td');
  actionsCell.className = 'row actions-cell';

  const infoButton = document.createElement('button');
  infoButton.className = 'secondary';
  infoButton.dataset.action = 'info';
  infoButton.dataset.id = entry.id;
  infoButton.textContent = 'Info';

  const editButton = document.createElement('button');
  editButton.className = 'secondary';
  editButton.dataset.action = 'edit';
  editButton.dataset.id = entry.id;
  editButton.textContent = 'Edit';

  const deleteButton = document.createElement('button');
  deleteButton.className = 'danger';
  deleteButton.dataset.action = 'delete';
  deleteButton.dataset.id = entry.id;
  deleteButton.textContent = 'Delete';

  actionsCell.appendChild(infoButton);
  actionsCell.appendChild(editButton);
  actionsCell.appendChild(deleteButton);
  return actionsCell;
}

function render() {
  const entries = getVisibleEntries();
  entriesBody.innerHTML = '';
  emptyState.style.display = entries.length ? 'none' : 'block';

  for (const entry of entries) {
    const row = document.createElement('tr');

    row.appendChild(createTitleCell(entry));

    const ratingCell = document.createElement('td');
    ratingCell.textContent = `${entry.rating.toFixed(1)}/10`;
    row.appendChild(ratingCell);

    row.appendChild(createActionsCell(entry));

    entriesBody.appendChild(row);

  }
}

function showInfoLoading(entry) {
  infoTitle.textContent = entry.title;
  infoRelease.textContent = 'Loading...';
  infoGenres.innerHTML = '<span class="muted">Loading genres...</span>';
  infoDescription.textContent = 'Loading description...';
}

function renderInfo(entry, info) {
  infoTitle.textContent = entry.title;
  infoRelease.textContent = info.releaseDate;
  infoDescription.textContent = info.synopsis;

  infoGenres.innerHTML = '';
  if (!info.genres.length) {
    infoGenres.innerHTML = '<span class="muted">No genres found.</span>';
    return;
  }

  for (const genre of info.genres) {
    const chip = document.createElement('span');
    chip.className = 'genre-chip';
    chip.textContent = genre;
    infoGenres.appendChild(chip);
  }
}

async function openInfoDialog(entry) {
  if (!entry) return;

  showInfoLoading(entry);
  if (!infoDialog.open) infoDialog.showModal();

  const info = await fetchAnimeInfo(entry.title);
  renderInfo(entry, info);
  render();
}

async function refreshEntries() {
  try {
    allEntries = await readEntries();
    render();
  } catch {
    emptyState.style.display = 'block';
    emptyState.textContent = 'Unable to load your list right now. Try refreshing.';
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const title = document.getElementById('add-title').value;
  const rating = document.getElementById('add-rating').value;
  if (!title.trim()) return;

  try {
    const created = await addEntry({ title, rating });
    allEntries.push(created);
    form.reset();
    render();
  } catch {
    alert('Could not add entry. Please try again.');
  }
});

entriesBody.addEventListener('click', async (event) => {
  const button = event.target.closest('button');
  if (!button) return;

  const action = button.dataset.action;
  const id = button.dataset.id;

  if (action === 'delete') {
    try {
      await deleteEntry(id);
      allEntries = allEntries.filter((item) => item.id !== id);
      render();
    } catch {
      alert('Could not delete entry. Please try again.');
    }
    return;
  }

  if (action === 'info') {
    const entry = allEntries.find((item) => item.id === id);
    await openInfoDialog(entry);
    return;
  }

  if (action === 'edit') {
    const entry = allEntries.find((item) => item.id === id);
    if (!entry) return;
    document.getElementById('edit-id').value = entry.id;
    document.getElementById('edit-title').value = entry.title;
    document.getElementById('edit-rating').value = entry.rating;
    editDialog.showModal();
  }
});

editForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const id = document.getElementById('edit-id').value;
  const title = document.getElementById('edit-title').value;
  const rating = Number(document.getElementById('edit-rating').value);

  try {
    const updated = await updateEntry(id, { title, rating });
    allEntries = allEntries.map((item) => (item.id === id ? updated : item));
    editDialog.close();
    render();
  } catch {
    alert('Could not save entry. Please try again.');
  }
});

toggleMinimizedButton.addEventListener('click', () => {
  isMinimized = !isMinimized;
  toggleMinimizedButton.textContent = isMinimized ? 'Expand list' : 'Minimize list';
  render();
});

cancelEdit.addEventListener('click', () => editDialog.close());
closeInfo.addEventListener('click', () => infoDialog.close());

searchInput.addEventListener('input', render);
sortSelect.addEventListener('change', render);
sortReverse.addEventListener('change', render);

refreshEntries();
