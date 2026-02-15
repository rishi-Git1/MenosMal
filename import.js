import { addEntriesBulk, parseBulkImport } from './storage.js';

const textArea = document.getElementById('bulk-text');
const previewBtn = document.getElementById('preview-btn');
const importBtn = document.getElementById('import-btn');
const previewList = document.getElementById('preview-list');
const issuesList = document.getElementById('issues-list');

let latestPreview = { parsed: [], issues: [] };

function renderPreview() {
  previewList.innerHTML = '';
  issuesList.innerHTML = '';

  if (!latestPreview.parsed.length) {
    previewList.innerHTML = "<li class='muted'>No valid entries parsed yet.</li>";
  } else {
    for (const entry of latestPreview.parsed) {
      const li = document.createElement('li');
      li.textContent = `${entry.title} — ${entry.rating.toFixed(1)}/10`;
      previewList.appendChild(li);
    }
  }

  if (!latestPreview.issues.length) {
    issuesList.innerHTML = "<li class='muted'>No issues found.</li>";
  } else {
    for (const issue of latestPreview.issues) {
      const li = document.createElement('li');
      li.textContent = issue;
      issuesList.appendChild(li);
    }
  }
}

previewBtn.addEventListener('click', () => {
  latestPreview = parseBulkImport(textArea.value);
  renderPreview();
});

importBtn.addEventListener('click', async () => {
  latestPreview = parseBulkImport(textArea.value);

  try {
    if (!latestPreview.parsed.length) {
      renderPreview();
      return;
    }

    await addEntriesBulk(latestPreview.parsed);
    renderPreview();
    alert(`Imported ${latestPreview.parsed.length} entries.`);
  } catch {
    alert('Import failed while saving to server. Please try again.');
  }
});

renderPreview();
