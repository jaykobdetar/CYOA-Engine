// CYOA Engine - Main Entry Point

import type { StoryMetadata, FileSystemDirectoryHandle } from '../types';
import { isFileSystemAccessSupported } from '../shared/utils';
import { formatStoryContent, extractChoices } from '../shared/format';
import {
  createPlayerState, startGame, makeChoice, continueToNext, restart,
  getCurrentFilename, getSaveCode, jumpToPage,
  getChoicePathDisplay, toSaveState, fromSaveState, PlayerState
} from './player';
import {
  createAssetManager, clearAssets, setAssetsDirectory, setZipAssets,
  setFolderAssets, processAssets, AssetManager
} from './assets';
import {
  createAudioManager, initAudio, processAudioCommands, stopAllAudio,
  setVolume, setMuted, AudioManager
} from './audio';
import { processVariables, updateVariablesPanel } from './variables';
import {
  saveProgress, loadProgress, clearProgress, hasProgress,
  loadSettings, saveSettings, createResumeDialog, EngineSettings, getDefaultSettings
} from './saves';

// Application State
let playerState: PlayerState = createPlayerState();
let assetManager: AssetManager = createAssetManager();
let audioManager: AudioManager = createAudioManager();
let settings: EngineSettings = getDefaultSettings();

// Story data
let storyDirHandle: FileSystemDirectoryHandle | null = null;
let storyMetadata: StoryMetadata | null = null;
let storyFiles: Record<string, string> = {};

// DOM Elements
let elements: {
  loadStoryBtn: HTMLButtonElement;
  folderName: HTMLElement;
  pageJumpInput: HTMLInputElement;
  jumpBtn: HTMLButtonElement;
  refreshBtn: HTMLButtonElement;
  menu: HTMLElement;
  game: HTMLElement;
  story: HTMLElement;
  choices: HTMLElement;
  ending: HTMLElement;
  status: HTMLElement;
  currentPageDisplay: HTMLElement;
  saveCode: HTMLElement;
  logContent: HTMLElement;
  restartBtn: HTMLButtonElement;
  themeToggle: HTMLButtonElement;
  fontSizeControls: HTMLElement;
  volumeSlider: HTMLInputElement;
  variablesPanel: HTMLElement;
  audioPlayer: HTMLElement;
};

/**
 * Initialize the engine
 */
export function init(): void {
  // Get DOM elements
  elements = {
    loadStoryBtn: document.getElementById('load-story') as HTMLButtonElement,
    folderName: document.getElementById('folder-name') as HTMLElement,
    pageJumpInput: document.getElementById('page-jump') as HTMLInputElement,
    jumpBtn: document.getElementById('jump-btn') as HTMLButtonElement,
    refreshBtn: document.getElementById('refresh-btn') as HTMLButtonElement,
    menu: document.getElementById('menu') as HTMLElement,
    game: document.getElementById('game') as HTMLElement,
    story: document.getElementById('story') as HTMLElement,
    choices: document.getElementById('choices') as HTMLElement,
    ending: document.getElementById('ending') as HTMLElement,
    status: document.getElementById('status') as HTMLElement,
    currentPageDisplay: document.getElementById('current-page-display') as HTMLElement,
    saveCode: document.getElementById('save-code') as HTMLElement,
    logContent: document.getElementById('log-content') as HTMLElement,
    restartBtn: document.getElementById('restart') as HTMLButtonElement,
    themeToggle: document.getElementById('theme-toggle') as HTMLButtonElement,
    fontSizeControls: document.getElementById('font-size-controls') as HTMLElement,
    volumeSlider: document.getElementById('volume-slider') as HTMLInputElement,
    variablesPanel: document.getElementById('variables-panel') as HTMLElement,
    audioPlayer: document.getElementById('audio-player') as HTMLElement
  };

  // Load settings
  settings = loadSettings();
  applySettings();

  // Initialize audio
  initAudio(audioManager);

  // Setup event listeners
  setupEventListeners();

  // Setup keyboard navigation
  setupKeyboardNavigation();

  // Check for File System Access API support
  if (!isFileSystemAccessSupported()) {
    setupFallbackImport();
  }
}

