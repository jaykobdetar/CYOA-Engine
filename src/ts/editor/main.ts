// CYOA Editor - Main Entry Point

import type { Page, Asset, StoryMetadata, Choice } from '../types';
import { sanitizeFilename, parsePageId, getChildIds, getDescendants, debounce } from '../shared/utils';
import { createEmptyPage, sortPageIds, getPageStats, getTotalStats } from './pages';
import { processUploadedFiles, getAssetIcon, createAssetPreview } from './assets';
import { saveDraft, loadDraft, deleteDraft, getDraftNames, autoSave, loadAutoSave, hasAutoSave, clearAutoSave } from './drafts';
import { createUndoManager, recordEdit, recordDelete, recordCreate, canUndo, canRedo, undo, redo, UndoManager } from './undo';
import { importFromZip, importFromFolderInput } from './import';
import { exportToZip, downloadBlob, preExportCheck } from './export';
import { searchPages, displaySearchResults, createSearchPanel } from './search';
import { createGraphPanel, initGraphPanel } from './graph';

// Application State
interface EditorState {
  pages: Record<string, Page>;
  assets: Record<string, Asset>;
  metadata: StoryMetadata;
  currentPageId: string | null;
  storyName: string;
  hasUnsavedChanges: boolean;
  undoManager: UndoManager;
  searchResults: ReturnType<typeof searchPages>;
  showLineNumbers: boolean;
  spellcheck: boolean;
  theme: 'dark' | 'light';
}

let state: EditorState = {
  pages: {},
  assets: {},
  metadata: { title: '', author: '', description: '' },
  currentPageId: null,
  storyName: 'my-story',
  hasUnsavedChanges: false,
  undoManager: createUndoManager(),
  searchResults: [],
  showLineNumbers: true,
  spellcheck: true,
  theme: 'dark'
};

// DOM Elements
let elements: {
  storyNameInput: HTMLInputElement;
  draftSelect: HTMLSelectElement;
  pageTree: HTMLElement;
  editorEmpty: HTMLElement;
  editorMain: HTMLElement;
  currentPageIdDisplay: HTMLElement;
  pageContent: HTMLTextAreaElement;
  hasChoicesCheckbox: HTMLInputElement;
  isEndingCheckbox: HTMLInputElement;
  choicesSection: HTMLElement;
  choiceInputs: HTMLInputElement[];
  assetsList: HTMLElement;
  assetPreview: HTMLElement;
  lineNumbers: HTMLElement;
  statsBar: HTMLElement;
  saveStatus: HTMLElement;
  deleteModal: HTMLElement;
  searchPanel: HTMLElement | null;
  graphPanel: HTMLElement | null;
};

// Auto-save debounced function
const debouncedAutoSave = debounce(() => {
  if (state.hasUnsavedChanges) {
    autoSave(state.pages, state.assets, state.metadata, state.storyName);
    updateSaveStatus('auto-saved');
  }
}, 30000); // 30 seconds

/**
 * Initialize the editor
 */
