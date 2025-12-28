// Save/load functionality for the engine

import type { SaveState } from '../types';

const SAVE_PREFIX = 'cyoa_save_';
const SETTINGS_KEY = 'cyoa_engine_settings';

/**
 * Engine settings
 */
export interface EngineSettings {
  theme: 'dark' | 'light';
  fontSize: 'small' | 'medium' | 'large' | 'xlarge';
  volume: number;
  muted: boolean;
  showKeyboardHints: boolean;
}

/**
 * Get default settings
 */
export function getDefaultSettings(): EngineSettings {
  return {
    theme: 'dark',
    fontSize: 'medium',
    volume: 0.7,
    muted: false,
    showKeyboardHints: true
  };
}

/**
 * Save progress for a story
 */
export function saveProgress(storyFolder: string, state: SaveState): void {
  const key = SAVE_PREFIX + storyFolder;
  localStorage.setItem(key, JSON.stringify({
    ...state,
    savedAt: new Date().toISOString()
  }));
}

/**
 * Load progress for a story
 */
export function loadProgress(storyFolder: string): SaveState | null {
  const key = SAVE_PREFIX + storyFolder;
  try {
    const data = localStorage.getItem(key);
    if (!data) return null;

    const saved = JSON.parse(data);
    return {
      page: saved.page || 1,
      path: saved.path || '',
      variables: saved.variables || {}
    };
  } catch (e) {
    return null;
  }
}

/**
 * Clear progress for a story
 */
export function clearProgress(storyFolder: string): void {
  const key = SAVE_PREFIX + storyFolder;
  localStorage.removeItem(key);
}

/**
 * Check if there's saved progress
 */
export function hasProgress(storyFolder: string): boolean {
  const key = SAVE_PREFIX + storyFolder;
  return localStorage.getItem(key) !== null;
}

/**
 * Get all saved story names
 */
export function getSavedStories(): string[] {
  const stories: string[] = [];

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(SAVE_PREFIX)) {
      stories.push(key.replace(SAVE_PREFIX, ''));
    }
  }

  return stories;
}

/**
 * Delete all saves for a story
 */
export function deleteStorySaves(storyFolder: string): void {
  clearProgress(storyFolder);
}

/**
 * Save engine settings
 */
export function saveSettings(settings: EngineSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

/**
 * Load engine settings
 */
export function loadSettings(): EngineSettings {
  try {
    const data = localStorage.getItem(SETTINGS_KEY);
    if (!data) return getDefaultSettings();

    return {
      ...getDefaultSettings(),
      ...JSON.parse(data)
    };
  } catch (e) {
    return getDefaultSettings();
  }
}

/**
 * Generate a save code (for manual save/load)
 */
export function generateSaveCode(state: SaveState): string {
  // Format: page-path-variablesHash
  const pageCode = `${state.page}${state.path || ''}`;

  if (!state.variables || Object.keys(state.variables).length === 0) {
    return pageCode;
  }

  // Simple encoding for variables
  const varsStr = Object.entries(state.variables)
    .map(([k, v]) => `${k}:${v}`)
    .join(',');
  const varsHash = btoa(varsStr).slice(0, 8);

  return `${pageCode}-${varsHash}`;
}

/**
 * Parse a save code (basic - just page/path)
 */
export function parseSaveCode(code: string): SaveState | null {
  // Basic format: page + path (e.g., "3ab")
  const match = code.match(/^(\d+)([a-e]*)(?:-(.+))?$/i);
  if (!match) return null;

  return {
    page: parseInt(match[1], 10),
    path: match[2].toLowerCase(),
    variables: {} // Variables from hash not decoded in basic version
  };
}

/**
 * Export all saves as JSON
 */
export function exportAllSaves(): string {
  const saves: Record<string, unknown> = {};

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(SAVE_PREFIX)) {
      const storyName = key.replace(SAVE_PREFIX, '');
      saves[storyName] = JSON.parse(localStorage.getItem(key) || '{}');
    }
  }

  return JSON.stringify({
    version: 1,
    exportedAt: new Date().toISOString(),
    saves,
    settings: loadSettings()
  }, null, 2);
}

/**
 * Import saves from JSON
 */
export function importSaves(json: string): { success: boolean; imported: number; errors: string[] } {
  const result = {
    success: false,
    imported: 0,
    errors: [] as string[]
  };

  try {
    const data = JSON.parse(json);
    const saves = data.saves || data;

    for (const [storyName, saveData] of Object.entries(saves)) {
      if (typeof saveData === 'object' && saveData !== null) {
        const key = SAVE_PREFIX + storyName;
        localStorage.setItem(key, JSON.stringify(saveData));
        result.imported++;
      }
    }

    if (data.settings) {
      saveSettings(data.settings);
    }

    result.success = true;
  } catch (e) {
    result.errors.push(`Failed to parse saves: ${e}`);
  }

  return result;
}

/**
 * Get save info for display
 */
export function getSaveInfo(storyFolder: string): {
  exists: boolean;
  page?: number;
  path?: string;
  savedAt?: string;
} {
  const key = SAVE_PREFIX + storyFolder;
  try {
    const data = localStorage.getItem(key);
    if (!data) return { exists: false };

    const saved = JSON.parse(data);
    return {
      exists: true,
      page: saved.page,
      path: saved.path,
      savedAt: saved.savedAt
    };
  } catch (e) {
    return { exists: false };
  }
}

/**
 * Create resume dialog
 */
export function createResumeDialog(
  storyFolder: string,
  onResume: () => void,
  onNewGame: () => void
): HTMLElement | null {
  const info = getSaveInfo(storyFolder);
  if (!info.exists) return null;

  const dialog = document.createElement('div');
  dialog.className = 'modal-overlay visible';
  dialog.innerHTML = `
    <div class="modal">
      <h3>Continue Playing?</h3>
      <p>You have a saved game at page ${info.page}${info.path || ''}.</p>
      ${info.savedAt ? `<p style="color: #888; font-size: 0.9rem;">Saved: ${new Date(info.savedAt).toLocaleString()}</p>` : ''}
      <div class="modal-buttons">
        <button id="new-game-btn">New Game</button>
        <button id="resume-btn" class="primary">Continue</button>
      </div>
    </div>
  `;

  const resumeBtn = dialog.querySelector('#resume-btn') as HTMLButtonElement;
  const newGameBtn = dialog.querySelector('#new-game-btn') as HTMLButtonElement;

  resumeBtn.onclick = () => {
    dialog.remove();
    onResume();
  };

  newGameBtn.onclick = () => {
    dialog.remove();
    onNewGame();
  };

  return dialog;
}
