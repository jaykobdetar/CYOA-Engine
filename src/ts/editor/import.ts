// Import functionality for the editor

import type { Page, ImportResult, Choice, FileSystemFileHandle, FileSystemHandle, FileSystemDirectoryHandle } from '../types';
import { sanitizeFilename, parsePageId } from '../shared/utils';
import { blobToDataURL } from './assets';

/**
 * Import a story from a ZIP file
 */
export async function importFromZip(zipFile: File): Promise<ImportResult> {
  const result: ImportResult = {
    success: false,
    pages: {},
    assets: {},
    errors: []
  };

  try {
    const zip = new JSZip();
    await zip.loadAsync(zipFile);

    // Find the story folder (might be nested)
    let rootPath = '';
    const entries = Object.keys(zip.files);

    // Check if files are in a subdirectory
    const firstEntry = entries.find(e => !zip.files[e].dir);
    if (firstEntry && firstEntry.includes('/')) {
      rootPath = firstEntry.split('/')[0] + '/';
    }

    // Process text files as pages
    for (const [path, file] of Object.entries(zip.files)) {
      if (file.dir) continue;

      const relativePath = path.replace(rootPath, '');

      // Skip assets folder for now
      if (relativePath.startsWith('assets/')) continue;

      // Check for metadata file
      if (relativePath === 'story.json' || relativePath === 'metadata.json') {
        try {
          const content = await file.async('string');
          result.metadata = JSON.parse(content);
        } catch (e) {
          result.errors?.push(`Failed to parse metadata: ${e}`);
        }
        continue;
      }

      // Process page files
      if (relativePath.endsWith('.txt')) {
        const pageId = relativePath.replace('.txt', '');
        const parsed = parsePageId(pageId);

        if (!parsed) {
          result.errors?.push(`Invalid page ID: ${pageId}`);
          continue;
        }

        try {
          const content = await file.async('string');
          const page = parsePageContent(content);
          result.pages[pageId] = page;
        } catch (e) {
          result.errors?.push(`Failed to read page ${pageId}: ${e}`);
        }
      }
    }

    // Process assets
    const assetsPath = rootPath + 'assets/';
    for (const [path, file] of Object.entries(zip.files)) {
      if (file.dir) continue;
      if (!path.startsWith(assetsPath)) continue;

      const filename = path.replace(assetsPath, '');
      if (!filename) continue;

      try {
        const blob = await file.async('blob');
        const dataUrl = await blobToDataURL(blob);
        const safeName = sanitizeFilename(filename);

        result.assets[safeName] = {
          data: dataUrl,
          type: blob.type || guessMimeType(filename)
        };
      } catch (e) {
        result.errors?.push(`Failed to read asset ${filename}: ${e}`);
      }
    }

    result.success = Object.keys(result.pages).length > 0;

    if (!result.pages['1']) {
      result.errors?.push('No starting page (1.txt) found');
    }
  } catch (error) {
    result.errors?.push(`Failed to read ZIP file: ${error}`);
  }

  return result;
}

/**
 * Import a story from a folder (using File System Access API)
 */
export async function importFromFolder(
  dirHandle: FileSystemDirectoryHandle
): Promise<ImportResult> {
  const result: ImportResult = {
    success: false,
    pages: {},
    assets: {},
    errors: []
  };

  try {
    // Process files in the directory
    // Type assertion needed as native FileSystemDirectoryHandle may not have values() in all TS versions
    const dirWithValues = dirHandle as unknown as { values(): AsyncIterableIterator<FileSystemHandle> };
    for await (const entry of dirWithValues.values()) {
      if (entry.kind === 'directory' && entry.name === 'assets') {
        // Process assets subdirectory
        const assetsDir = await dirHandle.getDirectoryHandle('assets');
        await processAssetsDirectory(assetsDir, result);
      } else if (entry.kind === 'file') {
        const fileHandle = entry as FileSystemFileHandle;
        const file = await fileHandle.getFile();

        // Check for metadata
        if (file.name === 'story.json' || file.name === 'metadata.json') {
          try {
            const content = await file.text();
            result.metadata = JSON.parse(content);
          } catch (e) {
            result.errors?.push(`Failed to parse metadata: ${e}`);
          }
          continue;
        }

        // Process page files
        if (file.name.endsWith('.txt')) {
          const pageId = file.name.replace('.txt', '');
          const parsed = parsePageId(pageId);

          if (!parsed) {
            result.errors?.push(`Invalid page ID: ${pageId}`);
            continue;
          }

          try {
            const content = await file.text();
            const page = parsePageContent(content);
            result.pages[pageId] = page;
          } catch (e) {
            result.errors?.push(`Failed to read page ${pageId}: ${e}`);
          }
        }
      }
    }

    result.success = Object.keys(result.pages).length > 0;

    if (!result.pages['1']) {
      result.errors?.push('No starting page (1.txt) found');
    }
  } catch (error) {
    result.errors?.push(`Failed to read folder: ${error}`);
  }

  return result;
}

/**
 * Import from folder using webkitdirectory input (Firefox/Safari fallback)
 */