/**
 * Setup event listeners
 */
function setupEventListeners(): void {
  // Load story button
  elements.loadStoryBtn.onclick = openStoryFolder;

  // Jump button
  elements.jumpBtn.onclick = handleJump;
  elements.pageJumpInput.onkeydown = (e) => {
    if (e.key === 'Enter') handleJump();
  };

  // Refresh button
  elements.refreshBtn.onclick = () => {
    if (playerState.isPlaying) {
      loadPage();
    }
  };

  // Restart button
  elements.restartBtn.onclick = handleRestart;

  // Theme toggle
  if (elements.themeToggle) {
    elements.themeToggle.onclick = toggleTheme;
  }

  // Volume control
  if (elements.volumeSlider) {
    elements.volumeSlider.oninput = () => {
      const volume = parseInt(elements.volumeSlider.value) / 100;
      setVolume(audioManager, volume);
      settings.volume = volume;
      saveSettings(settings);
    };
  }

  // Font size controls
  setupFontSizeControls();
}

/**
 * Setup keyboard navigation
 */
function setupKeyboardNavigation(): void {
  document.addEventListener('keydown', (e) => {
    if (!playerState.isPlaying) return;

    // Don't handle if focus is on input
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
      return;
    }

    // Choice selection: a-e
    if (e.key >= 'a' && e.key <= 'e') {
      const choiceBtn = elements.choices.querySelector(`button[data-choice="${e.key}"]`) as HTMLButtonElement;
      if (choiceBtn) {
        e.preventDefault();
        choiceBtn.click();
      }
    }

    // Space: Continue
    if (e.key === ' ' || e.key === 'Enter') {
      const continueBtn = elements.choices.querySelector('.continue-btn') as HTMLButtonElement;
      if (continueBtn) {
        e.preventDefault();
        continueBtn.click();
      }
    }

    // r: Restart
    if (e.key === 'r' && !e.ctrlKey && !e.metaKey) {
      if (confirm('Restart the story?')) {
        handleRestart();
      }
    }
  });

  // Show keyboard hints
  if (settings.showKeyboardHints) {
    showKeyboardHint();
  }
}

/**
 * Show keyboard navigation hint
 */
function showKeyboardHint(): void {
  const hint = document.createElement('div');
  hint.className = 'keyboard-hint';
  hint.innerHTML = 'Press <kbd>a</kbd>-<kbd>e</kbd> for choices, <kbd>space</kbd> to continue';
  document.body.appendChild(hint);

  // Show briefly then fade
  setTimeout(() => hint.classList.add('visible'), 100);
  setTimeout(() => hint.classList.remove('visible'), 5000);
  setTimeout(() => hint.remove(), 6000);
}

/**
 * Setup font size controls
 */
function setupFontSizeControls(): void {
  if (!elements.fontSizeControls) return;

  elements.fontSizeControls.innerHTML = `
    <button id="font-decrease" title="Decrease font size">A-</button>
    <button id="font-increase" title="Increase font size">A+</button>
  `;

  const decreaseBtn = document.getElementById('font-decrease') as HTMLButtonElement;
  const increaseBtn = document.getElementById('font-increase') as HTMLButtonElement;

  const sizes: Array<'small' | 'medium' | 'large' | 'xlarge'> = ['small', 'medium', 'large', 'xlarge'];

  decreaseBtn.onclick = () => {
    const currentIndex = sizes.indexOf(settings.fontSize);
    if (currentIndex > 0) {
      settings.fontSize = sizes[currentIndex - 1];
      applyFontSize();
      saveSettings(settings);
    }
  };

  increaseBtn.onclick = () => {
    const currentIndex = sizes.indexOf(settings.fontSize);
    if (currentIndex < sizes.length - 1) {
      settings.fontSize = sizes[currentIndex + 1];
      applyFontSize();
      saveSettings(settings);
    }
  };
}

/**
 * Setup fallback import for browsers without File System Access API
 */
