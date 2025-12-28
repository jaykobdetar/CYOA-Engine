// Shared utility functions

import type { ParsedPageId, VariableValue } from '../types';

/**
 * Sanitize a filename to prevent path traversal and invalid characters
 */
export function sanitizeFilename(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/\.{2,}/g, '.')
    .replace(/^\.+|\.+$/g, '');
}

/**
 * Parse a page ID into its numeric and path components
 * e.g., "3ab" -> { num: 3, path: "ab" }
 */
export function parsePageId(id: string): ParsedPageId | null {
  const match = id.match(/^(\d+)([a-e]*)$/i);
  if (!match) return null;
  return {
    num: parseInt(match[1], 10),
    path: match[2].toLowerCase()
  };
}

/**
 * Generate child page IDs for a given page
 * Now supports a-e (5 choices) instead of just a-b
 */
export function getChildIds(pageId: string, choiceCount: number = 2): Record<string, string> {
  const parsed = parsePageId(pageId);
  if (!parsed) return {};

  const nextNum = parsed.num + 1;
  const basePath = parsed.path;
  const letters = 'abcde'.slice(0, choiceCount);

  const children: Record<string, string> = {};
  for (const letter of letters) {
    children[letter] = `${nextNum}${basePath}${letter}`;
  }

  return children;
}

/**
 * Get all descendant page IDs recursively
 */
export function getDescendants(
  pageId: string,
  pages: Record<string, unknown>,
  maxChoices: number = 5
): string[] {
  const descendants: string[] = [];
  const queue = [pageId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const children = getChildIds(current, maxChoices);

    for (const childId of Object.values(children)) {
      if (pages[childId]) {
        descendants.push(childId);
        queue.push(childId);
      }
    }
  }

  return descendants;
}

/**
 * Get the parent page ID
 */
export function getParentId(pageId: string): string | null {
  const parsed = parsePageId(pageId);
  if (!parsed || parsed.num <= 1) return null;

  const parentPath = parsed.path.slice(0, -1);
  const parentNum = parsed.num - 1;

  return parentNum === 1 && parentPath === '' ? '1' : `${parentNum}${parentPath}`;
}

/**
 * Compare page IDs for sorting
 */
export function comparePageIds(a: string, b: string): number {
  const pa = parsePageId(a);
  const pb = parsePageId(b);

  if (!pa || !pb) return a.localeCompare(b);

  if (pa.num !== pb.num) return pa.num - pb.num;
  return pa.path.localeCompare(pb.path);
}

/**
 * Debounce a function
 */
export function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;

  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Throttle a function
 */
export function throttle<T extends (...args: unknown[]) => void>(
  fn: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;

  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => { inThrottle = false; }, limit);
    }
  };
}

/**
 * Generate a unique ID
 */
export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

/**
 * Deep clone an object
 */
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Check if File System Access API is supported
 */
export function isFileSystemAccessSupported(): boolean {
  return 'showDirectoryPicker' in window;
}

/**
 * Count words in text
 */
export function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter(word => word.length > 0)
    .length;
}

/**
 * Count characters in text (excluding whitespace)
 */
export function countCharacters(text: string): number {
  return text.replace(/\s/g, '').length;
}

/**
 * Count paragraphs in text
 */
export function countParagraphs(text: string): number {
  return text
    .split(/\n\n+/)
    .filter(p => p.trim().length > 0)
    .length;
}

/**
 * Escape HTML entities
 */
export function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Parse variable syntax from text
 * Returns array of variable operations found
 */
export interface VariableOperation {
  type: 'set' | 'add' | 'sub' | 'if' | 'endif';
  name: string;
  value?: VariableValue;
  operator?: '==' | '!=' | '>' | '<' | '>=' | '<=';
  fullMatch: string;
}

export function parseVariables(text: string): VariableOperation[] {
  const operations: VariableOperation[] = [];

  // {set:varName=value}
  const setRegex = /\{set:(\w+)=([^}]+)\}/gi;
  let match;
  while ((match = setRegex.exec(text)) !== null) {
    operations.push({
      type: 'set',
      name: match[1],
      value: parseVariableValue(match[2]),
      fullMatch: match[0]
    });
  }

  // {add:varName=value} or {add:varName}
  const addRegex = /\{add:(\w+)(?:=([^}]+))?\}/gi;
  while ((match = addRegex.exec(text)) !== null) {
    operations.push({
      type: 'add',
      name: match[1],
      value: match[2] ? parseVariableValue(match[2]) : 1,
      fullMatch: match[0]
    });
  }

  // {sub:varName=value} or {sub:varName}
  const subRegex = /\{sub:(\w+)(?:=([^}]+))?\}/gi;
  while ((match = subRegex.exec(text)) !== null) {
    operations.push({
      type: 'sub',
      name: match[1],
      value: match[2] ? parseVariableValue(match[2]) : 1,
      fullMatch: match[0]
    });
  }

  // {if:varName} or {if:varName==value} etc.
  const ifRegex = /\{if:(\w+)(?:(==|!=|>=|<=|>|<)([^}]+))?\}/gi;
  while ((match = ifRegex.exec(text)) !== null) {
    operations.push({
      type: 'if',
      name: match[1],
      operator: (match[2] as VariableOperation['operator']) || '==',
      value: match[3] ? parseVariableValue(match[3]) : true,
      fullMatch: match[0]
    });
  }

  // {/if}
  const endifRegex = /\{\/if\}/gi;
  while ((match = endifRegex.exec(text)) !== null) {
    operations.push({
      type: 'endif',
      name: '',
      fullMatch: match[0]
    });
  }

  return operations;
}

