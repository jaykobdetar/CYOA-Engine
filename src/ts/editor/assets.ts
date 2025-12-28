// Asset management for the editor

import type { Asset } from '../types';
import { sanitizeFilename } from '../shared/utils';

/**
 * Read a file as a data URL
 */
export function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Process uploaded files into assets
 */
export async function processUploadedFiles(files: FileList): Promise<Record<string, Asset>> {
  const assets: Record<string, Asset> = {};

  for (const file of Array.from(files)) {
    try {
      const data = await readFileAsDataURL(file);
      const safeName = sanitizeFilename(file.name);
      assets[safeName] = {
        data,
        type: file.type
      };
    } catch (error) {
      console.error(`Failed to read file ${file.name}:`, error);
    }
  }

  return assets;
}

/**
 * Get asset type category
 */
export type AssetCategory = 'image' | 'video' | 'audio' | 'unknown';

export function getAssetCategory(filename: string): AssetCategory {
  const ext = filename.toLowerCase().split('.').pop() || '';

  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) {
    return 'image';
  }
  if (['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(ext)) {
    return 'video';
  }
  if (['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'].includes(ext)) {
    return 'audio';
  }

  return 'unknown';
}

/**
 * Get asset icon based on type
 */
export function getAssetIcon(filename: string): string {
  const category = getAssetCategory(filename);

  switch (category) {
    case 'image': return '🖼️';
    case 'video': return '🎬';
    case 'audio': return '🎵';
    default: return '📄';
  }
}

/**
 * Create a preview element for an asset
 */
export function createAssetPreview(asset: Asset, filename: string): HTMLElement {
  const category = getAssetCategory(filename);
  const container = document.createElement('div');
  container.className = 'asset-preview-content';

  if (category === 'image') {
    const img = document.createElement('img');
    img.src = asset.data;
    img.alt = filename;
    container.appendChild(img);
  } else if (category === 'video') {
    const video = document.createElement('video');
    video.src = asset.data;
    video.controls = true;
    video.muted = true;
    video.preload = 'metadata';
    container.appendChild(video);
  } else if (category === 'audio') {
    const audio = document.createElement('audio');
    audio.src = asset.data;
    audio.controls = true;
    audio.preload = 'metadata';
    container.appendChild(audio);
  } else {
    const icon = document.createElement('span');
    icon.textContent = getAssetIcon(filename);
    icon.className = 'asset-icon';
    container.appendChild(icon);
  }

  return container;
}

/**
 * Get file size from data URL
 */
export function getDataURLSize(dataUrl: string): number {
  // Remove the data URL prefix
  const base64 = dataUrl.split(',')[1] || '';
  // Base64 encodes 3 bytes as 4 characters, plus padding
  return Math.floor((base64.length * 3) / 4);
}

/**
 * Format file size for display
 */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Calculate total assets size
 */
export function getTotalAssetsSize(assets: Record<string, Asset>): number {
  let total = 0;
  for (const asset of Object.values(assets)) {
    total += getDataURLSize(asset.data);
  }
  return total;
}

/**
 * Convert data URL to Blob
 */
export function dataURLToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(',');
  const mimeMatch = header.match(/data:([^;]+)/);
  const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';

  const binary = atob(base64);
  const array = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    array[i] = binary.charCodeAt(i);
  }

  return new Blob([array], { type: mime });
}

/**
 * Convert Blob to data URL
 */
export function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * Compress image if too large
 */
export async function compressImage(
  dataUrl: string,
  maxSize: number = 1024 * 1024, // 1MB default
  quality: number = 0.8
): Promise<string> {
  const currentSize = getDataURLSize(dataUrl);
  if (currentSize <= maxSize) {
    return dataUrl;
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }

      // Calculate new dimensions
      let { width, height } = img;
      const ratio = Math.sqrt(maxSize / currentSize);
      width = Math.floor(width * ratio);
      height = Math.floor(height * ratio);

      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);

      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = dataUrl;
  });
}

/**
 * Validate asset filename
 */
export function validateAssetFilename(filename: string): { valid: boolean; message?: string } {
  if (!filename) {
    return { valid: false, message: 'Filename is required' };
  }

  if (filename.length > 255) {
    return { valid: false, message: 'Filename too long' };
  }

  const invalidChars = /[<>:"/\\|?*\x00-\x1f]/;
  if (invalidChars.test(filename)) {
    return { valid: false, message: 'Filename contains invalid characters' };
  }

  const reserved = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i;
  const nameWithoutExt = filename.split('.')[0];
  if (reserved.test(nameWithoutExt)) {
    return { valid: false, message: 'Filename is a reserved system name' };
  }

  return { valid: true };
}

/**
 * Generate asset syntax for insertion
 */
export function generateAssetSyntax(filename: string, size?: 'small' | 'medium'): string {
  if (size) {
    return `{${filename}:${size}}`;
  }
  return `{${filename}}`;
}

/**
 * Parse asset syntax from text
 */
export interface AssetReference {
  filename: string;
  size?: string;
  fullMatch: string;
  startIndex: number;
  endIndex: number;
}

export function parseAssetReferences(text: string): AssetReference[] {
  const refs: AssetReference[] = [];
  const regex = /\{([^}:]+?)(?::(\w+))?\}/g;

  let match;
  while ((match = regex.exec(text)) !== null) {
    const name = match[1];
    // Skip command syntax
    if (name.includes(':') ||
        name === '/if' ||
        ['set', 'add', 'sub', 'if', 'music', 'sfx', 'ambient', 'goto', 'stop'].some(cmd => name.startsWith(cmd))) {
      continue;
    }

    refs.push({
      filename: name,
      size: match[2],
      fullMatch: match[0],
      startIndex: match.index,
      endIndex: match.index + match[0].length
    });
  }

  return refs;
}

/**
 * Find unused assets
 */
export function findUnusedAssets(
  assets: Record<string, Asset>,
  pages: Record<string, { content: string }>
): string[] {
  const usedAssets = new Set<string>();

  // Collect all asset references from pages
  for (const page of Object.values(pages)) {
    const refs = parseAssetReferences(page.content);
    for (const ref of refs) {
      usedAssets.add(ref.filename);
      // Also check with common extensions
      usedAssets.add(`${ref.filename}.png`);
      usedAssets.add(`${ref.filename}.jpg`);
      usedAssets.add(`${ref.filename}.jpeg`);
      usedAssets.add(`${ref.filename}.gif`);
      usedAssets.add(`${ref.filename}.mp4`);
      usedAssets.add(`${ref.filename}.webm`);
      usedAssets.add(`${ref.filename}.mp3`);
      usedAssets.add(`${ref.filename}.wav`);
    }
  }

  // Find assets not in the used set
  const unused: string[] = [];
  for (const name of Object.keys(assets)) {
    if (!usedAssets.has(name)) {
      // Check if base name (without extension) is used
      const baseName = name.replace(/\.[^.]+$/, '');
      if (!usedAssets.has(baseName)) {
        unused.push(name);
      }
    }
  }

  return unused;
}
