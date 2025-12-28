// Player/game state management for the engine

import type { SaveState, VariableState, StoryMetadata } from '../types';
import { parsePageId } from '../shared/utils';
import { formatSaveCode, formatChoicePath } from '../shared/format';

export interface PlayerState {
  currentPage: number;
  currentPath: string;
  choiceLog: string[];
  variables: VariableState;
  storyFolder: string;
  isPlaying: boolean;
  metadata?: StoryMetadata;
}

/**
 * Create initial player state
 */
export function createPlayerState(): PlayerState {
  return {
    currentPage: 1,
    currentPath: '',
    choiceLog: [],
    variables: {},
    storyFolder: '',
    isPlaying: false
  };
}

/**
 * Start game from a specific page
 */
export function startGame(state: PlayerState, page: number = 1, path: string = ''): PlayerState {
  return {
    ...state,
    currentPage: page,
    currentPath: path,
    choiceLog: path.split('').filter(c => c),
    isPlaying: true
  };
}

/**
 * Make a choice
 */
export function makeChoice(
  state: PlayerState,
  letter: string,
  gotoPage?: string
): PlayerState {
  const newLog = [...state.choiceLog, letter];

  if (gotoPage) {
    // Non-linear jump
    const parsed = parsePageId(gotoPage);
    if (parsed) {
      return {
        ...state,
        currentPage: parsed.num,
        currentPath: parsed.path,
        choiceLog: newLog
      };
    }
  }

  // Standard progression
  return {
    ...state,
    currentPage: state.currentPage + 1,
    currentPath: state.currentPath + letter,
    choiceLog: newLog
  };
}

/**
 * Continue to next page (no choice)
 */
export function continueToNext(state: PlayerState): PlayerState {
  return {
    ...state,
    currentPage: state.currentPage + 1
  };
}

/**
 * Restart the game
 */
export function restart(state: PlayerState): PlayerState {
  return {
    ...state,
    currentPage: 1,
    currentPath: '',
    choiceLog: [],
    variables: {}
  };
}

/**
 * Get current page filename
 */
export function getCurrentFilename(state: PlayerState): string {
  if (state.currentPage === 1 && state.currentPath === '') {
    return '1.txt';
  }
  return `${state.currentPage}${state.currentPath}.txt`;
}

/**
 * Get save code for current position
 */
export function getSaveCode(state: PlayerState): string {
  return formatSaveCode(state.currentPage, state.currentPath);
}

/**
 * Parse a save/page code
 */
export function parsePageCode(code: string): { page: number; path: string } | null {
  const match = code.match(/^(\d+)([a-e]*)$/i);
  if (!match) return null;

  return {
    page: parseInt(match[1], 10),
    path: match[2].toLowerCase()
  };
}

/**
 * Jump to a specific page
 */
export function jumpToPage(state: PlayerState, code: string): PlayerState | null {
  const parsed = parsePageCode(code);
  if (!parsed) return null;

  return {
    ...state,
    currentPage: parsed.page,
    currentPath: parsed.path,
    choiceLog: parsed.path.split('').filter(c => c)
  };
}

/**
 * Get choice path display string
 */
export function getChoicePathDisplay(state: PlayerState): string {
  return formatChoicePath(state.choiceLog);
}

/**
 * Convert player state to save state
 */
export function toSaveState(state: PlayerState): SaveState {
  return {
    page: state.currentPage,
    path: state.currentPath,
    variables: { ...state.variables }
  };
}

/**
 * Load from save state
 */
export function fromSaveState(state: PlayerState, save: SaveState): PlayerState {
  return {
    ...state,
    currentPage: save.page,
    currentPath: save.path,
    choiceLog: save.path.split('').filter(c => c),
    variables: save.variables || {}
  };
}

/**
 * Check if state indicates an ending has been reached
 * (This is determined by the page content, not the state itself)
 */
export function isAtEnding(hasNextPage: boolean, hasChoices: boolean, isMarkedEnding: boolean): boolean {
  return isMarkedEnding || (!hasNextPage && !hasChoices);
}