export async function importFromFolderInput(files: FileList): Promise<ImportResult> {
  const result: ImportResult = {
    success: false,
    pages: {},
    assets: {},
    errors: []
  };

  try {
    for (const file of Array.from(files)) {
      const path = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
      const parts = path.split('/');

      // Skip the root folder name
      const relativePath = parts.slice(1).join('/');

      // Check for assets folder
      if (relativePath.startsWith('assets/')) {
        const filename = relativePath.replace('assets/', '');
        if (!filename) continue;

        try {
          const dataUrl = await readFileAsDataURL(file);
          const safeName = sanitizeFilename(filename);

          result.assets[safeName] = {
            data: dataUrl,
            type: file.type || guessMimeType(filename)
          };
        } catch (e) {
          result.errors?.push(`Failed to read asset ${filename}: ${e}`);
        }
        continue;
      }

      // Check for metadata
      if (relativePath === 'story.json' || relativePath === 'metadata.json') {
        try {
          const content = await file.text();
          result.metadata = JSON.parse(content);
        } catch (e) {
          result.errors?.push(`Failed to parse metadata: ${e}`);
        }
        continue;
      }

      // Process page files
      if (relativePath.endsWith('.txt')) {
        const pageId = relativePath.replace('.txt', '');
        const parsed = parsePageId(pageId);

        if (!parsed) {
          result.errors?.push(`Invalid page ID: ${pageId}`);
          continue;
        }

        try {
          const content = await file.text();
          const page = parsePageContent(content);
          result.pages[pageId] = page;
        } catch (e) {
          result.errors?.push(`Failed to read page ${pageId}: ${e}`);
        }
      }
    }

    result.success = Object.keys(result.pages).length > 0;

    if (!result.pages['1']) {
      result.errors?.push('No starting page (1.txt) found');
    }
  } catch (error) {
    result.errors?.push(`Failed to read files: ${error}`);
  }

  return result;
}

/**
 * Process assets directory
 */
async function processAssetsDirectory(
  dirHandle: FileSystemDirectoryHandle,
  result: ImportResult
): Promise<void> {
  const dirWithValues = dirHandle as unknown as { values(): AsyncIterableIterator<FileSystemHandle> };
  for await (const entry of dirWithValues.values()) {
    if (entry.kind !== 'file') continue;

    const fileHandle = entry as FileSystemFileHandle;
    const file = await fileHandle.getFile();

    try {
      const dataUrl = await readFileAsDataURL(file);
      const safeName = sanitizeFilename(file.name);

      result.assets[safeName] = {
        data: dataUrl,
        type: file.type || guessMimeType(file.name)
      };
    } catch (e) {
      result.errors?.push(`Failed to read asset ${file.name}: ${e}`);
    }
  }
}

/**
 * Parse page content from text file format
 */
function parsePageContent(content: string): Page {
  const choices: Choice[] = [];
  let storyText = content;

  // Match choice lines: a) text or a) [goto] text
  const choicePattern = /^([a-e])\)\s*(?:\[(\d+[a-e]*)\]\s*)?(.+)$/gim;
  let match;

  while ((match = choicePattern.exec(content)) !== null) {
    choices.push({
      letter: match[1].toLowerCase(),
      text: match[3].trim(),
      goto: match[2]?.toLowerCase()
    });
  }

  // Remove choice lines from story text
  storyText = content.replace(/^[a-e]\)\s*(?:\[\d+[a-e]*\]\s*)?.+$/gim, '').trim();

  // Determine page type
  const hasChoices = choices.length > 0;
  const isEnding = content.toLowerCase().includes('[end]') ||
                   content.toLowerCase().includes('the end') ||
                   (!hasChoices && !content.includes('{goto:'));

  return {
    content: storyText,
    hasChoices,
    isEnding: isEnding && !hasChoices,
    choices: hasChoices ? choices : [
      { letter: 'a', text: '' },
      { letter: 'b', text: '' }
    ]
  };
}

/**
 * Read file as data URL
 */
function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Guess MIME type from filename
 */
function guessMimeType(filename: string): string {
  const ext = filename.toLowerCase().split('.').pop() || '';

  const mimeTypes: Record<string, string> = {
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'svg': 'image/svg+xml',
    'mp4': 'video/mp4',
    'webm': 'video/webm',
    'mov': 'video/quicktime',
    'mp3': 'audio/mpeg',
    'wav': 'audio/wav',
    'ogg': 'audio/ogg',
    'flac': 'audio/flac'
  };

  return mimeTypes[ext] || 'application/octet-stream';
}

/**
 * Validate imported story
 */
export function validateImport(result: ImportResult): string[] {
  const warnings: string[] = [];

  if (!result.pages['1']) {
    warnings.push('Story is missing the starting page (1.txt)');
  }

  // Check for orphan pages
  const reachable = new Set<string>(['1']);
  const queue = ['1'];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const page = result.pages[current];
    if (!page) continue;

    if (page.hasChoices) {
      for (const choice of page.choices) {
        const parsed = parsePageId(current);
        if (!parsed) continue;

        const nextNum = parsed.num + 1;
        const targetId = choice.goto || `${nextNum}${parsed.path}${choice.letter}`;

        if (result.pages[targetId] && !reachable.has(targetId)) {
          reachable.add(targetId);
          queue.push(targetId);
        }
      }
    } else if (!page.isEnding) {
      // Continue page
      const parsed = parsePageId(current);
      if (parsed) {
        const nextId = `${parsed.num + 1}${parsed.path}`;
        if (result.pages[nextId] && !reachable.has(nextId)) {
          reachable.add(nextId);
          queue.push(nextId);
        }
      }
    }
  }

  const orphans = Object.keys(result.pages).filter(id => !reachable.has(id));
  if (orphans.length > 0) {
    warnings.push(`${orphans.length} unreachable page(s): ${orphans.slice(0, 5).join(', ')}${orphans.length > 5 ? '...' : ''}`);
  }

  return warnings;
}
