// Some @editorjs/* tools ship no type declarations, or over-constrain their
// constructor so it isn't assignable to Editor.js's own `ToolConstructable`.
// Treat those as untyped tool constructors (they're passed opaquely as `class`).
declare module '@editorjs/marker';
declare module '@editorjs/table';