export function init(): void {
  // Get DOM elements
  elements = {
    storyNameInput: document.getElementById('story-name') as HTMLInputElement,
    draftSelect: document.getElementById('draft-select') as HTMLSelectElement,
    pageTree: document.getElementById('page-tree') as HTMLElement,
    editorEmpty: document.getElementById('editor-empty') as HTMLElement,
    editorMain: document.getElementById('editor-main') as HTMLElement,
    currentPageIdDisplay: document.getElementById('current-page-id') as HTMLElement,
    pageContent: document.getElementById('page-content') as HTMLTextAreaElement,
    hasChoicesCheckbox: document.getElementById('has-choices') as HTMLInputElement,
    isEndingCheckbox: document.getElementById('is-ending') as HTMLInputElement,
    choicesSection: document.getElementById('choices-section') as HTMLElement,
    choiceInputs: Array.from(document.querySelectorAll('.choice-row input')) as HTMLInputElement[],
    assetsList: document.getElementById('assets-list') as HTMLElement,
    assetPreview: document.getElementById('asset-preview') as HTMLElement,
    lineNumbers: document.getElementById('line-numbers') as HTMLElement,
    statsBar: document.getElementById('stats-bar') as HTMLElement,
    saveStatus: document.getElementById('save-status') as HTMLElement,
    deleteModal: document.getElementById('delete-modal') as HTMLElement,
    searchPanel: null,
    graphPanel: null
  };

  // Check for auto-save recovery
  if (hasAutoSave()) {
    const autoSaveData = loadAutoSave();
    if (autoSaveData && confirm('Recover unsaved changes?')) {
      state.pages = autoSaveData.pages;
      state.assets = autoSaveData.assets;
      state.metadata = autoSaveData.metadata || { title: '', author: '', description: '' };
      state.storyName = autoSaveData.storyName || 'recovered-story';
      elements.storyNameInput.value = state.storyName;
    }
    clearAutoSave();
  }

  // Initialize with page 1 if empty
  if (Object.keys(state.pages).length === 0) {
    state.pages['1'] = createEmptyPage(true);
  }

  // Setup event listeners
  setupEventListeners();

  // Initial render
  updateDraftDropdown();
  renderPageTree();
  selectPage('1');
  renderAssetsList();
  updateStats();

  // Setup keyboard shortcuts
  setupKeyboardShortcuts();

  // Setup beforeunload warning
  window.addEventListener('beforeunload', (e) => {
    if (state.hasUnsavedChanges) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  // Load theme preference
  const savedTheme = localStorage.getItem('cyoa_editor_theme') as 'dark' | 'light' | null;
  if (savedTheme) {
    setTheme(savedTheme);
  }
}

/**
 * Setup event listeners
 */
function setupEventListeners(): void {
  // Story name
  elements.storyNameInput.addEventListener('input', () => {
    state.storyName = elements.storyNameInput.value;
    markUnsaved();
  });

  // Draft selection
  elements.draftSelect.addEventListener('change', selectDraft);

  // Page content editing
  elements.pageContent.addEventListener('input', () => {
    saveCurrentPage();
    updateLineNumbers();
    updateStats();
    debouncedAutoSave();
  });

  // Choice checkboxes
  elements.hasChoicesCheckbox.addEventListener('change', () => toggleChoices(true));
  elements.isEndingCheckbox.addEventListener('change', toggleEnding);

  // Choice inputs
  elements.choiceInputs.forEach(input => {
    input.addEventListener('input', () => {
      saveCurrentPage();
      debouncedAutoSave();
    });
  });

  // Textarea drag and drop for assets
  setupTextareaDrop();

  // Asset file input
  const assetInput = document.getElementById('asset-input') as HTMLInputElement;
  if (assetInput) {
    assetInput.addEventListener('change', handleAssetUpload);
  }

  // Import file input
  const importZipInput = document.getElementById('import-zip') as HTMLInputElement;
  if (importZipInput) {
    importZipInput.addEventListener('change', handleImportZip);
  }

  const importFolderInput = document.getElementById('import-folder') as HTMLInputElement;
  if (importFolderInput) {
    importFolderInput.addEventListener('change', handleImportFolder);
  }
}

/**
 * Setup keyboard shortcuts
 */
function setupKeyboardShortcuts(): void {
  document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + S: Save
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      saveToStorage();
    }

    // Ctrl/Cmd + Z: Undo
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      performUndo();
    }

    // Ctrl/Cmd + Shift + Z or Ctrl/Cmd + Y: Redo
    if ((e.ctrlKey || e.metaKey) && (e.key === 'Z' || e.key === 'y')) {
      e.preventDefault();
      performRedo();
    }

    // Ctrl/Cmd + F: Search
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault();
      openSearch();
    }

    // Ctrl/Cmd + G: Graph
    if ((e.ctrlKey || e.metaKey) && e.key === 'g') {
      e.preventDefault();
      openGraph();
    }

    // Escape: Close panels
    if (e.key === 'Escape') {
      closeSearch();
      closeGraph();
    }
  });
}

/**
 * Render the page tree sidebar
 */
