/**
 * File System Access API — showOpenFilePicker is not yet in TypeScript's
 * lib.dom; only FileSystemFileHandle/FileSystemHandle are. Ambient types
 * for the pieces file-open.ts relies on, kept minimal.
 */

interface FilePickerAcceptType {
  description?: string;
  accept: Record<string, string[]>;
}

interface OpenFilePickerOptions {
  multiple?: boolean;
  types?: FilePickerAcceptType[];
  excludeAcceptAllOption?: boolean;
  startIn?: string | FileSystemHandle;
}

interface Window {
  showOpenFilePicker?(options?: OpenFilePickerOptions): Promise<FileSystemFileHandle[]>;
}
