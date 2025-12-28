import { describe, it, expect } from 'vitest';
import {
  createEmptyPage,
  sortPageIds,
  getPageStats,
  getTotalStats,
  copyPage,
  renamePage,
  getNextRootPageId,
  convertLegacyPage,
  convertToLegacy,
  isLegacyPage
} from '../src/ts/editor/pages';
import type { Page, LegacyPage } from '../src/ts/types';

describe('createEmptyPage', () => {
  it('should create page with choices by default', () => {
    const page = createEmptyPage();
    expect(page.hasChoices).toBe(true);
    expect(page.isEnding).toBe(false);
    expect(page.content).toBe('');
    expect(page.choices).toHaveLength(2);
  });

  it('should create page without choices when specified', () => {
    const page = createEmptyPage(false);
    expect(page.hasChoices).toBe(false);
    expect(page.choices).toHaveLength(0);
  });
});

describe('sortPageIds', () => {
  it('should sort by number first', () => {
    const sorted = sortPageIds(['3', '1', '2', '10']);
    expect(sorted).toEqual(['1', '2', '3', '10']);
  });

  it('should sort by path second', () => {
    const sorted = sortPageIds(['2b', '2a', '2c']);
    expect(sorted).toEqual(['2a', '2b', '2c']);
  });

  it('should handle complex sorting', () => {
    const sorted = sortPageIds(['3ab', '2a', '1', '2b', '3aa', '3ba']);
    expect(sorted).toEqual(['1', '2a', '2b', '3aa', '3ab', '3ba']);
  });
});

describe('getPageStats', () => {
  it('should calculate word count', () => {
    const page: Page = {
      content: 'Hello world, this is a test.',
      hasChoices: false,
      isEnding: false,
      choices: []
    };

    const stats = getPageStats(page);
    expect(stats.words).toBe(6);
    expect(stats.pages).toBe(1);
  });

  it('should handle empty pages', () => {
    const page: Page = {
      content: '',
      hasChoices: false,
      isEnding: false,
      choices: []
    };

    const stats = getPageStats(page);
    expect(stats.words).toBe(0);
  });
});

describe('getTotalStats', () => {
  it('should sum stats across pages', () => {
    const pages: Record<string, Page> = {
      '1': { content: 'One two', hasChoices: false, isEnding: false, choices: [] },
      '2a': { content: 'Three four five', hasChoices: false, isEnding: false, choices: [] },
      '2b': { content: 'Six', hasChoices: false, isEnding: false, choices: [] }
    };

    const stats = getTotalStats(pages);
    expect(stats.words).toBe(6);
    expect(stats.pages).toBe(3);
  });
});

describe('copyPage', () => {
  it('should copy a single page', () => {
    const pages: Record<string, Page> = {
      '1': { content: 'Test content', hasChoices: true, isEnding: false, choices: [{ letter: 'a', text: 'Option A' }] }
    };

    const copied = copyPage('1', '2', pages, false);
    expect(copied['2']).toBeDefined();
    expect(copied['2'].content).toBe('Test content');
  });

  it('should not modify original', () => {
    const pages: Record<string, Page> = {
      '1': { content: 'Test', hasChoices: false, isEnding: false, choices: [] }
    };

    const copied = copyPage('1', '2', pages, false);
    copied['2'].content = 'Modified';
    expect(pages['1'].content).toBe('Test');
  });
});

describe('renamePage', () => {
  it('should rename a page', () => {
    const pages: Record<string, Page> = {
      '1': { content: 'Test', hasChoices: false, isEnding: false, choices: [] },
      '2a': { content: 'Two', hasChoices: false, isEnding: false, choices: [] }
    };

    const renamed = renamePage('2a', '2b', pages);
    expect(renamed['2b']).toBeDefined();
    expect(renamed['2a']).toBeUndefined();
  });

  it('should update goto references', () => {
    const pages: Record<string, Page> = {
      '1': {
        content: 'Start',
        hasChoices: true,
        isEnding: false,
        choices: [{ letter: 'a', text: 'Go', goto: '2a' }]
      },
      '2a': { content: 'Target', hasChoices: false, isEnding: false, choices: [] }
    };

    const renamed = renamePage('2a', '2b', pages);
    expect(renamed['1'].choices[0].goto).toBe('2b');
  });
});

describe('getNextRootPageId', () => {
  it('should find first available number', () => {
    const pages: Record<string, Page> = {
      '1': { content: '', hasChoices: false, isEnding: false, choices: [] },
      '2': { content: '', hasChoices: false, isEnding: false, choices: [] }
    };

    expect(getNextRootPageId(pages)).toBe('3');
  });

  it('should fill gaps', () => {
    const pages: Record<string, Page> = {
      '1': { content: '', hasChoices: false, isEnding: false, choices: [] },
      '3': { content: '', hasChoices: false, isEnding: false, choices: [] }
    };

    expect(getNextRootPageId(pages)).toBe('2');
  });
});

describe('Legacy page conversion', () => {
  it('should detect legacy pages', () => {
    const legacy: LegacyPage = {
      content: 'Test',
      hasChoices: true,
      isEnding: false,
      choiceA: 'Option A',
      choiceB: 'Option B'
    };

    const modern: Page = {
      content: 'Test',
      hasChoices: true,
      isEnding: false,
      choices: [{ letter: 'a', text: 'Option A' }]
    };

    expect(isLegacyPage(legacy)).toBe(true);
    expect(isLegacyPage(modern)).toBe(false);
  });

  it('should convert legacy to modern', () => {
    const legacy: LegacyPage = {
      content: 'Test',
      hasChoices: true,
      isEnding: false,
      choiceA: 'Go left',
      choiceB: 'Go right'
    };

    const modern = convertLegacyPage(legacy);
    expect(modern.choices).toHaveLength(2);
    expect(modern.choices[0]).toMatchObject({ letter: 'a', text: 'Go left' });
    expect(modern.choices[1]).toMatchObject({ letter: 'b', text: 'Go right' });
  });

  it('should convert modern to legacy', () => {
    const modern: Page = {
      content: 'Test',
      hasChoices: true,
      isEnding: false,
      choices: [
        { letter: 'a', text: 'Go left' },
        { letter: 'b', text: 'Go right' }
      ]
    };

    const legacy = convertToLegacy(modern);
    expect(legacy.choiceA).toBe('Go left');
    expect(legacy.choiceB).toBe('Go right');
  });
});