function setupFallbackImport(): void {
  // Replace the button with file inputs
  elements.loadStoryBtn.innerHTML = '📁 Open Story';

  // Create hidden inputs
  const folderInput = document.createElement('input');
  folderInput.type = 'file';
  folderInput.setAttribute('webkitdirectory', '');
  folderInput.style.display = 'none';
  folderInput.id = 'folder-input';

  const zipInput = document.createElement('input');
  zipInput.type = 'file';
  zipInput.accept = '.zip';
  zipInput.style.display = 'none';
  zipInput.id = 'zip-input';

  document.body.appendChild(folderInput);
  document.body.appendChild(zipInput);

  // Show options on click
  elements.loadStoryBtn.onclick = () => {
    const option = confirm('Open folder? (Cancel for ZIP file)');
    if (option) {
      folderInput.click();
    } else {
      zipInput.click();
    }
  };

  folderInput.onchange = handleFolderInput;
  zipInput.onchange = handleZipInput;
}

/**
 * Open story folder (File System Access API)
 */
async function openStoryFolder(): Promise<void> {
  try {
    storyDirHandle = await window.showDirectoryPicker();
    playerState.storyFolder = storyDirHandle.name;
    elements.folderName.textContent = playerState.storyFolder;

    // Clear old assets
    clearAssets(assetManager);
    stopAllAudio(audioManager);

    // Try to get assets subdirectory
    try {
      const assetsDir = await storyDirHandle.getDirectoryHandle('assets');
      setAssetsDirectory(assetManager, assetsDir);
    } catch (e) {
      // No assets folder
    }

    // Try to load metadata
    try {
      const metadataHandle = await storyDirHandle.getFileHandle('story.json');
      const file = await metadataHandle.getFile();
      storyMetadata = JSON.parse(await file.text());
    } catch (e) {
      storyMetadata = null;
    }

    // Check for saved progress
    if (hasProgress(playerState.storyFolder)) {
      const dialog = createResumeDialog(
        playerState.storyFolder,
        () => resumeGame(),
        () => startNewGame()
      );
      if (dialog) {
        document.body.appendChild(dialog);
      } else {
        startNewGame();
      }
    } else {
      startNewGame();
    }
  } catch (e) {
    if ((e as Error).name !== 'AbortError') {
      console.error('Error opening folder:', e);
    }
  }
}

/**
 * Handle folder input (fallback)
 */
async function handleFolderInput(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  if (!input.files || input.files.length === 0) return;

  // Build file map
  const files: Record<string, File> = {};
  const assetFiles: Record<string, File> = {};

  for (const file of Array.from(input.files)) {
    const path = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
    const parts = path.split('/');
    const relativePath = parts.slice(1).join('/');

    if (relativePath.startsWith('assets/')) {
      const assetName = relativePath.replace('assets/', '');
      assetFiles[assetName] = file;
    } else {
      files[relativePath] = file;
    }
  }

  // Set story folder name
  const firstPath = (input.files[0] as File & { webkitRelativePath?: string }).webkitRelativePath || '';
  playerState.storyFolder = firstPath.split('/')[0] || 'story';
  elements.folderName.textContent = playerState.storyFolder;

  // Store files for reading
  storyFiles = {};
  for (const [name, file] of Object.entries(files)) {
    storyFiles[name] = await file.text();
  }

  // Set assets
  setFolderAssets(assetManager, assetFiles);

  // Load metadata
  if (files['story.json']) {
    try {
      storyMetadata = JSON.parse(await files['story.json'].text());
    } catch (e) {
      storyMetadata = null;
    }
  }

  // Check for saved progress
  if (hasProgress(playerState.storyFolder)) {
    const dialog = createResumeDialog(
      playerState.storyFolder,
      () => resumeGame(),
      () => startNewGame()
    );
    if (dialog) document.body.appendChild(dialog);
    else startNewGame();
  } else {
    startNewGame();
  }
}

/**
 * Handle ZIP input (fallback)
 */
