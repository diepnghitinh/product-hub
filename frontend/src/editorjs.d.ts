// Some @editorjs/* tools ship no type declarations, or over-constrain their
// constructor so it isn't assignable to Editor.js's own `ToolConstructable`.
// Treat those as untyped tool constructors (they're passed opaquely as `class`).
declare module '@editorjs/marker';
declare module '@editorjs/table';
declare module '@editorjs/image';

// Undo/redo plugin ships no types. Minimal surface we use: `new Undo({ editor })`
// then `.initialize(data)` to seed the baseline history entry.
declare module 'editorjs-undo' {
  import type EditorJS from '@editorjs/editorjs';
  export default class Undo {
    constructor(options: {
      editor: EditorJS;
      config?: { shortcuts?: { undo?: string; redo?: string }; debounceTimer?: number };
      maxLength?: number;
      onUpdate?: () => void;
    });
    initialize(data: { blocks: unknown[] } | unknown[]): void;
  }
}
