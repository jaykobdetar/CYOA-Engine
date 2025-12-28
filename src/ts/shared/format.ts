// Text formatting utilities

import { parseVariables, evaluateCondition, parseAudioCommands, parseGotoCommands } from './utils';
import type { VariableState } from '../types';

/**
 * Format text with markdown-like syntax
 * Supports: *italic*, **bold**, "smart quotes"
 */
export function formatText(text: string): string {
  let result = text;

  // Bold: **text** or __text__
  result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  result = result.replace(/__(.+?)__/g, '<strong>$1</strong>');

  // Italic: *text* or _text_
  result = result.replace(/\*(.+?)\*/g, '<em>$1</em>');
  result = result.replace(/_(.+?)_/g, '<em>$1</em>');

  // Smart quotes: "text"
  result = result.replace(/"([^"]+)"/g, '"$1"');

  // En-dash: --
  result = result.replace(/--/g, '–');

  // Em-dash: ---
  result = result.replace(/---/g, '—');

  // Ellipsis: ...
  result = result.replace(/\.\.\./g, '…');

  return result;
}

/**
 * Process variables in text - execute operations and conditionals
 */
export function processVariables(
  text: string,
  variables: VariableState
): { text: string; variables: VariableState } {
  const operations = parseVariables(text);
  let result = text;
  const newVariables = { ...variables };

  // Process set/add/sub operations
  for (const op of operations) {
    if (op.type === 'set' && op.value !== undefined) {
      newVariables[op.name] = op.value;
      result = result.replace(op.fullMatch, '');
    } else if (op.type === 'add' && typeof op.value === 'number') {
      const current = typeof newVariables[op.name] === 'number' ? newVariables[op.name] as number : 0;
      newVariables[op.name] = current + op.value;
      result = result.replace(op.fullMatch, '');
    } else if (op.type === 'sub' && typeof op.value === 'number') {
      const current = typeof newVariables[op.name] === 'number' ? newVariables[op.name] as number : 0;
      newVariables[op.name] = current - op.value;
      result = result.replace(op.fullMatch, '');
    }
  }

  // Process conditionals
  result = processConditionals(result, newVariables);

  return { text: result, variables: newVariables };
}

/**
 * Process conditional blocks in text
 */
function processConditionals(text: string, variables: VariableState): string {
  // Match {if:condition}...{/if} blocks
  const conditionalRegex = /\{if:(\w+)(?:(==|!=|>=|<=|>|<)([^}]+))?\}([\s\S]*?)\{\/if\}/gi;

  return text.replace(conditionalRegex, (_match, name, operator, value, content) => {
    const compareValue = value ? parseValue(value.trim()) : true;
    const op = operator || '==';

    if (evaluateCondition(variables, name, op, compareValue)) {
      return content;
    }
    return '';
  });
}

/**
 * Parse a string value to appropriate type
 */
function parseValue(value: string): string | number | boolean {
  if (value === 'true') return true;
  if (value === 'false') return false;
  const num = Number(value);
  if (!isNaN(num)) return num;
  return value;
}

/**
 * Strip variable and audio commands from text for display
 */
export function stripCommands(text: string): string {
  let result = text;

  // Remove variable commands
  result = result.replace(/\{set:\w+=[^}]+\}/gi, '');
  result = result.replace(/\{add:\w+(?:=[^}]+)?\}/gi, '');
  result = result.replace(/\{sub:\w+(?:=[^}]+)?\}/gi, '');

  // Remove audio commands
  result = result.replace(/\{music:[^}]+\}/gi, '');
  result = result.replace(/\{sfx:[^}]+\}/gi, '');
  result = result.replace(/\{ambient:[^}]+\}/gi, '');
  result = result.replace(/\{[^}:]+:loop\}/gi, '');
  result = result.replace(/\{stop:(music|sfx|ambient|all)\}/gi, '');

  // Remove goto commands
  result = result.replace(/\{goto:\d+[a-e]*\}/gi, '');

  return result;
}

/**
 * Convert text to HTML paragraphs
 */
