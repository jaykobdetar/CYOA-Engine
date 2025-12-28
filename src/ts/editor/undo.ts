// Undo/Redo system using command pattern

import type { Page, UndoAction } from '../types';
import { deepClone } from '../shared/utils';

const MAX_UNDO_STACK_SIZE = 50;

export interface UndoManager {
  undoStack: UndoAction[];
  redoStack: UndoAction[];
}

/**
 * Create a new undo manager
 */
export function createUndoManager(): UndoManager {
  return {
    undoStack: [],
    redoStack: []
  };
}

/**
 * Record an edit action
 */
export function recordEdit(
  manager: UndoManager,
  pageId: string,
  before: Page | null,
  after: Page | null
): void {
  const action: UndoAction = {
    type: 'edit',
    pageId,
    before: before ? deepClone(before) : null,
    after: after ? deepClone(after) : null
  };

  pushAction(manager, action);
}

/**
 * Record a delete action
 */
export function recordDelete(
  manager: UndoManager,
  pageId: string,
  deletedPage: Page,
  affectedPages?: Record<string, Page>
): void {
  const action: UndoAction = {
    type: 'delete',
    pageId,
    before: deepClone(deletedPage),
    after: null,
    affectedPages: affectedPages ? deepClone(affectedPages) : undefined
  };

  pushAction(manager, action);
}

/**
 * Record a create action
 */
export function recordCreate(
  manager: UndoManager,
  pageId: string,
  createdPage: Page
): void {
  const action: UndoAction = {
    type: 'create',
    pageId,
    before: null,
    after: deepClone(createdPage)
  };

  pushAction(manager, action);
}

/**
 * Record a rename action
 */
export function recordRename(
  manager: UndoManager,
  oldPageId: string,
  newPageId: string,
  page: Page
): void {
  const action: UndoAction = {
    type: 'rename',
    pageId: oldPageId,
    before: deepClone(page),
    after: deepClone(page),
    affectedPages: { [newPageId]: deepClone(page) }
  };

  pushAction(manager, action);
}

/**
 * Record a move/reorder action
 */
export function recordMove(
  manager: UndoManager,
  pageId: string,
  beforeState: Record<string, Page>,
  afterState: Record<string, Page>
): void {
  const action: UndoAction = {
    type: 'move',
    pageId,
    before: beforeState[pageId] || null,
    after: afterState[pageId] || null,
    affectedPages: deepClone(beforeState)
  };

  pushAction(manager, action);
}

/**
 * Push an action to the undo stack
 */
function pushAction(manager: UndoManager, action: UndoAction): void {
  manager.undoStack.push(action);
  manager.redoStack = []; // Clear redo stack on new action

  // Limit stack size
  if (manager.undoStack.length > MAX_UNDO_STACK_SIZE) {
    manager.undoStack.shift();
  }
}

/**
 * Check if undo is available
 */
export function canUndo(manager: UndoManager): boolean {
  return manager.undoStack.length > 0;
}

/**
 * Check if redo is available
 */
export function canRedo(manager: UndoManager): boolean {
  return manager.redoStack.length > 0;
}

/**
 * Perform undo
 */
export function undo(
  manager: UndoManager,
  pages: Record<string, Page>
): { pages: Record<string, Page>; action: UndoAction } | null {
  const action = manager.undoStack.pop();
  if (!action) return null;

  const newPages = { ...pages };

  switch (action.type) {
    case 'edit':
      if (action.before) {
        newPages[action.pageId] = deepClone(action.before) as Page;
      } else {
        delete newPages[action.pageId];
      }
      break;

    case 'delete':
      // Restore deleted page and descendants
      if (action.before) {
        newPages[action.pageId] = deepClone(action.before) as Page;
      }
      if (action.affectedPages) {
        for (const [id, page] of Object.entries(action.affectedPages)) {
          newPages[id] = deepClone(page) as Page;
        }
      }
      break;

    case 'create':
      delete newPages[action.pageId];
      break;

    case 'rename':
      // Restore old ID
      if (action.before) {
        newPages[action.pageId] = deepClone(action.before) as Page;
      }
      // Remove new ID
      if (action.affectedPages) {
        for (const newId of Object.keys(action.affectedPages)) {
          delete newPages[newId];
        }
      }
      break;

    case 'move':
      // Restore previous state
      if (action.affectedPages) {
        for (const [id, page] of Object.entries(action.affectedPages)) {
          newPages[id] = deepClone(page) as Page;
        }
      }
      break;
  }

  manager.redoStack.push(action);

  return { pages: newPages, action };
}

/**
 * Perform redo
 */
export function redo(
  manager: UndoManager,
  pages: Record<string, Page>
): { pages: Record<string, Page>; action: UndoAction } | null {
  const action = manager.redoStack.pop();
  if (!action) return null;

  const newPages = { ...pages };

  switch (action.type) {
    case 'edit':
      if (action.after) {
        newPages[action.pageId] = deepClone(action.after) as Page;
      } else {
        delete newPages[action.pageId];
      }
      break;

    case 'delete':
      // Delete page and descendants again
      delete newPages[action.pageId];
      if (action.affectedPages) {
        for (const id of Object.keys(action.affectedPages)) {
          delete newPages[id];
        }
      }
      break;

    case 'create':
      if (action.after) {
        newPages[action.pageId] = deepClone(action.after) as Page;
      }
      break;

    case 'rename':
      // Apply new ID
      delete newPages[action.pageId];
      if (action.affectedPages) {
        for (const [newId, page] of Object.entries(action.affectedPages)) {
          newPages[newId] = deepClone(page) as Page;
        }
      }
      break;

    case 'move':
      // Apply after state
      if (action.after) {
        newPages[action.pageId] = deepClone(action.after) as Page;
      }
      break;
  }

  manager.undoStack.push(action);

  return { pages: newPages, action };
}

/**
 * Clear all undo/redo history
 */
export function clearHistory(manager: UndoManager): void {
  manager.undoStack = [];
  manager.redoStack = [];
}

/**
 * Get the last action description for UI
 */
export function getLastActionDescription(manager: UndoManager): string | null {
  const action = manager.undoStack[manager.undoStack.length - 1];
  if (!action) return null;

  switch (action.type) {
    case 'edit':
      return `Edit page ${action.pageId}`;
    case 'delete':
      return `Delete page ${action.pageId}`;
    case 'create':
      return `Create page ${action.pageId}`;
    case 'rename':
      return `Rename page ${action.pageId}`;
    case 'move':
      return `Move page ${action.pageId}`;
    default:
      return null;
  }
}

/**
 * Get undo/redo stack sizes for UI
 */
export function getStackInfo(manager: UndoManager): { undoCount: number; redoCount: number } {
  return {
    undoCount: manager.undoStack.length,
    redoCount: manager.redoStack.length
  };
}

/**
 * Batch multiple actions into one undo step
 */
export function batchActions(
  manager: UndoManager,
  actions: Array<{ type: UndoAction['type']; pageId: string; before: Page | null; after: Page | null }>
): void {
  // For now, just record the first action with all affected pages
  if (actions.length === 0) return;

  const affectedPages: Record<string, Page> = {};
  for (const action of actions) {
    if (action.before) {
      affectedPages[action.pageId] = deepClone(action.before);
    }
  }

  const firstAction = actions[0];
  const batchedAction: UndoAction = {
    type: 'move', // Use move type for batched operations
    pageId: firstAction.pageId,
    before: firstAction.before ? deepClone(firstAction.before) : null,
    after: firstAction.after ? deepClone(firstAction.after) : null,
    affectedPages
  };

  pushAction(manager, batchedAction);
}
