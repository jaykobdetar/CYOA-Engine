// Asset loading and management for the engine

import type { FileSystemDirectoryHandle } from '../types';

export interface AssetManager {
  blobUrls: Record<string, string>;
  assetsDir: FileSystemDirectoryHandle | null;
  zipAssets: Record<string, Blob> | null;
  folderFiles: Record<string, File> | null;
}

/**
 * Create asset manager
 */
export function createAssetManager(): AssetManager {
  return {
    blobUrls: {},
    assetsDir: null,
    zipAssets: null,
    folderFiles: null
  };
}

/**
 * Clear cached blob URLs
 */
export function clearAssets(manager: AssetManager): void {
  for (const url of Object.values(manager.blobUrls)) {
    URL.revokeObjectURL(url);
  }
  manager.blobUrls = {};
  manager.assetsDir = null;
  manager.zipAssets = null;
  manager.folderFiles = null;
}

/**
 * Set assets directory handle (File System Access API)
 */
export function setAssetsDirectory(
  manager: AssetManager,
  handle: FileSystemDirectoryHandle
): void {
  clearAssets(manager);
  manager.assetsDir = handle;
}

/**
 * Set assets from ZIP file
 */
export function setZipAssets(
  manager: AssetManager,
  assets: Record<string, Blob>
): void {
  clearAssets(manager);
  manager.zipAssets = assets;
}

/**
 * Set assets from folder input (webkitdirectory)
 */
export function setFolderAssets(
  manager: AssetManager,
  files: Record<string, File>
): void {
  clearAssets(manager);
  manager.folderFiles = files;
}

/**
 * Get asset URL
 */
export async function getAssetUrl(
  manager: AssetManager,
  assetName: string
): Promise<string> {
  // Check cache first
  if (manager.blobUrls[assetName]) {
    return manager.blobUrls[assetName];
  }

  let blob: Blob | null = null;

  // Try File System Access API
  if (manager.assetsDir) {
    try {
      const fileHandle = await manager.assetsDir.getFileHandle(assetName);
      const file = await fileHandle.getFile();
      blob = file;
    } catch (e) {
      // File not found, try with different extensions
      blob = await tryWithExtensions(manager.assetsDir, assetName);
    }
  }

  // Try ZIP assets
  if (!blob && manager.zipAssets) {
    blob = manager.zipAssets[assetName] ||
           manager.zipAssets[`${assetName}.png`] ||
           manager.zipAssets[`${assetName}.jpg`] ||
           manager.zipAssets[`${assetName}.jpeg`] ||
           manager.zipAssets[`${assetName}.gif`] ||
           manager.zipAssets[`${assetName}.webp`] ||
           manager.zipAssets[`${assetName}.mp4`] ||
           manager.zipAssets[`${assetName}.webm`] ||
           manager.zipAssets[`${assetName}.mp3`] ||
           manager.zipAssets[`${assetName}.wav`];
  }

  // Try folder files
  if (!blob && manager.folderFiles) {
    const file = manager.folderFiles[assetName] ||
                 manager.folderFiles[`${assetName}.png`] ||
                 manager.folderFiles[`${assetName}.jpg`] ||
                 manager.folderFiles[`${assetName}.jpeg`] ||
                 manager.folderFiles[`${assetName}.gif`] ||
                 manager.folderFiles[`${assetName}.webp`] ||
                 manager.folderFiles[`${assetName}.mp4`] ||
                 manager.folderFiles[`${assetName}.webm`] ||
                 manager.folderFiles[`${assetName}.mp3`] ||
                 manager.folderFiles[`${assetName}.wav`];
    if (file) blob = file;
  }

  if (!blob) {
    return '';
  }

  // Create blob URL and cache it
  const url = URL.createObjectURL(blob);
  manager.blobUrls[assetName] = url;
  return url;
}

/**
 * Try to find asset with common extensions
 */
async function tryWithExtensions(
  dir: FileSystemDirectoryHandle,
  baseName: string
): Promise<Blob | null> {
  const extensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg',
                      '.mp4', '.webm', '.mov',
                      '.mp3', '.wav', '.ogg', '.flac'];

  for (const ext of extensions) {
    try {
      const fileHandle = await dir.getFileHandle(baseName + ext);
      return await fileHandle.getFile();
    } catch (e) {
      // Continue to next extension
    }
  }

  return null;
}

/**
 * Process asset references in text
 */
export async function processAssets(
  text: string,
  manager: AssetManager
): Promise<string> {
  const regex = /\{([^}:]+?)(?::(\w+))?\}/g;
  const matches = [...text.matchAll(regex)];
  let result = text;

  for (const match of matches) {
    const [fullMatch, assetName, sizeModifier] = match;

    // Skip command syntax
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
      continue;
    }

    const url = await getAssetUrl(manager, assetName);
    if (!url) {
      result = result.replace(fullMatch, '');
      continue;
    }

    const sizeClass = sizeModifier ? `size-${sizeModifier}` : '';

    // Determine asset type
    if (isVideo(assetName)) {
      result = result.replace(
        fullMatch,
        `<video src="${url}" class="story-video ${sizeClass}" controls preload="none"></video>`
      );
    } else if (isAudio(assetName)) {
      // Audio is handled separately by audio module
      result = result.replace(fullMatch, '');
    } else {
      // Image
      result = result.replace(
        fullMatch,
        `<img src="${url}" alt="${assetName}" class="story-image ${sizeClass}">`
      );
    }
  }

  return result;
}

/**
 * Check if asset is a video
 */
function isVideo(name: string): boolean {
  return /\.(mp4|webm|mov|avi|mkv)$/i.test(name);
}

/**
 * Check if asset is audio
 */
function isAudio(name: string): boolean {
  return /\.(mp3|wav|ogg|flac|aac|m4a)$/i.test(name);
}

/**
 * Preload assets for better performance
 */
export async function preloadAssets(
  manager: AssetManager,
  assetNames: string[]
): Promise<void> {
  const promises = assetNames.map(name => getAssetUrl(manager, name));
  await Promise.all(promises);
}

/**
 * Extract asset references from text
 */
export function extractAssetRefs(text: string): string[] {
  const refs: string[] = [];
  const regex = /\{([^}:]+?)(?::(\w+))?\}/g;

  let match;
  while ((match = regex.exec(text)) !== null) {
    const name = match[1];
    // Skip commands
    if (!name.includes(':') && name !== '/if') {
      refs.push(name);
    }
  }

  return refs;
}
