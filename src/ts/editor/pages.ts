// Page management for the editor

import type { Page, LegacyPage, Choice, ValidationResult, WordCountStats } from '../types';
import { parsePageId, getChildIds, getDescendants, comparePageIds, countWords, countCharacters, countParagraphs } from '../shared/utils';

/**
 * Convert legacy page format to new format
 */
export function convertLegacyPage(legacy: LegacyPage): Page {
  const choices: Choice[] = [];

  if (legacy.hasChoices) {
    if (legacy.choiceA) {
      choices.push({ letter: 'a', text: legacy.choiceA });
    }
    if (legacy.choiceB) {
      choices.push({ letter: 'b', text: legacy.choiceB });
    }
  }

  return {
    content: legacy.content,
    hasChoices: legacy.hasChoices,
    isEnding: legacy.isEnding,
    choices
  };
}

/**
 * Convert new page format to legacy format
 */
export function convertToLegacy(page: Page): LegacyPage {
  const choiceA = page.choices.find(c => c.letter === 'a')?.text || '';
  const choiceB = page.choices.find(c => c.letter === 'b')?.text || '';

  return {
    content: page.content,
    hasChoices: page.hasChoices,
    isEnding: page.isEnding,
    choiceA,
    choiceB
  };
}

/**
 * Check if a page object is in legacy format
 */
export function isLegacyPage(page: unknown): page is LegacyPage {
  return typeof page === 'object' && page !== null &&
    'choiceA' in page && 'choiceB' in page;
}

/**
 * Create an empty page
 */
export function createEmptyPage(hasChoices: boolean = true): Page {
  return {
    content: '',
    hasChoices,
    isEnding: false,
    choices: hasChoices ? [
      { letter: 'a', text: '' },
      { letter: 'b', text: '' }
    ] : []
  };
}

/**
 * Sort page IDs
 */
export function sortPageIds(pageIds: string[]): string[] {
  return [...pageIds].sort(comparePageIds);
}

/**
 * Get page tree structure
 */
export interface PageTreeNode {
  id: string;
  children: PageTreeNode[];
  depth: number;
  isOrphan: boolean;
  isDeadEnd: boolean;
}

export function buildPageTree(pages: Record<string, Page>): PageTreeNode[] {
  const pageIds = Object.keys(pages);
  const visited = new Set<string>();
  const tree: PageTreeNode[] = [];

  // Find all reachable pages starting from page 1
  function buildNode(id: string, depth: number): PageTreeNode | null {
    if (!pages[id] || visited.has(id)) return null;
    visited.add(id);

    const page = pages[id];
    const children: PageTreeNode[] = [];

    if (page.hasChoices && !page.isEnding) {
      const childIds = getChildIds(id, page.choices.length || 2);
      for (const [letter, childId] of Object.entries(childIds)) {
        const choice = page.choices.find(c => c.letter === letter);
        const targetId = choice?.goto || childId;

        if (pages[targetId]) {
          const childNode = buildNode(targetId, depth + 1);
          if (childNode) {
            children.push(childNode);
          }
        }
      }
    } else if (!page.isEnding) {
      // Continue page
      const parsed = parsePageId(id);
      if (parsed) {
        const nextId = `${parsed.num + 1}${parsed.path}`;
        if (pages[nextId]) {
          const childNode = buildNode(nextId, depth + 1);
          if (childNode) {
            children.push(childNode);
          }
        }
      }
    }

    const isDeadEnd = !page.isEnding && children.length === 0 && !page.hasChoices;

    return {
      id,
      children,
      depth,
      isOrphan: false,
      isDeadEnd
    };
  }

  // Build tree from page 1
  if (pages['1']) {
    const rootNode = buildNode('1', 0);
    if (rootNode) {
      tree.push(rootNode);
    }
  }

  // Find orphan pages (not reachable from page 1)
  for (const id of pageIds) {
    if (!visited.has(id)) {
      tree.push({
        id,
        children: [],
        depth: 0,
        isOrphan: true,
        isDeadEnd: false
      });
    }
  }

  return tree;
}

/**
 * Validate story structure
 */
export function validateStory(pages: Record<string, Page>, assets: Record<string, unknown>): ValidationResult[] {
  const results: ValidationResult[] = [];
  const pageIds = Object.keys(pages);

  // Check for empty pages
  for (const id of pageIds) {
    const page = pages[id];
    if (!page.content.trim() && !page.isEnding) {
      results.push({
        type: 'warning',
        message: 'Page has no content',
        pageId: id
      });
    }
  }

  // Check for orphan pages
  const tree = buildPageTree(pages);
  const flatTree = flattenTree(tree);

  for (const node of flatTree) {
    if (node.isOrphan) {
      results.push({
        type: 'warning',
        message: 'Page is not reachable from the start',
        pageId: node.id
      });
    }
  }

  // Check for dead ends
  for (const node of flatTree) {
    if (node.isDeadEnd) {
      results.push({
        type: 'warning',
        message: 'Page has no choices and is not marked as ending',
        pageId: node.id
      });
    }
  }

  // Check for missing assets
  for (const id of pageIds) {
    const page = pages[id];
    const assetRefs = extractAssetReferences(page.content);

    for (const assetName of assetRefs) {
      // Check with and without extension
      const exists = assets[assetName] ||
                    assets[`${assetName}.png`] ||
                    assets[`${assetName}.jpg`] ||
                    assets[`${assetName}.jpeg`] ||
                    assets[`${assetName}.gif`] ||
                    assets[`${assetName}.webp`] ||
                    assets[`${assetName}.mp4`] ||
                    assets[`${assetName}.webm`] ||
                    assets[`${assetName}.mp3`] ||
                    assets[`${assetName}.wav`];

      if (!exists) {
        results.push({
          type: 'warning',
          message: `Missing asset: ${assetName}`,
          pageId: id
        });
      }
    }
  }

  // Check for missing choice pages
  for (const id of pageIds) {
    const page = pages[id];
    if (page.hasChoices && !page.isEnding) {
      const childIds = getChildIds(id, page.choices.length || 2);

      for (const [letter, childId] of Object.entries(childIds)) {
        const choice = page.choices.find(c => c.letter === letter);
        if (!choice) continue;

        const targetId = choice.goto || childId;
        if (!pages[targetId]) {
          results.push({
            type: 'info',
            message: `Choice "${letter}" leads to missing page: ${targetId}`,
            pageId: id
          });
        }
      }
    }
  }

  // Check for no starting page
  if (!pages['1']) {
    results.push({
      type: 'error',
      message: 'Story is missing page 1 (starting page)'
    });
  }

  return results;
}