/**
 * Parse a string value into appropriate type
 */
export function parseVariableValue(value: string): VariableValue {
  const trimmed = value.trim();

  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;

  const num = Number(trimmed);
  if (!isNaN(num)) return num;

  return trimmed;
}

/**
 * Evaluate a variable condition
 */
export function evaluateCondition(
  variables: Record<string, VariableValue>,
  name: string,
  operator: string = '==',
  compareValue: VariableValue = true
): boolean {
  const value = variables[name];

  if (value === undefined) {
    // Variable doesn't exist
    return operator === '!=' || operator === '==' && compareValue === false;
  }

  switch (operator) {
    case '==':
      return value === compareValue;
    case '!=':
      return value !== compareValue;
    case '>':
      return typeof value === 'number' && typeof compareValue === 'number' && value > compareValue;
    case '<':
      return typeof value === 'number' && typeof compareValue === 'number' && value < compareValue;
    case '>=':
      return typeof value === 'number' && typeof compareValue === 'number' && value >= compareValue;
    case '<=':
      return typeof value === 'number' && typeof compareValue === 'number' && value <= compareValue;
    default:
      return false;
  }
}

/**
 * Parse audio syntax from text
 */
export interface AudioCommand {
  type: 'music' | 'sfx' | 'ambient' | 'stop';
  file: string;
  loop: boolean;
  fullMatch: string;
}

export function parseAudioCommands(text: string): AudioCommand[] {
  const commands: AudioCommand[] = [];

  // {music:filename} or {music:filename:loop}
  const musicRegex = /\{music:([^}:]+)(?::(loop))?\}/gi;
  let match;
  while ((match = musicRegex.exec(text)) !== null) {
    commands.push({
      type: 'music',
      file: match[1],
      loop: match[2] === 'loop',
      fullMatch: match[0]
    });
  }

  // {sfx:filename}
  const sfxRegex = /\{sfx:([^}]+)\}/gi;
  while ((match = sfxRegex.exec(text)) !== null) {
    commands.push({
      type: 'sfx',
      file: match[1],
      loop: false,
      fullMatch: match[0]
    });
  }

  // {ambient:filename} or {filename:loop} (legacy format)
  const ambientRegex = /\{(?:ambient:)?([^}:]+):loop\}/gi;
  while ((match = ambientRegex.exec(text)) !== null) {
    commands.push({
      type: 'ambient',
      file: match[1],
      loop: true,
      fullMatch: match[0]
    });
  }

  // {stop:music} or {stop:all}
  const stopRegex = /\{stop:(music|sfx|ambient|all)\}/gi;
  while ((match = stopRegex.exec(text)) !== null) {
    commands.push({
      type: 'stop',
      file: match[1],
      loop: false,
      fullMatch: match[0]
    });
  }

  return commands;
}

/**
 * Parse goto syntax from text
 */
export interface GotoCommand {
  pageId: string;
  fullMatch: string;
}

export function parseGotoCommands(text: string): GotoCommand[] {
  const commands: GotoCommand[] = [];

  // {goto:pageId}
  const gotoRegex = /\{goto:(\d+[a-e]*)\}/gi;
  let match;
  while ((match = gotoRegex.exec(text)) !== null) {
    commands.push({
      pageId: match[1].toLowerCase(),
      fullMatch: match[0]
    });
  }

  return commands;
}

/**
 * Parse choice line with optional goto
 * Format: "a) [3ab] Choice text" or "a) Choice text"
 */
export interface ParsedChoice {
  letter: string;
  text: string;
  goto?: string;
}

export function parseChoiceLine(line: string): ParsedChoice | null {
  // Match: letter) [optional-goto] text
  const match = line.match(/^([a-e])\)\s*(?:\[(\d+[a-e]*)\]\s*)?(.+)$/i);
  if (!match) return null;

  return {
    letter: match[1].toLowerCase(),
    text: match[3].trim(),
    goto: match[2]?.toLowerCase()
  };
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Get localStorage usage
 */
export function getLocalStorageUsage(): { used: number; available: number } {
  let used = 0;
  for (const key in localStorage) {
    if (localStorage.hasOwnProperty(key)) {
      used += localStorage[key].length * 2; // UTF-16 characters
    }
  }

  // Most browsers have ~5MB limit
  const available = 5 * 1024 * 1024;

  return { used, available };
}

/**
 * Check if localStorage is near capacity
 */
export function isLocalStorageNearCapacity(threshold: number = 0.9): boolean {
  const { used, available } = getLocalStorageUsage();
  return used / available >= threshold;
}