function renderPageTree(): void {
  const sortedIds = sortPageIds(Object.keys(state.pages));

  elements.pageTree.innerHTML = sortedIds.map(id => {
    const page = state.pages[id];
    const typeClass = page.isEnding ? 'ending' : (page.hasChoices ? 'choice' : '');
    const typeLabel = page.isEnding ? 'END' : (page.hasChoices ? `${page.choices.length}ch` : 'AUTO');
    const activeClass = id === state.currentPageId ? 'active' : '';

    return `
      <div class="page-item ${activeClass}" data-page-id="${id}">
        <span class="page-id">${id}.txt</span>
        <span class="page-type ${typeClass}">${typeLabel}</span>
      </div>
    `;
  }).join('');

  // Add click handlers
  elements.pageTree.querySelectorAll('.page-item').forEach(item => {
    item.addEventListener('click', () => {
      const pageId = item.getAttribute('data-page-id');
      if (pageId) selectPage(pageId);
    });
  });
}

/**
 * Select a page for editing
 */
function selectPage(id: string): void {
  // Save current page first
  if (state.currentPageId && state.pages[state.currentPageId]) {
    saveCurrentPage();
  }

  state.currentPageId = id;
  const page = state.pages[id];

  if (!page) {
    elements.editorEmpty.style.display = 'flex';
    elements.editorMain.style.display = 'none';
    return;
  }

  elements.editorEmpty.style.display = 'none';
  elements.editorMain.style.display = 'flex';

  elements.currentPageIdDisplay.textContent = id;
  elements.pageContent.value = page.content || '';
  elements.hasChoicesCheckbox.checked = page.hasChoices;
  elements.isEndingCheckbox.checked = page.isEnding;

  // Update choice inputs
  updateChoiceInputs(page.choices);
  toggleChoices(false);

  updateLineNumbers();
  updateStats();
  renderPageTree();
}

/**
 * Update choice inputs
 */
function updateChoiceInputs(choices: Choice[]): void {
  // For now, just update the existing a/b inputs
  // Full a-e support requires dynamic input creation
  const choiceA = choices.find(c => c.letter === 'a');
  const choiceB = choices.find(c => c.letter === 'b');

  if (elements.choiceInputs[0]) {
    elements.choiceInputs[0].value = choiceA?.text || '';
  }
  if (elements.choiceInputs[1]) {
    elements.choiceInputs[1].value = choiceB?.text || '';
  }
}

/**
 * Save current page state
 */
function saveCurrentPage(): void {
  if (!state.currentPageId || !state.pages[state.currentPageId]) return;

  const oldPage = { ...state.pages[state.currentPageId] };

  state.pages[state.currentPageId] = {
    content: elements.pageContent.value,
    hasChoices: elements.hasChoicesCheckbox.checked,
    isEnding: elements.isEndingCheckbox.checked,
    choices: [
      { letter: 'a', text: elements.choiceInputs[0]?.value || '' },
      { letter: 'b', text: elements.choiceInputs[1]?.value || '' }
    ]
  };

  // Record for undo
  recordEdit(state.undoManager, state.currentPageId, oldPage, state.pages[state.currentPageId]);
  markUnsaved();
}

/**
 * Toggle choices visibility
 */
function toggleChoices(createChildren: boolean): void {
  const hasChoices = elements.hasChoicesCheckbox.checked;
  const isEnding = elements.isEndingCheckbox.checked;

  if (hasChoices && !isEnding) {
    elements.choicesSection.classList.add('visible');
    if (createChildren) {
      ensureChildPages();
    }
  } else {
    elements.choicesSection.classList.remove('visible');
  }

  if (hasChoices && isEnding) {
    elements.isEndingCheckbox.checked = false;
  }

  saveCurrentPage();
  renderPageTree();
}

/**
 * Toggle ending status
 */
function toggleEnding(): void {
  const isEnding = elements.isEndingCheckbox.checked;

  if (isEnding) {
    elements.hasChoicesCheckbox.checked = false;
    elements.choicesSection.classList.remove('visible');
  }

  saveCurrentPage();
  renderPageTree();
}

/**
 * Ensure child pages exist
 */