/**
 * Flatten page tree for iteration
 */
function flattenTree(tree: PageTreeNode[]): PageTreeNode[] {
  const result: PageTreeNode[] = [];

  function traverse(node: PageTreeNode) {
    result.push(node);
    for (const child of node.children) {
      traverse(child);
    }
  }

  for (const node of tree) {
    traverse(node);
  }

  return result;
}

/**
 * Extract asset references from text
 */
function extractAssetReferences(text: string): string[] {
  const refs: string[] = [];
  const regex = /\{([^}:]+?)(?::(\w+))?\}/g;

  let match;
  while ((match = regex.exec(text)) !== null) {
    const name = match[1];
    // Skip command syntax
    if (name.includes(':') ||
        name === '/if' ||
        ['set', 'add', 'sub', 'if', 'music', 'sfx', 'ambient', 'goto', 'stop'].some(cmd => name.startsWith(cmd + ':'))) {
      continue;
    }
    refs.push(name);
  }

  return refs;
}

/**
 * Calculate word count for a page
 */
export function getPageStats(page: Page): WordCountStats {
  return {
    characters: countCharacters(page.content),
    words: countWords(page.content),
    paragraphs: countParagraphs(page.content),
    pages: 1
  };
}

/**
 * Calculate total word count for all pages
 */
export function getTotalStats(pages: Record<string, Page>): WordCountStats {
  const stats: WordCountStats = {
    characters: 0,
    words: 0,
    paragraphs: 0,
    pages: Object.keys(pages).length
  };

  for (const page of Object.values(pages)) {
    stats.characters += countCharacters(page.content);
    stats.words += countWords(page.content);
    stats.paragraphs += countParagraphs(page.content);
  }

  return stats;
}

/**
 * Copy a page and optionally its descendants
 */
export function copyPage(
  sourceId: string,
  targetId: string,
  pages: Record<string, Page>,
  includeDescendants: boolean = false
): Record<string, Page> {
  const newPages: Record<string, Page> = {};

  // Copy the source page
  if (pages[sourceId]) {
    newPages[targetId] = JSON.parse(JSON.stringify(pages[sourceId]));
  }

  // Copy descendants if requested
  if (includeDescendants) {
    const descendants = getDescendants(sourceId, pages);
    const sourceParsed = parsePageId(sourceId);
    const targetParsed = parsePageId(targetId);

    if (sourceParsed && targetParsed) {
      for (const descId of descendants) {
        const descParsed = parsePageId(descId);
        if (descParsed) {
          // Calculate the relative path from source
          const relativePath = descParsed.path.slice(sourceParsed.path.length);
          const relativeNum = descParsed.num - sourceParsed.num;

          // Calculate new ID
          const newNum = targetParsed.num + relativeNum;
          const newPath = targetParsed.path + relativePath;
          const newId = `${newNum}${newPath}`;

          newPages[newId] = JSON.parse(JSON.stringify(pages[descId]));
        }
      }
    }
  }

  return newPages;
}

/**
 * Rename a page and update all references
 */
export function renamePage(
  oldId: string,
  newId: string,
  pages: Record<string, Page>
): Record<string, Page> {
  const newPages: Record<string, Page> = {};

  for (const [id, page] of Object.entries(pages)) {
    if (id === oldId) {
      // Rename this page
      newPages[newId] = page;
    } else {
      // Check if any gotos reference the old ID
      const updatedPage = { ...page };
      updatedPage.choices = page.choices.map(choice => {
        if (choice.goto === oldId) {
          return { ...choice, goto: newId };
        }
        return choice;
      });
      newPages[id] = updatedPage;
    }
  }

  return newPages;
}

/**
 * Find the next available page ID at root level
 */
export function getNextRootPageId(pages: Record<string, Page>): string {
  let num = 1;
  while (pages[String(num)]) {
    num++;
  }
  return String(num);
}

/**
 * Find the next continuation page ID for a given page
 */
export function getNextContinuationId(pageId: string, pages: Record<string, Page>): string | null {
  const parsed = parsePageId(pageId);
  if (!parsed) return null;

  const nextId = `${parsed.num + 1}${parsed.path}`;
  if (pages[nextId]) return null; // Already exists

  return nextId;
}