async function handleZipInput(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  if (!input.files || !input.files[0]) return;

  const file = input.files[0];
  playerState.storyFolder = file.name.replace('.zip', '');
  elements.folderName.textContent = playerState.storyFolder;

  try {
    const zip = new JSZip();
    await zip.loadAsync(file);

    // Find root path
    let rootPath = '';
    const entries = Object.keys(zip.files);
    const firstEntry = entries.find(e => !zip.files[e].dir);
    if (firstEntry && firstEntry.includes('/')) {
      rootPath = firstEntry.split('/')[0] + '/';
    }

    // Extract text files
    storyFiles = {};
    const assetBlobs: Record<string, Blob> = {};

    for (const [path, zipFile] of Object.entries(zip.files)) {
      if (zipFile.dir) continue;

      const relativePath = path.replace(rootPath, '');

      if (relativePath.startsWith('assets/')) {
        const assetName = relativePath.replace('assets/', '');
        assetBlobs[assetName] = await zipFile.async('blob');
      } else if (relativePath.endsWith('.txt')) {
        storyFiles[relativePath] = await zipFile.async('string');
      } else if (relativePath === 'story.json') {
        try {
          storyMetadata = JSON.parse(await zipFile.async('string'));
        } catch (e) {
          storyMetadata = null;
        }
      }
    }

    setZipAssets(assetManager, assetBlobs);

    if (hasProgress(playerState.storyFolder)) {
      const dialog = createResumeDialog(
        playerState.storyFolder,
        () => resumeGame(),
        () => startNewGame()
      );
      if (dialog) document.body.appendChild(dialog);
      else startNewGame();
    } else {
      startNewGame();
    }
  } catch (e) {
    alert(`Failed to open ZIP: ${e}`);
  }
}

/**
 * Start a new game
 */
function startNewGame(): void {
  playerState = {
    ...playerState,
    ...startGame(playerState, 1, '')
  };

  showGame();
  loadPage();
}

/**
 * Resume from saved progress
 */
function resumeGame(): void {
  const saved = loadProgress(playerState.storyFolder);
  if (saved) {
    playerState = fromSaveState(playerState, saved);
    playerState.isPlaying = true;
  } else {
    playerState = startGame(playerState, 1, '');
  }

  showGame();
  loadPage();
}

/**
 * Show game screen
 */
function showGame(): void {
  elements.menu.style.display = 'none';
  elements.game.style.display = 'block';
  elements.status.classList.add('visible');
  elements.ending.style.display = 'none';

  // Show metadata if available
  if (storyMetadata) {
    showMetadata();
  }
}

/**
 * Show story metadata
 */
function showMetadata(): void {
  if (!storyMetadata) return;

  // Could display title/author at the top of the story
  // For now, just set document title
  if (storyMetadata.title) {
    document.title = storyMetadata.title;
  }
}

/**
 * Load current page
 */
async function loadPage(): Promise<void> {
  const filename = getCurrentFilename(playerState);

  let pageText: string | null = null;

  // Try to read from directory handle
  if (storyDirHandle) {
    try {
      const fileHandle = await storyDirHandle.getFileHandle(filename);
      const file = await fileHandle.getFile();
      pageText = await file.text();
    } catch (e) {
      // File not found
    }
  }

  // Try from stored files
  if (!pageText && storyFiles[filename]) {
    pageText = storyFiles[filename];
  }

  if (!pageText) {
    showEnding();
    return;
  }

  await displayPage(pageText);
  updateStatus();
  saveProgress(playerState.storyFolder, toSaveState(playerState));
}

/**
 * Display a page
 */
async function displayPage(text: string): Promise<void> {
  // Process variables
  const { text: processedText, variables: newVariables } = processVariables(text, playerState.variables);
  playerState.variables = newVariables;

  // Extract choices
  const { storyText, choices } = extractChoices(processedText);

  // Format and process assets
  const { html } = formatStoryContent(storyText, playerState.variables);
  const finalHtml = await processAssets(html, assetManager);

  // Sanitize with DOMPurify
  elements.story.innerHTML = DOMPurify.sanitize(finalHtml, {
    ALLOWED_TAGS: ['p', 'br', 'img', 'video', 'strong', 'em', 'b', 'i', 'blockquote', 'mark'],
    ALLOWED_ATTR: ['src', 'alt', 'class', 'controls', 'preload']
  });

  // Process audio commands
  await processAudioCommands(text, audioManager, assetManager);

  // Update variables panel
  if (elements.variablesPanel) {
    updateVariablesPanel(elements.variablesPanel, playerState.variables);
  }

  // Render choices
  renderChoices(choices);
}

