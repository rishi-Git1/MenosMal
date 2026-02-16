import {
  readEntries,
  getCustomLists,
  createCustomList,
  renameCustomList,
  deleteCustomList,
  getCustomList,
  addEntryToList,
  removeEntryFromList,
} from './storage.js';

const createListForm = document.getElementById('create-list-form');
const newListNameInput = document.getElementById('new-list-name');
const listsContainer = document.getElementById('lists-container');
const emptyListsState = document.getElementById('empty-lists-state');

const renameDialog = document.getElementById('rename-dialog');
const renameForm = document.getElementById('rename-form');
const renameCancelBtn = document.getElementById('cancel-rename');
const renameOldInput = document.getElementById('rename-list-old');
const renameNewInput = document.getElementById('rename-list-new');

const addEntryDialog = document.getElementById('add-entry-dialog');
const addEntryForm = document.getElementById('add-entry-form');
const addEntryCancelBtn = document.getElementById('cancel-add-entry');
const addEntryListName = document.getElementById('add-entry-list-name');
const addEntrySearch = document.getElementById('add-entry-search');
const entrySuggestions = document.getElementById('entry-suggestions');

const entriesSection = document.getElementById('entries-section');
const entriesTable = document.getElementById('entries-table');
const entriesBody = document.getElementById('entries');
const ratingHeader = document.getElementById('rating-header');
const showRatingsCheckbox = document.getElementById('show-ratings');
const searchInput = document.getElementById('search');

let allLists = [];
let allEntries = [];
let allEntriesById = new Map();
let currentExpandedList = null;
let currentListEntries = [];
let searchDebounceTimer = null;

const DEBOUNCE_MS = 300;

function initializeApp() {
  loadLists();
}

async function loadLists() {
  try {
    allLists = await getCustomLists();
    allEntries = await readEntries();
    allEntriesById = new Map(allEntries.map((e) => [e.id, e]));
    renderListAccordion();
  } catch (error) {
    console.error('Failed to load lists:', error);
    emptyListsState.textContent = 'Unable to load lists. Try refreshing.';
  }
}

function renderListAccordion() {
  listsContainer.innerHTML = '';

  if (!allLists.length) {
    emptyListsState.style.display = 'block';
    return;
  }

  emptyListsState.style.display = 'none';

  allLists.forEach((list) => {
    const card = document.createElement('div');
    card.className = 'list-accordion-card';
    card.dataset.listName = list.name;

    const header = document.createElement('div');
    header.className = 'list-accordion-header';

    const titleSpan = document.createElement('span');
    titleSpan.className = 'list-title';
    titleSpan.textContent = `${list.name} (${list.count})`;

    const expandBtn = document.createElement('button');
    expandBtn.type = 'button';
    expandBtn.className = 'expand-btn secondary';
    expandBtn.textContent = '▼';
    expandBtn.dataset.action = 'expand';
    expandBtn.dataset.listName = list.name;

    header.appendChild(titleSpan);
    header.appendChild(expandBtn);

    card.appendChild(header);

    const content = document.createElement('div');
    content.className = 'list-accordion-content';
    content.style.display = 'none';

    const actions = document.createElement('div');
    actions.className = 'list-actions';

    const renameBtn = document.createElement('button');
    renameBtn.type = 'button';
    renameBtn.className = 'secondary';
    renameBtn.dataset.action = 'rename';
    renameBtn.dataset.listName = list.name;
    renameBtn.textContent = 'Rename';

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'danger';
    deleteBtn.dataset.action = 'delete';
    deleteBtn.dataset.listName = list.name;
    deleteBtn.textContent = 'Delete';

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'secondary';
    addBtn.dataset.action = 'add-entry';
    addBtn.dataset.listName = list.name;
    addBtn.textContent = 'Add Entry';

    actions.appendChild(renameBtn);
    actions.appendChild(deleteBtn);
    actions.appendChild(addBtn);

    content.appendChild(actions);

    card.appendChild(content);
    listsContainer.appendChild(card);
  });
}

function getVisibleEntries() {
  const query = searchInput.value.trim().toLowerCase();
  return currentListEntries.filter((entryId) => {
    const entry = allEntriesById.get(entryId);
    if (!entry) return false;
    return entry.title.toLowerCase().includes(query);
  });
}

function renderEntriesTable() {
  const entries = getVisibleEntries();
  entriesBody.innerHTML = '';

  for (const entryId of entries) {
    const entry = allEntriesById.get(entryId);
    if (!entry) continue;

    const row = document.createElement('tr');

    const titleCell = document.createElement('td');
    titleCell.textContent = entry.title;
    row.appendChild(titleCell);

    if (showRatingsCheckbox.checked) {
      const ratingCell = document.createElement('td');
      ratingCell.textContent = `${entry.rating.toFixed(1)}/10`;
      row.appendChild(ratingCell);
    }

    const actionsCell = document.createElement('td');
    actionsCell.className = 'row actions-cell';
    row.appendChild(actionsCell);

    entriesBody.appendChild(row);
  }
}

