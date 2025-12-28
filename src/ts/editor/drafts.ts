// Draft management (localStorage persistence)

import type { Draft, Page, LegacyPage, Asset, StoryMetadata } from '../types';
import { getLocalStorageUsage, formatFileSize } from '../shared/utils';
import { isLegacyPage, convertLegacyPage } from './pages';

const DRAFTS_KEY = 'cyoa_editor_drafts';
const AUTOSAVE_KEY = 'cyoa_editor_autosave';

/**
 * Get all saved drafts
 */
export function getDrafts(): Record<string, Draft> {
  try {
    const data = localStorage.getItem(DRAFTS_KEY);
    return data ? JSON.parse(data) : {};
  } catch (error) {
    console.error('Failed to load drafts:', error);
    return {};
  }
}

/**
 * Save all drafts
 */
export function saveDrafts(drafts: Record<string, Draft>): boolean {
  try {
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      console.error('localStorage quota exceeded');
      return false;
    }
    throw error;
  }
}

/**
 * Save a single draft
 */
export function saveDraft(
  name: string,
  pages: Record<string, Page | LegacyPage>,
  assets: Record<string, Asset>,
  metadata?: StoryMetadata
): boolean {
  const drafts = getDrafts();

  drafts[name] = {
    pages,
    assets,
    metadata,
    savedAt: new Date().toISOString()
  };

  return saveDrafts(drafts);
}

/**
 * Load a draft by name
 */
export function loadDraft(name: string): Draft | null {
  const drafts = getDrafts();
  const draft = drafts[name];

  if (!draft) return null;

  // Convert legacy pages if needed
  const convertedPages: Record<string, Page> = {};
  for (const [id, page] of Object.entries(draft.pages)) {
    if (isLegacyPage(page)) {
      convertedPages[id] = convertLegacyPage(page);
    } else {
      convertedPages[id] = page as Page;
    }
  }

  return {
    ...draft,
    pages: convertedPages
  };
}

/**
 * Delete a draft
 */
export function deleteDraft(name: string): boolean {
  const drafts = getDrafts();

  if (!drafts[name]) return false;

  delete drafts[name];
  return saveDrafts(drafts);
}

/**
 * Get draft names sorted by save date
 */
export function getDraftNames(): string[] {
  const drafts = getDrafts();
  return Object.entries(drafts)
    .sort((a, b) => {
      const dateA = new Date(a[1].savedAt).getTime();
      const dateB = new Date(b[1].savedAt).getTime();
      return dateB - dateA; // Most recent first
    })
    .map(([name]) => name);
}

/**
 * Check if a draft exists
 */
export function draftExists(name: string): boolean {
  const drafts = getDrafts();
  return name in drafts;
}

/**
 * Rename a draft
 */
export function renameDraft(oldName: string, newName: string): boolean {
  if (oldName === newName) return true;

  const drafts = getDrafts();

  if (!drafts[oldName] || drafts[newName]) return false;

  drafts[newName] = {
    ...drafts[oldName],
    savedAt: new Date().toISOString()
  };
  delete drafts[oldName];

  return saveDrafts(drafts);
}

/**
 * Duplicate a draft
 */
export function duplicateDraft(name: string, newName: string): boolean {
  const drafts = getDrafts();

  if (!drafts[name] || drafts[newName]) return false;

  drafts[newName] = {
    ...JSON.parse(JSON.stringify(drafts[name])),
    savedAt: new Date().toISOString()
  };

  return saveDrafts(drafts);
}

/**
 * Auto-save current state
 */
export function autoSave(
  pages: Record<string, Page>,
  assets: Record<string, Asset>,
  metadata?: StoryMetadata,
  storyName?: string
): boolean {
  try {
    const autosave = {
      pages,
      assets,
      metadata,
      storyName,
      savedAt: new Date().toISOString()
    };
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(autosave));
    return true;
  } catch (error) {
    console.error('Auto-save failed:', error);
    return false;
  }
}

/**
 * Load auto-save
 */
