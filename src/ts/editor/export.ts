// Export functionality for the editor

import type { Page, Asset, StoryMetadata, ValidationResult } from '../types';
import { sanitizeFilename } from '../shared/utils';
import { validateStory } from './pages';

/**
 * Export story to ZIP file
 */
export async function exportToZip(
  storyName: string,
  pages: Record<string, Page>,
  assets: Record<string, Asset>,
  metadata?: StoryMetadata,
  options?: {
    validateFirst?: boolean;
    includeMetadata?: boolean;
  }
): Promise<{ blob: Blob; warnings: ValidationResult[] }> {
  const warnings: ValidationResult[] = [];

  // Validate if requested
  if (options?.validateFirst) {
    const validationResults = validateStory(pages, assets);
    warnings.push(...validationResults);
  }

  const safeName = sanitizeFilename(storyName || 'my-story');
  const zip = new JSZip();
  const folder = zip.folder(safeName);

  if (!folder) {
    throw new Error('Failed to create ZIP folder');
  }

  const assetsFolder = folder.folder('assets');
  if (!assetsFolder) {
    throw new Error('Failed to create assets folder');
  }

  // Add metadata file if provided
  if (metadata && options?.includeMetadata !== false) {
    folder.file('story.json', JSON.stringify(metadata, null, 2));
  }

  // Generate page files
  for (const [id, page] of Object.entries(pages)) {
    const content = generatePageContent(page);
    const safeId = sanitizeFilename(id);
    folder.file(`${safeId}.txt`, content);
  }

  // Add assets
  for (const [name, asset] of Object.entries(assets)) {
    const safeName = sanitizeFilename(name);
    const base64 = asset.data.split(',')[1];

    if (base64) {
      assetsFolder.file(safeName, base64, { base64: true });
    }
  }

  const blob = await zip.generateAsync({ type: 'blob' });

  return { blob, warnings };
}

/**
 * Generate page content for export
 */
function generatePageContent(page: Page): string {
  let content = page.content || '';

  // Add choice lines if page has choices and is not an ending
  if (page.hasChoices && !page.isEnding && page.choices.length > 0) {
    const choiceLines = page.choices
      .filter(c => c.text.trim())
      .map(c => {
        if (c.goto) {
          return `${c.letter}) [${c.goto}] ${c.text}`;
        }
        return `${c.letter}) ${c.text}`;
      })
      .join('\n');

    if (choiceLines) {
      content = content.trimEnd() + '\n\n' + choiceLines;
    }
  }

  return content;
}

/**
 * Download a blob as a file
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Export story to folder (using File System Access API)
 */
export async function exportToFolder(
  storyName: string,
  _pages: Record<string, Page>,
  _assets: Record<string, Asset>,
  _metadata?: StoryMetadata
): Promise<{ success: boolean; warnings: ValidationResult[] }> {
  try {
    // Request folder access
    await window.showSaveFilePicker({
      suggestedName: storyName,
      types: [{
        description: 'Story Folder',
        accept: { 'application/octet-stream': [] }
      }]
    });

    // Actually we need showDirectoryPicker for folders
    // This is a limitation - File System Access API doesn't support creating folders directly
    // For now, use ZIP export as primary method

    throw new Error('Direct folder export not supported. Please use ZIP export.');
  } catch (error) {
    return {
      success: false,
      warnings: [{
        type: 'error',
        message: `Export failed: ${error}`
      }]
    };
  }
}

/**
 * Export only assets as ZIP
 */
export async function exportAssetsZip(
  assets: Record<string, Asset>
): Promise<Blob> {
  const zip = new JSZip();

  for (const [name, asset] of Object.entries(assets)) {
    const safeName = sanitizeFilename(name);
    const base64 = asset.data.split(',')[1];

    if (base64) {
      zip.file(safeName, base64, { base64: true });
    }
  }

  return zip.generateAsync({ type: 'blob' });
}

/**
 * Export story as plain text (for reading/printing)
 */