function updateRatingHeaderVisibility() {
  ratingHeader.style.display = showRatingsCheckbox.checked ? 'table-cell' : 'none';
  renderEntriesTable();
}

function expandList(listName) {
  try {
    const card = listsContainer.querySelector(`[data-list-name="${CSS.escape(listName)}"]`);
    if (!card) return;

    const content = card.querySelector('.list-accordion-content');
    const expandBtn = card.querySelector('.expand-btn');

    if (content.style.display !== 'none') {
      content.style.display = 'none';
      expandBtn.textContent = '▼';
      entriesSection.style.display = 'none';
      currentExpandedList = null;
      currentListEntries = [];
      return;
    }

    currentExpandedList = listName;
    
    // Fetch the full list data with entry IDs
    getCustomList(listName)
      .then((listData) => {
        currentListEntries = listData.entryIds || [];
        renderEntriesTable();
        searchInput.value = '';
      })
      .catch((error) => {
        console.error('Failed to expand list:', error);
        alert('Could not expand list. Please try again.');
        currentExpandedList = null;
        content.style.display = 'none';
        expandBtn.textContent = '▼';
        entriesSection.style.display = 'none';
      });

    content.style.display = 'block';
    expandBtn.textContent = '▲';
    entriesSection.style.display = 'block';
  } catch (error) {
    console.error('Failed to expand list:', error);
  }
}

function collapseAllLists() {
  listsContainer.querySelectorAll('.list-accordion-content').forEach((content) => {
    content.style.display = 'none';
  });
  listsContainer.querySelectorAll('.expand-btn').forEach((btn) => {
    btn.textContent = '▼';
  });
  entriesSection.style.display = 'none';
  currentExpandedList = null;
  currentListEntries = [];
}

createListForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = newListNameInput.value.trim();
  if (!name) return;

  try {
    await createCustomList(name);
    newListNameInput.value = '';
    await loadLists();
  } catch (error) {
    alert('Could not create list. Please try again.');
  }
});

listsContainer.addEventListener('click', async (event) => {
  const btn = event.target.closest('button');
  if (!btn) return;

  const action = btn.dataset.action;
  const listName = btn.dataset.listName;

  if (action === 'expand') {
    expandList(listName);
    return;
  }

  if (action === 'rename') {
    renameOldInput.value = listName;
    renameNewInput.value = listName;
    renameDialog.showModal();
    return;
  }

  if (action === 'delete') {
    if (!confirm(`Are you sure you want to delete "${listName}"?`)) return;

    try {
      await deleteCustomList(listName);
      await loadLists();
    } catch (error) {
      alert('Could not delete list. Please try again.');
    }
    return;
  }

  if (action === 'add-entry') {
    addEntryListName.value = listName;
    addEntrySearch.value = '';
    entrySuggestions.innerHTML = '';
    addEntryDialog.showModal();
    return;
  }
});

entriesBody.addEventListener('click', async (event) => {
  const btn = event.target.closest('button');
  if (!btn) return;

  // No remove functionality for custom list entries
});

renameForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const oldName = renameOldInput.value;
  const newName = renameNewInput.value.trim();
  if (!newName) return;

  try {
    await renameCustomList(oldName, newName);
    renameDialog.close();
    await loadLists();
  } catch (error) {
    alert('Could not rename list. Please try again.');
  }
});

renameCancelBtn.addEventListener('click', () => renameDialog.close());

addEntryForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  addEntryDialog.close();
});

addEntryCancelBtn.addEventListener('click', () => addEntryDialog.close());

addEntrySearch.addEventListener('input', () => {
  const query = addEntrySearch.value.trim().toLowerCase();
  entrySuggestions.innerHTML = '';

  if (!query) return;

  const currentList = allLists.find((l) => l.name === addEntryListName.value);
  const currentListIds = [];

  const matches = allEntries
    .filter(
      (entry) =>
        entry.title.toLowerCase().includes(query) && !currentListIds.includes(entry.id)
    )
    .slice(0, 10);

  matches.forEach((entry) => {
    const item = document.createElement('div');
    item.className = 'suggestion-item';

    const title = document.createElement('span');
    title.textContent = entry.title;

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'secondary';
    addBtn.textContent = 'Add';

    addBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        const listName = addEntryListName.value;
        await addEntryToList(listName, entry.id);

        const list = allLists.find((l) => l.name === listName);
        if (list) {
          if (!list.entryIds) list.entryIds = [];
          if (!list.entryIds.includes(entry.id)) {
            list.entryIds.push(entry.id);
            list.count++;
          }
        }

        if (currentExpandedList === listName) {
          currentListEntries.push(entry.id);
          renderEntriesTable();
        }

        renderListAccordion();
        addEntrySearch.value = '';
        entrySuggestions.innerHTML = '';
      } catch (error) {
        alert('Could not add entry. Please try again.');
      }
    });

    item.appendChild(title);
    item.appendChild(addBtn);
    entrySuggestions.appendChild(item);
  });
});

showRatingsCheckbox.addEventListener('change', updateRatingHeaderVisibility);
searchInput.addEventListener('input', () => {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    renderEntriesTable();
  }, DEBOUNCE_MS);
});

initializeApp();
