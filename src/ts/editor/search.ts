// Search functionality for the editor

import type { Page, SearchResult, SearchMatch } from '../types';
import { getLineColumn } from '../shared/format';

/**
 * Search across all pages
 */
export function searchPages(
  pages: Record<string, Page>,
  query: string,
  options?: {
    caseSensitive?: boolean;
    wholeWord?: boolean;
    regex?: boolean;
  }
): SearchResult[] {
  if (!query.trim()) return [];

  const results: SearchResult[] = [];
  const flags = options?.caseSensitive ? 'g' : 'gi';

  let pattern: RegExp;
  try {
    if (options?.regex) {
      pattern = new RegExp(query, flags);
    } else if (options?.wholeWord) {
      pattern = new RegExp(`\\b${escapeRegex(query)}\\b`, flags);
    } else {
      pattern = new RegExp(escapeRegex(query), flags);
    }
  } catch (e) {
    // Invalid regex, fall back to literal search
    pattern = new RegExp(escapeRegex(query), flags);
  }

  for (const [pageId, page] of Object.entries(pages)) {
    const matches = findMatches(page.content, pattern);

    // Also search in choice text
    for (const choice of page.choices) {
      if (choice.text) {
        const choiceMatches = findMatches(choice.text, pattern);
        for (const match of choiceMatches) {
          matches.push({
            ...match,
            context: `Choice ${choice.letter}: ${match.context}`
          });
        }
      }
    }

    if (matches.length > 0) {
      results.push({
        pageId,
        matches
      });
    }
  }

  return results;
}

/**
 * Find matches in text
 */
function findMatches(text: string, pattern: RegExp): SearchMatch[] {
  const matches: SearchMatch[] = [];
  let match;

  // Reset lastIndex for global regex
  pattern.lastIndex = 0;

  while ((match = pattern.exec(text)) !== null) {
    const { line, column } = getLineColumn(text, match.index);
    const context = getContext(text, match.index, match[0].length);

    matches.push({
      line,
      column,
      text: match[0],
      context
    });

    // Prevent infinite loop for zero-length matches
    if (match[0].length === 0) {
      pattern.lastIndex++;
    }
  }

  return matches;
}

/**
 * Get context around a match
 */
function getContext(text: string, index: number, length: number, contextLength: number = 40): string {
  const start = Math.max(0, index - contextLength);
  const end = Math.min(text.length, index + length + contextLength);

  let context = text.substring(start, end);

  // Add ellipsis if truncated
  if (start > 0) context = '...' + context;
  if (end < text.length) context = context + '...';

  // Replace newlines with spaces for display
  context = context.replace(/\n/g, ' ');

  return context;
}

/**
 * Escape special regex characters
 */
function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Highlight matches in text for display
 */
export function highlightMatches(text: string, query: string, caseSensitive: boolean = false): string {
  if (!query.trim()) return text;

  const flags = caseSensitive ? 'g' : 'gi';
  const pattern = new RegExp(`(${escapeRegex(query)})`, flags);

  return text.replace(pattern, '<mark>$1</mark>');
}

/**
 * Replace all occurrences in all pages
 */
export function replaceInPages(
  pages: Record<string, Page>,
  searchQuery: string,
  replaceWith: string,
  options?: {
    caseSensitive?: boolean;
    wholeWord?: boolean;
    pageIds?: string[]; // Limit to specific pages
  }
): { pages: Record<string, Page>; replacements: number } {
  const newPages: Record<string, Page> = {};
  let totalReplacements = 0;

  const flags = options?.caseSensitive ? 'g' : 'gi';
  let pattern: RegExp;

  try {
    if (options?.wholeWord) {
      pattern = new RegExp(`\\b${escapeRegex(searchQuery)}\\b`, flags);
    } else {
      pattern = new RegExp(escapeRegex(searchQuery), flags);
    }
  } catch (e) {
    return { pages, replacements: 0 };
  }

  for (const [pageId, page] of Object.entries(pages)) {
    // Skip if not in target pages
    if (options?.pageIds && !options.pageIds.includes(pageId)) {
      newPages[pageId] = page;
      continue;
    }

    const newPage = { ...page };
    let pageReplacements = 0;

    // Count and replace in content
    const contentMatches = page.content.match(pattern) || [];
    pageReplacements += contentMatches.length;
    newPage.content = page.content.replace(pattern, replaceWith);

    // Replace in choices
    newPage.choices = page.choices.map(choice => {
      const choiceMatches = choice.text.match(pattern) || [];
      pageReplacements += choiceMatches.length;
      return {
        ...choice,
        text: choice.text.replace(pattern, replaceWith)
      };
    });

    totalReplacements += pageReplacements;
    newPages[pageId] = newPage;
  }

  return { pages: newPages, replacements: totalReplacements };
}

/**
 * Find pages with specific criteria
 */
export interface PageFilter {
  hasContent?: boolean;
  isEmpty?: boolean;
  isEnding?: boolean;
  hasChoices?: boolean;
  isOrphan?: boolean;
  hasAssetRefs?: boolean;
  contentContains?: string;
}