export function textToHtml(text: string): string {
  // Split on double newlines
  const paragraphs = text.split(/\n\n+/);

  return paragraphs
    .map(p => p.trim())
    .filter(p => p)
    .map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`)
    .join('');
}

/**
 * Process asset references in text
 * {assetName} or {assetName:size} -> placeholder for later processing
 */
export function markAssets(text: string): string {
  // Mark assets with data attributes for later processing
  const assetRegex = /\{([^}:]+?)(?::(\w+))?\}/g;

  return text.replace(assetRegex, (match, assetName, size) => {
    // Skip if it's a command
    if (assetName.startsWith('set:') ||
        assetName.startsWith('add:') ||
        assetName.startsWith('sub:') ||
        assetName.startsWith('if:') ||
        assetName.startsWith('music:') ||
        assetName.startsWith('sfx:') ||
        assetName.startsWith('ambient:') ||
        assetName.startsWith('goto:') ||
        assetName.startsWith('stop:') ||
        assetName === '/if') {
      return match;
    }

    const sizeClass = size ? `size-${size}` : '';
    return `<span class="asset-placeholder" data-asset="${assetName}" data-size="${sizeClass}"></span>`;
  });
}

/**
 * Extract choice lines from text
 */
export interface ExtractedChoice {
  letter: string;
  text: string;
  goto?: string;
}

export function extractChoices(text: string): { storyText: string; choices: ExtractedChoice[] } {
  const choices: ExtractedChoice[] = [];
  const choicePattern = /^([a-e])\)\s*(?:\[(\d+[a-e]*)\]\s*)?(.+)$/gim;

  let match;
  while ((match = choicePattern.exec(text)) !== null) {
    choices.push({
      letter: match[1].toLowerCase(),
      text: match[3].trim(),
      goto: match[2]?.toLowerCase()
    });
  }

  // Remove choice lines from story text
  const storyText = text.replace(/^[a-e]\)\s*(?:\[\d+[a-e]*\]\s*)?.+$/gim, '').trim();

  return { storyText, choices };
}

/**
 * Format story content for display
 */
export function formatStoryContent(
  text: string,
  variables: VariableState = {}
): { html: string; variables: VariableState; audioCommands: ReturnType<typeof parseAudioCommands>; gotoCommands: ReturnType<typeof parseGotoCommands> } {
  // Process variables first
  const { text: processedText, variables: newVariables } = processVariables(text, variables);

  // Extract audio commands before stripping
  const audioCommands = parseAudioCommands(processedText);

  // Extract goto commands
  const gotoCommands = parseGotoCommands(processedText);

  // Strip commands from display text
  let displayText = stripCommands(processedText);

  // Apply text formatting
  displayText = formatText(displayText);

  // Mark assets for processing
  displayText = markAssets(displayText);

  // Convert to HTML
  const html = textToHtml(displayText);

  return {
    html,
    variables: newVariables,
    audioCommands,
    gotoCommands
  };
}

/**
 * Highlight search matches in text
 */
export function highlightMatches(text: string, query: string): string {
  if (!query) return text;

  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escapedQuery})`, 'gi');

  return text.replace(regex, '<mark>$1</mark>');
}

/**
 * Truncate text with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 1) + '…';
}

/**
 * Generate line numbers for text
 */
export function generateLineNumbers(text: string): string {
  const lines = text.split('\n');
  return lines.map((_, i) => i + 1).join('\n');
}

/**
 * Get the line and column for a character position
 */
export function getLineColumn(text: string, position: number): { line: number; column: number } {
  const before = text.substring(0, position);
  const lines = before.split('\n');
  return {
    line: lines.length,
    column: lines[lines.length - 1].length + 1
  };
}

/**
 * Format a page ID for display
 */
export function formatPageId(pageId: string): string {
  return `${pageId}.txt`;
}

/**
 * Format a save code
 */
export function formatSaveCode(page: number, path: string): string {
  if (page === 1 && path === '') return '1';
  return `${page}${path}`;
}

/**
 * Format choice path for display
 */
export function formatChoicePath(choices: string[]): string {
  if (choices.length === 0) return '—';
  return choices.join(' → ');
}