function ensureChildPages(): void {
  if (!state.currentPageId) return;

  const children = getChildIds(state.currentPageId, 2);

  for (const childId of Object.values(children)) {
    if (!state.pages[childId]) {
      state.pages[childId] = createEmptyPage(true);
      recordCreate(state.undoManager, childId, state.pages[childId]);
    }
  }

  renderPageTree();
}

/**
 * Add a new page
 */
export function addPage(): void {
  let newId: string;

  if (state.currentPageId) {
    const parsed = parsePageId(state.currentPageId);
    if (parsed) {
      newId = `${parsed.num + 1}${parsed.path}`;
      if (state.pages[newId]) {
        // Find next available
        let num = 1;
        while (state.pages[String(num)]) num++;
        newId = String(num);
      }
    } else {
      newId = '1';
    }
  } else {
    let num = 1;
    while (state.pages[String(num)]) num++;
    newId = String(num);
  }

  state.pages[newId] = createEmptyPage(true);
  recordCreate(state.undoManager, newId, state.pages[newId]);

  renderPageTree();
  selectPage(newId);
  markUnsaved();
}

/**
 * Delete current page
 */
export function deletePage(): void {
  if (!state.currentPageId || state.currentPageId === '1') {
    alert("Cannot delete the first page.");
    return;
  }
  elements.deleteModal.classList.add('visible');
}

/**
 * Confirm page deletion
 */
export function confirmDelete(): void {
  if (!state.currentPageId) return;

  const descendants = getDescendants(state.currentPageId, state.pages);
  const deletedPage = state.pages[state.currentPageId];
  const affectedPages: Record<string, Page> = {};

  for (const id of descendants) {
    affectedPages[id] = state.pages[id];
    delete state.pages[id];
  }

  delete state.pages[state.currentPageId];

  recordDelete(state.undoManager, state.currentPageId, deletedPage, affectedPages);

  closeModal();
  state.currentPageId = null;
  renderPageTree();

  const remaining = Object.keys(state.pages).sort()[0];
  if (remaining) {
    selectPage(remaining);
  } else {
    elements.editorEmpty.style.display = 'flex';
    elements.editorMain.style.display = 'none';
  }

  markUnsaved();
}

/**
 * Close modal
 */
export function closeModal(): void {
  elements.deleteModal.classList.remove('visible');
}

/**
 * Handle asset upload
 */
async function handleAssetUpload(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  if (!input.files) return;

  const newAssets = await processUploadedFiles(input.files);
  state.assets = { ...state.assets, ...newAssets };

  renderAssetsList();
  markUnsaved();
  input.value = '';
}

/**
 * Render assets list
 */
function renderAssetsList(): void {
  const names = Object.keys(state.assets).sort();

  if (names.length === 0) {
    elements.assetsList.innerHTML = `
      <div class="asset-hint">
        Upload images, videos, or audio to use in your story.
        <br><br>
        Drag assets to the text area or click to insert.
      </div>
    `;
    return;
  }

  elements.assetsList.innerHTML = names.map(name => {
    const icon = getAssetIcon(name);
    return `
      <div class="asset-item" draggable="true" data-filename="${name}">
        <span class="asset-name" title="Click to insert">${icon} {${name}}</span>
        <button class="delete-asset" data-name="${name}">×</button>
      </div>
    `;
  }).join('');

  // Add event listeners
  elements.assetsList.querySelectorAll('.asset-item').forEach(item => {
    const filename = item.getAttribute('data-filename')!;

    item.querySelector('.asset-name')?.addEventListener('click', () => insertAsset(filename));

    item.querySelector('.delete-asset')?.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteAsset(filename);
    });

    item.addEventListener('dragstart', (e) => {
      (e as DragEvent).dataTransfer?.setData('text/plain', `{${filename}}`);
      item.classList.add('dragging');
    });

    item.addEventListener('dragend', () => {
      item.classList.remove('dragging');
    });

    // Asset preview on hover
    item.addEventListener('mouseenter', () => showAssetPreview(filename));
    item.addEventListener('mouseleave', hideAssetPreview);
  });
}

/**
 * Insert asset at cursor
 */
