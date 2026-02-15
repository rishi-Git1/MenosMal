import { addEntry, readEntries, updateEntry, deleteEntry } from './storage.js';

const form = document.getElementById('quick-add-form');
const entriesBody = document.getElementById('entries');
const emptyState = document.getElementById('empty-state');
const searchInput = document.getElementById('search');
const sortSelect = document.getElementById('sort');
const dialog = document.getElementById('edit-dialog');
const editForm = document.getElementById('edit-form');
const cancelEdit = document.getElementById('cancel-edit');

let allEntries = [];

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

function render() {
  const entries = getVisibleEntries();
  entriesBody.innerHTML = '';
  emptyState.style.display = entries.length ? 'none' : 'block';

  for (const entry of entries) {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${entry.title}</td>
      <td>${entry.rating.toFixed(1)}/10</td>
      <td class="row">
        <button class="secondary" data-action="edit" data-id="${entry.id}">Edit</button>
        <button class="danger" data-action="delete" data-id="${entry.id}">Delete</button>
      </td>
    `;
    entriesBody.appendChild(row);
  }
}

async function refreshEntries() {
  try {
    allEntries = await readEntries();
    render();
  } catch (error) {
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
    await addEntry({ title, rating });
    form.reset();
    await refreshEntries();
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
      await refreshEntries();
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
    await updateEntry(id, { title, rating });
    dialog.close();
    await refreshEntries();
  } catch {
    alert('Could not save entry. Please try again.');
  }
});

cancelEdit.addEventListener('click', () => dialog.close());

searchInput.addEventListener('input', render);
sortSelect.addEventListener('change', render);

refreshEntries();
