// CYOA Engine Type Definitions

// Page structure
export interface Page {
  content: string;
  hasChoices: boolean;
  isEnding: boolean;
  choices: Choice[];
}

export interface Choice {
  letter: string;
  text: string;
  goto?: string; // Optional page ID for non-linear jumps
}

// Legacy page format (for backwards compatibility)
export interface LegacyPage {
  content: string;
  hasChoices: boolean;
  isEnding: boolean;
  choiceA: string;
  choiceB: string;
}

// Asset structure
export interface Asset {
  data: string; // Base64 data URL
  type: string; // MIME type
}

// Draft structure
export interface Draft {
  pages: Record<string, Page | LegacyPage>;
  assets: Record<string, Asset>;
  metadata?: StoryMetadata;
  savedAt: string;
}

// Story metadata
export interface StoryMetadata {
  title: string;
  author: string;
  description: string;
}

// Save state for engine
export interface SaveState {
  page: number;
  path: string;
  variables?: Record<string, VariableValue>;
}

// Variables system
export type VariableValue = string | number | boolean;

export interface VariableState {
  [key: string]: VariableValue;
}

// Parsed page ID
export interface ParsedPageId {
  num: number;
  path: string;
}

// Undo/Redo system
export interface UndoAction {
  type: 'edit' | 'delete' | 'create' | 'rename' | 'move';
  pageId: string;
  before: Page | LegacyPage | null;
  after: Page | LegacyPage | null;
  affectedPages?: Record<string, Page | LegacyPage>;
}

// Validation result
export interface ValidationResult {
  type: 'error' | 'warning' | 'info';
  message: string;
  pageId?: string;
}

// Story graph node
export interface GraphNode {
  id: string;
  label: string;
  type: 'normal' | 'choice' | 'ending' | 'orphan';
}

// Story graph edge
export interface GraphEdge {
  source: string;
  target: string;
  label?: string;
}

// Audio configuration
export interface AudioConfig {
  type: 'music' | 'sfx' | 'ambient';
  file: string;
  loop: boolean;
  volume?: number;
}

// Export options
export interface ExportOptions {
  format: 'zip' | 'folder';
  includeMetadata: boolean;
  validateFirst: boolean;
}

// Import result
export interface ImportResult {
  success: boolean;
  pages: Record<string, Page>;
  assets: Record<string, Asset>;
  metadata?: StoryMetadata;
  errors?: string[];
}

// Search result
export interface SearchResult {
  pageId: string;
  matches: SearchMatch[];
}

export interface SearchMatch {
  line: number;
  column: number;
  text: string;
  context: string;
}

// Word count statistics
export interface WordCountStats {
  pageId?: string;
  characters: number;
  words: number;
  paragraphs: number;
  pages: number;
}

// Theme
export type Theme = 'dark' | 'light';

// Font size level
export type FontSizeLevel = 'small' | 'medium' | 'large' | 'xlarge';

// Editor state
export interface EditorState {
  currentPageId: string | null;
  pages: Record<string, Page>;
  assets: Record<string, Asset>;
  metadata: StoryMetadata;
  undoStack: UndoAction[];
  redoStack: UndoAction[];
  hasUnsavedChanges: boolean;
  searchQuery: string;
  searchResults: SearchResult[];
}

// Engine state
export interface EngineState {
  currentPage: number;
  currentPath: string;
  choiceLog: string[];
  variables: VariableState;
  storyFolder: string;
  isPlaying: boolean;
  audioPlaying: AudioConfig | null;
}

// File System Access API types (for browsers that support it)
export interface FileSystemDirectoryHandle {
  kind: 'directory';
  name: string;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle>;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FileSystemDirectoryHandle>;
  values(): AsyncIterableIterator<FileSystemHandle>;
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
  keys(): AsyncIterableIterator<string>;
}

export interface FileSystemFileHandle {
  kind: 'file';
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<FileSystemWritableFileStream>;
}

export interface FileSystemWritableFileStream extends WritableStream {
  write(data: BufferSource | Blob | string): Promise<void>;
  seek(position: number): Promise<void>;
  truncate(size: number): Promise<void>;
}

export interface FileSystemHandleBase {
  kind: 'file' | 'directory';
  name: string;
}

export type FileSystemHandle = FileSystemDirectoryHandle | FileSystemFileHandle;

// Extend Window for File System Access API
declare global {
  interface Window {
    showDirectoryPicker(): Promise<FileSystemDirectoryHandle>;
    showOpenFilePicker(options?: {
      multiple?: boolean;
      types?: Array<{
        description: string;
        accept: Record<string, string[]>;
      }>;
    }): Promise<FileSystemFileHandle[]>;
    showSaveFilePicker(options?: {
      suggestedName?: string;
      types?: Array<{
        description: string;
        accept: Record<string, string[]>;
      }>;
    }): Promise<FileSystemFileHandle>;
  }
}

// External library types
declare global {
  const DOMPurify: {
    sanitize(dirty: string, config?: {
      ALLOWED_TAGS?: string[];
      ALLOWED_ATTR?: string[];
    }): string;
  };

  const JSZip: {
    new(): JSZipInstance;
  };

  interface JSZipInstance {
    file(name: string, data: string | Blob | ArrayBuffer, options?: { base64?: boolean }): this;
    folder(name: string): JSZipInstance;
    generateAsync(options: { type: 'blob' }): Promise<Blob>;
    generateAsync(options: { type: 'arraybuffer' }): Promise<ArrayBuffer>;
    generateAsync(options: { type: 'base64' }): Promise<string>;
    loadAsync(data: Blob | ArrayBuffer | string): Promise<JSZipInstance>;
    files: Record<string, JSZipFile>;
    forEach(callback: (relativePath: string, file: JSZipFile) => void): void;
  }

  interface JSZipFile {
    name: string;
    dir: boolean;
    async(type: 'string'): Promise<string>;
    async(type: 'arraybuffer'): Promise<ArrayBuffer>;
    async(type: 'blob'): Promise<Blob>;
    async(type: 'base64'): Promise<string>;
  }

  const cytoscape: (options: CytoscapeOptions) => CytoscapeInstance;

  interface CytoscapeOptions {
    container: HTMLElement;
    elements: CytoscapeElement[];
    style: CytoscapeStylesheet[];
    layout: CytoscapeLayoutOptions;
  }

  interface CytoscapeElement {
    data: {
      id: string;
      label?: string;
      source?: string;
      target?: string;
      type?: string;
    };
    classes?: string;
  }

  interface CytoscapeStylesheet {
    selector: string;
    style: Record<string, string | number>;
  }

  interface CytoscapeLayoutOptions {
    name: string;
    rankDir?: string;
    nodeSep?: number;
    rankSep?: number;
    fit?: boolean;
    padding?: number;
  }

  interface CytoscapeInstance {
    on(event: string, handler: (event: CytoscapeEvent) => void): void;
    destroy(): void;
    fit(): void;
    zoom(level?: number): number;
    pan(position?: { x: number; y: number }): { x: number; y: number };
    center(): void;
  }

  interface CytoscapeEvent {
    target: {
      id(): string;
      data(key?: string): unknown;
    };
  }
}

export {};