function insertAsset(filename: string): void {
  const textarea = elements.pageContent;
  const pos = textarea.selectionStart;
  const text = textarea.value;
  const insertion = `{${filename}}`;

  textarea.value = text.slice(0, pos) + insertion + text.slice(pos);
  textarea.focus();
  textarea.setSelectionRange(pos + insertion.length, pos + insertion.length);

  saveCurrentPage();
}

/**
 * Delete asset
 */
function deleteAsset(name: string): void {
  delete state.assets[name];
  renderAssetsList();
  hideAssetPreview();
  markUnsaved();
}

/**
 * Show asset preview
 */
function showAssetPreview(filename: string): void {
  const asset = state.assets[filename];
  if (!asset) return;

  elements.assetPreview.innerHTML = '';
  elements.assetPreview.appendChild(createAssetPreview(asset, filename));
  elements.assetPreview.style.display = 'block';
}

/**
 * Hide asset preview
 */
function hideAssetPreview(): void {
  elements.assetPreview.style.display = 'none';
}

/**
 * Setup textarea drop for assets
 */
function setupTextareaDrop(): void {
  const textarea = elements.pageContent;

  textarea.addEventListener('dragover', (e) => {
    e.preventDefault();
    textarea.classList.add('drag-over');
  });

  textarea.addEventListener('dragleave', () => {
    textarea.classList.remove('drag-over');
  });

  textarea.addEventListener('drop', (e) => {
    e.preventDefault();
    textarea.classList.remove('drag-over');

    const data = e.dataTransfer?.getData('text/plain');
    if (data) {
      const pos = textarea.selectionStart;
      textarea.value = textarea.value.slice(0, pos) + data + textarea.value.slice(pos);
      textarea.setSelectionRange(pos + data.length, pos + data.length);
      saveCurrentPage();
    }
  });
}

/**
 * Update line numbers
 */
function updateLineNumbers(): void {
  if (!elements.lineNumbers || !state.showLineNumbers) return;

  const lines = elements.pageContent.value.split('\n').length;
  elements.lineNumbers.textContent = Array.from({ length: lines }, (_, i) => i + 1).join('\n');
}

/**
 * Update statistics bar
 */
function updateStats(): void {
  if (!elements.statsBar) return;

  const pageStats = state.currentPageId && state.pages[state.currentPageId]
    ? getPageStats(state.pages[state.currentPageId])
    : { words: 0, characters: 0, paragraphs: 0 };

  const totalStats = getTotalStats(state.pages);

  elements.statsBar.innerHTML = `
    <span class="stat-item">
      <span class="stat-label">Page:</span>
      <span class="stat-value">${pageStats.words} words</span>
    </span>
    <span class="stat-item">
      <span class="stat-label">Total:</span>
      <span class="stat-value">${totalStats.words} words, ${totalStats.pages} pages</span>
    </span>
  `;
}

/**
 * Mark as having unsaved changes
 */
function markUnsaved(): void {
  state.hasUnsavedChanges = true;
  updateSaveStatus('unsaved');
}

/**
 * Update save status indicator
 */
function updateSaveStatus(status: 'unsaved' | 'saving' | 'saved' | 'auto-saved'): void {
  if (!elements.saveStatus) return;

  elements.saveStatus.className = `save-status ${status}`;
  elements.saveStatus.textContent = {
    unsaved: 'Unsaved changes',
    saving: 'Saving...',
    saved: 'Saved',
    'auto-saved': 'Auto-saved'
  }[status];
}

/**
 * Save to localStorage
 */
export function saveToStorage(): void {
  saveCurrentPage();

  if (!state.storyName.trim()) {
    alert('Please enter a story name.');
    return;
  }

  updateSaveStatus('saving');

  if (saveDraft(state.storyName, state.pages, state.assets, state.metadata)) {
    state.hasUnsavedChanges = false;
    updateSaveStatus('saved');
    updateDraftDropdown();
    clearAutoSave();
  } else {
    alert('Failed to save. Storage may be full.');
    updateSaveStatus('unsaved');
  }
}

/**
 * Update draft dropdown
 */
function updateDraftDropdown(): void {
  const names = getDraftNames();

  elements.draftSelect.innerHTML = '<option value="">-- Drafts --</option>' +
    names.map(name =>
      `<option value="${name}" ${name === state.storyName ? 'selected' : ''}>${name}</option>`
    ).join('');
}

