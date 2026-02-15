import { addEntry, readEntries, updateEntry, deleteEntry } from './storage.js';

const form = document.getElementById('quick-add-form');
const entriesBody = document.getElementById('entries');
const emptyState = document.getElementById('empty-state');
const searchInput = document.getElementById('search');
const sortSelect = document.getElementById('sort');
const toggleMinimizedButton = document.getElementById('toggle-minimized');
const dialog = document.getElementById('edit-dialog');
const editForm = document.getElementById('edit-form');
const cancelEdit = document.getElementById('cancel-edit');

let allEntries = [];
let isMinimized = false;
const coverCache = new Map();
const coverInFlight = new Set();

function getVisibleEntries() {
  const query = searchInput.value.trim().toLowerCase();
  const sort = sortSelect.value;

  const filtered = allEntries.filter((entry) => entry.title.toLowerCase().includes(query));

  filtered.sort((a, b) => {
    if (sort === 'rating_desc') return b.rating - a.rating;
    if (sort === 'title_asc') return a.title.localeCompare(b.title);
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  return filtered;
}

async function loadCoverArt(title) {
  if (!title || coverCache.has(title) || coverInFlight.has(title)) return;

  coverInFlight.add(title);
  try {
    const response = await fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(title)}&limit=1`);
    if (!response.ok) {
      coverCache.set(title, null);
      return;
    }

    const payload = await response.json();
    const first = payload?.data?.[0];
    const imageUrl = first?.images?.jpg?.image_url ?? first?.images?.webp?.image_url ?? null;
    coverCache.set(title, imageUrl);
  } catch {
    coverCache.set(title, null);
  } finally {
    coverInFlight.delete(title);
    render();
  }
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
  actionsCell.className = 'row';

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

    if (!isMinimized) {
      loadCoverArt(entry.title);
    }
  }
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
    allEntries.unshift(created);
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

  if (action === 'edit') {
    const entry = allEntries.find((item) => item.id === id);
    if (!entry) return;
    document.getElementById('edit-id').value = entry.id;
    document.getElementById('edit-title').value = entry.title;
    document.getElementById('edit-rating').value = entry.rating;
    dialog.showModal();
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
    dialog.close();
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

cancelEdit.addEventListener('click', () => dialog.close());

searchInput.addEventListener('input', render);
sortSelect.addEventListener('change', render);

refreshEntries();
