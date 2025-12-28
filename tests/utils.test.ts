import { describe, it, expect } from 'vitest';
import {
  sanitizeFilename,
  parsePageId,
  getChildIds,
  getDescendants,
  comparePageIds,
  countWords,
  countCharacters,
  countParagraphs,
  parseVariables,
  evaluateCondition,
  parseAudioCommands,
  parseGotoCommands,
  parseChoiceLine
} from '../src/ts/shared/utils';

describe('sanitizeFilename', () => {
  it('should remove special characters', () => {
    expect(sanitizeFilename('hello<>world')).toBe('hello__world');
    expect(sanitizeFilename('test:file')).toBe('test_file');
    expect(sanitizeFilename('my/path\\file')).toBe('my_path_file');
  });

  it('should handle normal filenames', () => {
    expect(sanitizeFilename('image.png')).toBe('image.png');
    expect(sanitizeFilename('my-file_2024.txt')).toBe('my-file_2024.txt');
  });

  it('should collapse multiple dots', () => {
    expect(sanitizeFilename('file..name')).toBe('file.name');
    expect(sanitizeFilename('test...txt')).toBe('test.txt');
  });

  it('should handle edge cases', () => {
    expect(sanitizeFilename('')).toBe('');
    expect(sanitizeFilename('   ')).toBe('___');
  });
});

describe('parsePageId', () => {
  it('should parse simple page numbers', () => {
    expect(parsePageId('1')).toEqual({ num: 1, path: '' });
    expect(parsePageId('5')).toEqual({ num: 5, path: '' });
    expect(parsePageId('100')).toEqual({ num: 100, path: '' });
  });

  it('should parse page numbers with paths', () => {
    expect(parsePageId('2a')).toEqual({ num: 2, path: 'a' });
    expect(parsePageId('3ab')).toEqual({ num: 3, path: 'ab' });
    expect(parsePageId('5baba')).toEqual({ num: 5, path: 'baba' });
  });

  it('should handle extended choices (a-e)', () => {
    expect(parsePageId('2c')).toEqual({ num: 2, path: 'c' });
    expect(parsePageId('3de')).toEqual({ num: 3, path: 'de' });
    expect(parsePageId('4abcde')).toEqual({ num: 4, path: 'abcde' });
  });

  it('should return null for invalid IDs', () => {
    expect(parsePageId('')).toBeNull();
    expect(parsePageId('abc')).toBeNull();
    expect(parsePageId('1f')).toBeNull(); // f is not valid
    expect(parsePageId('1-a')).toBeNull();
  });
});

describe('getChildIds', () => {
  it('should generate child IDs for 2 choices', () => {
    expect(getChildIds('1', 2)).toEqual({ a: '2a', b: '2b' });
    expect(getChildIds('2a', 2)).toEqual({ a: '3aa', b: '3ab' });
  });

  it('should generate child IDs for 5 choices', () => {
    const children = getChildIds('1', 5);
    expect(children).toEqual({
      a: '2a',
      b: '2b',
      c: '2c',
      d: '2d',
      e: '2e'
    });
  });

  it('should handle complex paths', () => {
    expect(getChildIds('3ab', 2)).toEqual({ a: '4aba', b: '4abb' });
  });
});

describe('getDescendants', () => {
  it('should find all descendants', () => {
    const pages = {
      '1': {},
      '2a': {},
      '2b': {},
      '3aa': {},
      '3ab': {},
      '3ba': {}
    };

    const descendants = getDescendants('1', pages);
    expect(descendants).toContain('2a');
    expect(descendants).toContain('2b');
    expect(descendants).toContain('3aa');
    expect(descendants).toContain('3ab');
    expect(descendants).toContain('3ba');
  });

  it('should return empty for pages with no children', () => {
    const pages = { '1': {} };
    expect(getDescendants('1', pages)).toEqual([]);
  });
});

describe('comparePageIds', () => {
  it('should sort by number first', () => {
    expect(comparePageIds('1', '2')).toBeLessThan(0);
    expect(comparePageIds('10', '2')).toBeGreaterThan(0);
  });

  it('should sort by path second', () => {
    expect(comparePageIds('2a', '2b')).toBeLessThan(0);
    expect(comparePageIds('2b', '2a')).toBeGreaterThan(0);
  });

  it('should handle equal IDs', () => {
    expect(comparePageIds('2a', '2a')).toBe(0);
  });
});

describe('countWords', () => {
  it('should count words correctly', () => {
    expect(countWords('hello world')).toBe(2);
    expect(countWords('one two three four five')).toBe(5);
  });

  it('should handle empty and whitespace', () => {
    expect(countWords('')).toBe(0);
    expect(countWords('   ')).toBe(0);
  });

  it('should handle multiple spaces', () => {
    expect(countWords('hello    world')).toBe(2);
  });
});