export function filterPages(
  pages: Record<string, Page>,
  filter: PageFilter
): string[] {
  const matches: string[] = [];

  for (const [pageId, page] of Object.entries(pages)) {
    let matches_filter = true;

    if (filter.hasContent !== undefined) {
      const hasContent = page.content.trim().length > 0;
      if (filter.hasContent !== hasContent) matches_filter = false;
    }

    if (filter.isEmpty !== undefined) {
      const isEmpty = page.content.trim().length === 0;
      if (filter.isEmpty !== isEmpty) matches_filter = false;
    }

    if (filter.isEnding !== undefined) {
      if (filter.isEnding !== page.isEnding) matches_filter = false;
    }

    if (filter.hasChoices !== undefined) {
      if (filter.hasChoices !== page.hasChoices) matches_filter = false;
    }

    if (filter.hasAssetRefs !== undefined) {
      const hasRefs = /\{[^}]+\}/.test(page.content);
      if (filter.hasAssetRefs !== hasRefs) matches_filter = false;
    }

    if (filter.contentContains) {
      const contains = page.content.toLowerCase().includes(filter.contentContains.toLowerCase());
      if (!contains) matches_filter = false;
    }

    if (matches_filter) {
      matches.push(pageId);
    }
  }

  return matches;
}

/**
 * Get search statistics
 */
export interface SearchStats {
  totalMatches: number;
  pagesWithMatches: number;
  matchesByPage: Record<string, number>;
}

export function getSearchStats(results: SearchResult[]): SearchStats {
  const stats: SearchStats = {
    totalMatches: 0,
    pagesWithMatches: results.length,
    matchesByPage: {}
  };

  for (const result of results) {
    stats.matchesByPage[result.pageId] = result.matches.length;
    stats.totalMatches += result.matches.length;
  }

  return stats;
}

/**
 * Create search UI component
 */
export function createSearchPanel(
  onSearch: (query: string, options: { caseSensitive: boolean; wholeWord: boolean }) => void,
  onReplace: (search: string, replace: string, options: { caseSensitive: boolean; wholeWord: boolean; all: boolean }) => void,
  onClose: () => void
): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'search-panel';
  panel.innerHTML = `
    <div class="search-header">
      <h3>Search & Replace</h3>
      <button class="close-btn" title="Close">×</button>
    </div>
    <div class="search-body">
      <div class="search-row">
        <input type="text" id="search-input" placeholder="Search..." />
        <button id="search-btn">Find</button>
      </div>
      <div class="search-row">
        <input type="text" id="replace-input" placeholder="Replace with..." />
        <button id="replace-btn">Replace</button>
        <button id="replace-all-btn">Replace All</button>
      </div>
      <div class="search-options">
        <label>
          <input type="checkbox" id="case-sensitive" />
          Case sensitive
        </label>
        <label>
          <input type="checkbox" id="whole-word" />
          Whole word
        </label>
      </div>
      <div class="search-results" id="search-results">
        <!-- Results will be inserted here -->
      </div>
    </div>
  `;

  const searchInput = panel.querySelector('#search-input') as HTMLInputElement;
  const replaceInput = panel.querySelector('#replace-input') as HTMLInputElement;
  const caseSensitive = panel.querySelector('#case-sensitive') as HTMLInputElement;
  const wholeWord = panel.querySelector('#whole-word') as HTMLInputElement;
  const closeBtn = panel.querySelector('.close-btn') as HTMLButtonElement;
  const searchBtn = panel.querySelector('#search-btn') as HTMLButtonElement;
  const replaceBtn = panel.querySelector('#replace-btn') as HTMLButtonElement;
  const replaceAllBtn = panel.querySelector('#replace-all-btn') as HTMLButtonElement;

  const getOptions = () => ({
    caseSensitive: caseSensitive.checked,
    wholeWord: wholeWord.checked
  });

  searchBtn.onclick = () => onSearch(searchInput.value, getOptions());

  searchInput.onkeydown = (e) => {
    if (e.key === 'Enter') {
      onSearch(searchInput.value, getOptions());
    }
  };

  replaceBtn.onclick = () => {
    onReplace(searchInput.value, replaceInput.value, { ...getOptions(), all: false });
  };

  replaceAllBtn.onclick = () => {
    onReplace(searchInput.value, replaceInput.value, { ...getOptions(), all: true });
  };

  closeBtn.onclick = onClose;

  return panel;
}

/**
 * Display search results
 */
export function displaySearchResults(
  container: HTMLElement,
  results: SearchResult[],
  onNavigate: (pageId: string, matchIndex: number) => void
): void {
  if (results.length === 0) {
    container.innerHTML = '<p class="no-results">No matches found</p>';
    return;
  }

  const stats = getSearchStats(results);
  container.innerHTML = `
    <p class="results-summary">
      Found ${stats.totalMatches} match${stats.totalMatches !== 1 ? 'es' : ''}
      in ${stats.pagesWithMatches} page${stats.pagesWithMatches !== 1 ? 's' : ''}
    </p>
    <div class="results-list">
      ${results.map(result => `
        <div class="result-group">
          <div class="result-page" data-page="${result.pageId}">
            <span class="page-id">${result.pageId}</span>
            <span class="match-count">(${result.matches.length})</span>
          </div>
          ${result.matches.map((match, i) => `
            <div class="result-match" data-page="${result.pageId}" data-index="${i}">
              <span class="line-number">L${match.line}</span>
              <span class="match-context">${escapeHtml(match.context)}</span>
            </div>
          `).join('')}
        </div>
      `).join('')}
    </div>
  `;

  // Add click handlers
  container.querySelectorAll('.result-page, .result-match').forEach(el => {
    el.addEventListener('click', () => {
      const pageId = el.getAttribute('data-page') || '';
      const index = parseInt(el.getAttribute('data-index') || '0');
      onNavigate(pageId, index);
    });
  });
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