/**
 * Select a draft
 */
function selectDraft(): void {
  const selectedName = elements.draftSelect.value;
  if (!selectedName) return;

  const draft = loadDraft(selectedName);
  if (!draft) {
    alert('Draft not found.');
    return;
  }

  state.pages = draft.pages as Record<string, Page>;
  state.assets = draft.assets;
  state.metadata = draft.metadata || { title: '', author: '', description: '' };
  state.storyName = selectedName;
  state.currentPageId = null;
  state.hasUnsavedChanges = false;

  elements.storyNameInput.value = selectedName;

  renderPageTree();
  renderAssetsList();

  const firstPage = Object.keys(state.pages).sort()[0];
  if (firstPage) {
    selectPage(firstPage);
  } else {
    elements.editorEmpty.style.display = 'flex';
    elements.editorMain.style.display = 'none';
  }
}

/**
 * Create new draft
 */
export function newDraft(): void {
  if (state.hasUnsavedChanges) {
    if (!confirm('Start a new draft? Unsaved changes will be lost.')) {
      return;
    }
  }

  state.pages = { '1': createEmptyPage(true) };
  state.assets = {};
  state.metadata = { title: '', author: '', description: '' };
  state.storyName = 'new-story';
  state.currentPageId = null;
  state.hasUnsavedChanges = false;
  state.undoManager = createUndoManager();

  elements.storyNameInput.value = 'new-story';
  elements.draftSelect.value = '';

  renderPageTree();
  renderAssetsList();
  selectPage('1');
}

/**
 * Delete current draft
 */
export function deleteDraftAction(): void {
  if (!state.storyName.trim()) {
    alert('No draft selected.');
    return;
  }

  if (!confirm(`Delete draft "${state.storyName}"? This cannot be undone.`)) {
    return;
  }

  deleteDraft(state.storyName);
  updateDraftDropdown();
  newDraft();
}

/**
 * Export story
 */
export async function exportStory(): Promise<void> {
  saveCurrentPage();

  const warnings = preExportCheck(state.pages, state.assets);

  // Show warnings if any
  if (warnings.length > 0) {
    const proceed = confirm(`Export has ${warnings.length} warning(s):\n${warnings.slice(0, 3).map(w => w.message).join('\n')}\n\nProceed anyway?`);
    if (!proceed) return;
  }

  // Export as ZIP
  try {
    const { blob } = await exportToZip(state.storyName, state.pages, state.assets, state.metadata);
    downloadBlob(blob, `${sanitizeFilename(state.storyName)}.zip`);
  } catch (error) {
    alert(`Export failed: ${error}`);
  }
}

/**
 * Import from ZIP
 */
async function handleImportZip(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  if (!input.files || !input.files[0]) return;

  try {
    const result = await importFromZip(input.files[0]);

    if (result.success) {
      if (state.hasUnsavedChanges && !confirm('Import will replace current story. Continue?')) {
        return;
      }

      state.pages = result.pages;
      state.assets = result.assets;
      state.metadata = result.metadata || { title: '', author: '', description: '' };
      state.storyName = input.files[0].name.replace('.zip', '');
      state.hasUnsavedChanges = true;

      elements.storyNameInput.value = state.storyName;
      renderPageTree();
      renderAssetsList();
      selectPage('1');
    } else {
      alert('Import failed: ' + (result.errors?.join(', ') || 'Unknown error'));
    }
  } catch (error) {
    alert(`Import failed: ${error}`);
  }

  input.value = '';
}

/**
 * Import from folder (webkitdirectory)
 */
async function handleImportFolder(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  if (!input.files || input.files.length === 0) return;

  try {
    const result = await importFromFolderInput(input.files);

    if (result.success) {
      if (state.hasUnsavedChanges && !confirm('Import will replace current story. Continue?')) {
        return;
      }

      state.pages = result.pages;
      state.assets = result.assets;
      state.metadata = result.metadata || { title: '', author: '', description: '' };

      // Get folder name from first file path
      const firstPath = (input.files[0] as File & { webkitRelativePath?: string }).webkitRelativePath || '';
      state.storyName = firstPath.split('/')[0] || 'imported-story';
      state.hasUnsavedChanges = true;

      elements.storyNameInput.value = state.storyName;
      renderPageTree();
      renderAssetsList();
      selectPage('1');
    } else {
      alert('Import failed: ' + (result.errors?.join(', ') || 'Unknown error'));
    }
  } catch (error) {
    alert(`Import failed: ${error}`);
  }

  input.value = '';
}