describe('countCharacters', () => {
  it('should count non-whitespace characters', () => {
    expect(countCharacters('hello')).toBe(5);
    expect(countCharacters('hello world')).toBe(10);
  });
});

describe('countParagraphs', () => {
  it('should count paragraphs', () => {
    expect(countParagraphs('one\n\ntwo\n\nthree')).toBe(3);
    expect(countParagraphs('single paragraph')).toBe(1);
  });

  it('should handle empty paragraphs', () => {
    expect(countParagraphs('')).toBe(0);
    expect(countParagraphs('\n\n\n')).toBe(0);
  });
});

describe('parseVariables', () => {
  it('should parse set operations', () => {
    const ops = parseVariables('{set:coins=10}');
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({
      type: 'set',
      name: 'coins',
      value: 10
    });
  });

  it('should parse add operations', () => {
    const ops = parseVariables('{add:score=5}');
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({
      type: 'add',
      name: 'score',
      value: 5
    });
  });

  it('should parse if conditions', () => {
    const ops = parseVariables('{if:hasKey}');
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({
      type: 'if',
      name: 'hasKey'
    });
  });

  it('should parse comparisons', () => {
    const ops = parseVariables('{if:coins>=10}');
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({
      type: 'if',
      name: 'coins',
      operator: '>=',
      value: 10
    });
  });
});

describe('evaluateCondition', () => {
  it('should evaluate equality', () => {
    expect(evaluateCondition({ hasKey: true }, 'hasKey', '==', true)).toBe(true);
    expect(evaluateCondition({ hasKey: false }, 'hasKey', '==', true)).toBe(false);
  });

  it('should evaluate comparisons', () => {
    expect(evaluateCondition({ coins: 15 }, 'coins', '>=', 10)).toBe(true);
    expect(evaluateCondition({ coins: 5 }, 'coins', '>=', 10)).toBe(false);
    expect(evaluateCondition({ coins: 5 }, 'coins', '<', 10)).toBe(true);
  });

  it('should handle undefined variables', () => {
    expect(evaluateCondition({}, 'missing', '==', true)).toBe(false);
    expect(evaluateCondition({}, 'missing', '!=', true)).toBe(true);
  });
});

describe('parseAudioCommands', () => {
  it('should parse music commands', () => {
    const cmds = parseAudioCommands('{music:song.mp3}');
    expect(cmds).toHaveLength(1);
    expect(cmds[0]).toMatchObject({
      type: 'music',
      file: 'song.mp3',
      loop: false
    });
  });

  it('should parse music with loop', () => {
    const cmds = parseAudioCommands('{music:ambient.mp3:loop}');
    expect(cmds).toHaveLength(1);
    expect(cmds[0]).toMatchObject({
      type: 'music',
      file: 'ambient.mp3',
      loop: true
    });
  });

  it('should parse sfx commands', () => {
    const cmds = parseAudioCommands('{sfx:click.wav}');
    expect(cmds).toHaveLength(1);
    expect(cmds[0]).toMatchObject({
      type: 'sfx',
      file: 'click.wav'
    });
  });
});

describe('parseGotoCommands', () => {
  it('should parse goto commands', () => {
    const cmds = parseGotoCommands('{goto:3ab}');
    expect(cmds).toHaveLength(1);
    expect(cmds[0]).toMatchObject({
      pageId: '3ab'
    });
  });

  it('should handle multiple gotos', () => {
    const cmds = parseGotoCommands('{goto:1} and {goto:5de}');
    expect(cmds).toHaveLength(2);
  });
});

describe('parseChoiceLine', () => {
  it('should parse simple choice', () => {
    const choice = parseChoiceLine('a) Go left');
    expect(choice).toMatchObject({
      letter: 'a',
      text: 'Go left'
    });
  });

  it('should parse choice with goto', () => {
    const choice = parseChoiceLine('b) [3ab] Return to the cave');
    expect(choice).toMatchObject({
      letter: 'b',
      text: 'Return to the cave',
      goto: '3ab'
    });
  });

  it('should handle all choice letters', () => {
    expect(parseChoiceLine('c) Third option')).toMatchObject({ letter: 'c' });
    expect(parseChoiceLine('d) Fourth option')).toMatchObject({ letter: 'd' });
    expect(parseChoiceLine('e) Fifth option')).toMatchObject({ letter: 'e' });
  });

  it('should return null for invalid lines', () => {
    expect(parseChoiceLine('not a choice')).toBeNull();
    expect(parseChoiceLine('f) Invalid letter')).toBeNull();
  });
});