export function loadAutoSave(): {
  pages: Record<string, Page>;
  assets: Record<string, Asset>;
  metadata?: StoryMetadata;
  storyName?: string;
  savedAt: string;
} | null {
  try {
    const data = localStorage.getItem(AUTOSAVE_KEY);
    if (!data) return null;

    const autosave = JSON.parse(data);

    // Convert legacy pages if needed
    const convertedPages: Record<string, Page> = {};
    for (const [id, page] of Object.entries(autosave.pages || {})) {
      if (isLegacyPage(page)) {
        convertedPages[id] = convertLegacyPage(page as LegacyPage);
      } else {
        convertedPages[id] = page as Page;
      }
    }

    return {
      ...autosave,
      pages: convertedPages
    };
  } catch (error) {
    console.error('Failed to load auto-save:', error);
    return null;
  }
}

/**
 * Clear auto-save
 */
export function clearAutoSave(): void {
  localStorage.removeItem(AUTOSAVE_KEY);
}

/**
 * Check if auto-save exists
 */
export function hasAutoSave(): boolean {
  return localStorage.getItem(AUTOSAVE_KEY) !== null;
}

/**
 * Get storage usage info
 */
export function getStorageInfo(): {
  used: number;
  available: number;
  percentage: number;
  warning: boolean;
  formattedUsed: string;
  formattedAvailable: string;
} {
  const { used, available } = getLocalStorageUsage();
  const percentage = (used / available) * 100;

  return {
    used,
    available,
    percentage,
    warning: percentage > 80,
    formattedUsed: formatFileSize(used),
    formattedAvailable: formatFileSize(available)
  };
}

/**
 * Clean up old drafts to free space
 */
export function cleanupOldDrafts(keepCount: number = 10): string[] {
  const drafts = getDrafts();
  const names = Object.entries(drafts)
    .sort((a, b) => {
      const dateA = new Date(a[1].savedAt).getTime();
      const dateB = new Date(b[1].savedAt).getTime();
      return dateB - dateA;
    })
    .map(([name]) => name);

  const toDelete = names.slice(keepCount);
  const deleted: string[] = [];

  for (const name of toDelete) {
    if (deleteDraft(name)) {
      deleted.push(name);
    }
  }

  return deleted;
}

/**
 * Export drafts for backup
 */
export function exportDraftsBackup(): string {
  const drafts = getDrafts();
  return JSON.stringify({
    version: 2,
    exportedAt: new Date().toISOString(),
    drafts
  }, null, 2);
}

/**
 * Import drafts from backup
 */
export function importDraftsBackup(
  json: string,
  overwrite: boolean = false
): { success: boolean; imported: string[]; errors: string[] } {
  const result = {
    success: false,
    imported: [] as string[],
    errors: [] as string[]
  };

  try {
    const data = JSON.parse(json);
    const importedDrafts = data.drafts || data;

    const currentDrafts = overwrite ? {} : getDrafts();

    for (const [name, draft] of Object.entries(importedDrafts)) {
      if (!overwrite && currentDrafts[name]) {
        result.errors.push(`Draft "${name}" already exists, skipped`);
        continue;
      }

      // Validate draft structure
      if (!isDraftValid(draft as Draft)) {
        result.errors.push(`Draft "${name}" has invalid structure, skipped`);
        continue;
      }

      currentDrafts[name] = draft as Draft;
      result.imported.push(name);
    }

    if (saveDrafts(currentDrafts)) {
      result.success = true;
    } else {
      result.errors.push('Failed to save drafts (storage full?)');
    }
  } catch (error) {
    result.errors.push(`Failed to parse backup: ${error}`);
  }

  return result;
}

/**
 * Validate draft structure
 */
function isDraftValid(draft: unknown): draft is Draft {
  if (typeof draft !== 'object' || draft === null) return false;

  const d = draft as Draft;
  if (typeof d.pages !== 'object') return false;
  if (typeof d.assets !== 'object') return false;
  if (typeof d.savedAt !== 'string') return false;

  return true;
}

/**
 * Get draft size estimate
 */
export function getDraftSize(draft: Draft): number {
  return JSON.stringify(draft).length * 2; // UTF-16
}

/**
 * Check if there's room for a new draft
 */
export function canSaveDraft(estimatedSize: number): boolean {
  const { used, available } = getLocalStorageUsage();
  return (used + estimatedSize) < available * 0.95; // Leave 5% buffer
}