export function exportAsPlainText(
  pages: Record<string, Page>,
  metadata?: StoryMetadata
): string {
  const lines: string[] = [];

  // Add metadata header
  if (metadata) {
    if (metadata.title) {
      lines.push(metadata.title);
      lines.push('='.repeat(metadata.title.length));
      lines.push('');
    }
    if (metadata.author) {
      lines.push(`By ${metadata.author}`);
      lines.push('');
    }
    if (metadata.description) {
      lines.push(metadata.description);
      lines.push('');
    }
    lines.push('---');
    lines.push('');
  }

  // Sort pages
  const sortedIds = Object.keys(pages).sort((a, b) => {
    const [numA] = a.match(/^\d+/) || ['0'];
    const [numB] = b.match(/^\d+/) || ['0'];
    if (numA !== numB) return parseInt(numA) - parseInt(numB);
    return a.localeCompare(b);
  });

  // Add each page
  for (const id of sortedIds) {
    const page = pages[id];
    lines.push(`[Page ${id}]`);
    lines.push('');

    // Remove asset references for plain text
    const cleanContent = page.content.replace(/\{[^}]+\}/g, '[Image/Media]');
    lines.push(cleanContent);
    lines.push('');

    if (page.hasChoices && !page.isEnding) {
      for (const choice of page.choices) {
        if (choice.text) {
          const target = choice.goto || `next page`;
          lines.push(`  ${choice.letter}) ${choice.text} → ${target}`);
        }
      }
      lines.push('');
    } else if (page.isEnding) {
      lines.push('  [THE END]');
      lines.push('');
    }

    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Export story structure as JSON
 */
export function exportAsJSON(
  pages: Record<string, Page>,
  assets: Record<string, Asset>,
  metadata?: StoryMetadata
): string {
  return JSON.stringify({
    version: 2,
    exportedAt: new Date().toISOString(),
    metadata,
    pages,
    // Don't include full asset data in JSON export
    assetList: Object.keys(assets)
  }, null, 2);
}

/**
 * Pre-export validation check
 */
export function preExportCheck(
  pages: Record<string, Page>,
  assets: Record<string, Asset>
): ValidationResult[] {
  return validateStory(pages, assets);
}

/**
 * Show export dialog with validation warnings
 */
export interface ExportDialogResult {
  proceed: boolean;
  format: 'zip' | 'json' | 'text';
}

export function createExportDialog(
  warnings: ValidationResult[],
  onResult: (result: ExportDialogResult) => void
): HTMLElement {
  const dialog = document.createElement('div');
  dialog.className = 'modal-overlay visible';
  dialog.innerHTML = `
    <div class="modal export-modal">
      <h3>Export Story</h3>

      ${warnings.length > 0 ? `
        <div class="validation-warnings">
          <h4>Warnings (${warnings.length})</h4>
          <div class="validation-list">
            ${warnings.map(w => `
              <div class="validation-item ${w.type}">
                <span class="validation-icon">${getValidationIcon(w.type)}</span>
                <span class="validation-text">${w.message}</span>
                ${w.pageId ? `<span class="validation-page">${w.pageId}</span>` : ''}
              </div>
            `).join('')}
          </div>
        </div>
      ` : '<p>No issues found. Ready to export!</p>'}

      <div class="export-format">
        <label>Export Format:</label>
        <select id="export-format">
          <option value="zip" selected>ZIP Archive (recommended)</option>
          <option value="json">JSON (structure only)</option>
          <option value="text">Plain Text (readable)</option>
        </select>
      </div>

      <div class="modal-buttons">
        <button class="cancel-btn">Cancel</button>
        <button class="primary export-btn">Export</button>
      </div>
    </div>
  `;

  const cancelBtn = dialog.querySelector('.cancel-btn') as HTMLButtonElement;
  const exportBtn = dialog.querySelector('.export-btn') as HTMLButtonElement;
  const formatSelect = dialog.querySelector('#export-format') as HTMLSelectElement;

  cancelBtn.onclick = () => {
    dialog.remove();
    onResult({ proceed: false, format: 'zip' });
  };

  exportBtn.onclick = () => {
    dialog.remove();
    onResult({
      proceed: true,
      format: formatSelect.value as 'zip' | 'json' | 'text'
    });
  };

  return dialog;
}

function getValidationIcon(type: string): string {
  switch (type) {
    case 'error': return '❌';
    case 'warning': return '⚠️';
    case 'info': return 'ℹ️';
    default: return '•';
  }
}