/**
 * Render choice buttons
 */
function renderChoices(choices: Array<{ letter: string; text: string; goto?: string }>): void {
  elements.choices.innerHTML = '';

  if (choices.length > 0) {
    for (const choice of choices) {
      const btn = document.createElement('button');
      btn.dataset.choice = choice.letter;
      btn.innerHTML = `
        <span class="choice-key">${choice.letter.toUpperCase()}</span>
        ${DOMPurify.sanitize(choice.text, { ALLOWED_TAGS: [] })}
      `;
      btn.onclick = () => handleChoice(choice.letter, choice.goto);
      elements.choices.appendChild(btn);
    }
  } else {
    // Continue button
    const btn = document.createElement('button');
    btn.className = 'continue-btn';
    btn.innerHTML = '<span class="choice-key">Space</span> Continue';
    btn.onclick = handleContinue;
    elements.choices.appendChild(btn);
  }
}

/**
 * Handle choice selection
 */
function handleChoice(letter: string, goto?: string): void {
  playerState = makeChoice(playerState, letter, goto);
  loadPage();
}

/**
 * Handle continue (no choice)
 */
function handleContinue(): void {
  playerState = continueToNext(playerState);
  loadPage();
}

/**
 * Show ending screen
 */
function showEnding(): void {
  elements.ending.style.display = 'block';
  elements.choices.innerHTML = '';
  clearProgress(playerState.storyFolder);
}

/**
 * Handle restart
 */
function handleRestart(): void {
  clearProgress(playerState.storyFolder);
  stopAllAudio(audioManager);
  playerState = restart(playerState);
  elements.ending.style.display = 'none';
  loadPage();
}

/**
 * Handle jump to page
 */
function handleJump(): void {
  const code = elements.pageJumpInput.value.trim();
  if (!code) return;

  if (!playerState.storyFolder) {
    alert('Please open a story first.');
    return;
  }

  const newState = jumpToPage(playerState, code);
  if (!newState) {
    elements.story.innerHTML = '<p class="error">Invalid page code. Use format like "1", "3ab", "5baa".</p>';
    return;
  }

  playerState = { ...newState, isPlaying: true };
  if (!playerState.isPlaying) {
    showGame();
  }
  loadPage();
  elements.pageJumpInput.value = '';
}

/**
 * Update status bar
 */
function updateStatus(): void {
  elements.currentPageDisplay.textContent = String(playerState.currentPage);
  elements.saveCode.textContent = getSaveCode(playerState);
  elements.logContent.textContent = getChoicePathDisplay(playerState);
}

/**
 * Apply settings
 */
function applySettings(): void {
  applyTheme();
  applyFontSize();

  if (elements.volumeSlider) {
    elements.volumeSlider.value = String(settings.volume * 100);
  }
  setVolume(audioManager, settings.volume);
  setMuted(audioManager, settings.muted);
}

/**
 * Apply theme
 */
function applyTheme(): void {
  document.documentElement.classList.toggle('light-theme', settings.theme === 'light');
  if (elements.themeToggle) {
    elements.themeToggle.textContent = settings.theme === 'dark' ? '🌙' : '☀️';
  }
}

/**
 * Apply font size
 */
function applyFontSize(): void {
  document.body.classList.remove('font-size-small', 'font-size-medium', 'font-size-large', 'font-size-xlarge');
  document.body.classList.add(`font-size-${settings.fontSize}`);
}

/**
 * Toggle theme
 */
function toggleTheme(): void {
  settings.theme = settings.theme === 'dark' ? 'light' : 'dark';
  applyTheme();
  saveSettings(settings);
}

// Expose functions to global scope
(window as unknown as Record<string, unknown>).restartGame = handleRestart;

// Initialize on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