/**
 * Perform undo
 */
function performUndo(): void {
  if (!canUndo(state.undoManager)) return;

  const result = undo(state.undoManager, state.pages);
  if (result) {
    state.pages = result.pages;
    renderPageTree();

    if (state.currentPageId && state.pages[state.currentPageId]) {
      selectPage(state.currentPageId);
    } else {
      const firstPage = Object.keys(state.pages).sort()[0];
      if (firstPage) selectPage(firstPage);
    }

    markUnsaved();
  }
}

/**
 * Perform redo
 */
function performRedo(): void {
  if (!canRedo(state.undoManager)) return;

  const result = redo(state.undoManager, state.pages);
  if (result) {
    state.pages = result.pages;
    renderPageTree();

    if (state.currentPageId && state.pages[state.currentPageId]) {
      selectPage(state.currentPageId);
    }

    markUnsaved();
  }
}

/**
 * Open search panel
 */
function openSearch(): void {
  if (elements.searchPanel) return;

  elements.searchPanel = createSearchPanel(
    (query, options) => {
      state.searchResults = searchPages(state.pages, query, options);
      const resultsContainer = elements.searchPanel?.querySelector('#search-results');
      if (resultsContainer) {
        displaySearchResults(resultsContainer as HTMLElement, state.searchResults, (pageId) => {
          selectPage(pageId);
        });
      }
    },
    (search, replace, options) => {
      // Replace functionality
      console.log('Replace:', search, 'with', replace, options);
    },
    closeSearch
  );

  document.body.appendChild(elements.searchPanel);
}

/**
 * Close search panel
 */
function closeSearch(): void {
  if (elements.searchPanel) {
    elements.searchPanel.remove();
    elements.searchPanel = null;
  }
}

/**
 * Open graph panel
 */
function openGraph(): void {
  if (elements.graphPanel) return;

  elements.graphPanel = createGraphPanel(closeGraph, (pageId) => {
    selectPage(pageId);
  });

  document.body.appendChild(elements.graphPanel);
  elements.graphPanel.classList.add('visible');

  // Initialize after adding to DOM
  setTimeout(() => {
    if (elements.graphPanel) {
      initGraphPanel(elements.graphPanel, state.pages, (pageId) => {
        selectPage(pageId);
        closeGraph();
      });
    }
  }, 100);
}

/**
 * Close graph panel
 */
function closeGraph(): void {
  if (elements.graphPanel) {
    elements.graphPanel.classList.remove('visible');
    elements.graphPanel.remove();
    elements.graphPanel = null;
  }
}

/**
 * Set theme
 */
function setTheme(theme: 'dark' | 'light'): void {
  state.theme = theme;
  document.documentElement.classList.toggle('light-theme', theme === 'light');
  localStorage.setItem('cyoa_editor_theme', theme);
}

/**
 * Toggle theme
 */
export function toggleTheme(): void {
  setTheme(state.theme === 'dark' ? 'light' : 'dark');
}

// Expose functions to global scope for HTML onclick handlers
(window as unknown as Record<string, unknown>).addPage = addPage;
(window as unknown as Record<string, unknown>).deletePage = deletePage;
(window as unknown as Record<string, unknown>).confirmDelete = confirmDelete;
(window as unknown as Record<string, unknown>).closeModal = closeModal;
(window as unknown as Record<string, unknown>).saveToStorage = saveToStorage;
(window as unknown as Record<string, unknown>).newDraft = newDraft;
(window as unknown as Record<string, unknown>).deleteDraft = deleteDraftAction;
(window as unknown as Record<string, unknown>).exportStory = exportStory;
(window as unknown as Record<string, unknown>).toggleTheme = toggleTheme;

// Initialize on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
