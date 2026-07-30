/**
 * What `/` offers in a collaborative doc.
 *
 * Two lists, one menu. BlockNote keys its suggestion menus by trigger character,
 * so there can only ever be one `/` menu — which is why this is a single
 * `getItems` that looks at where the caret is rather than two controllers
 * fighting over the same key.
 *
 *  · in a block — BlockNote's own items, plus **Diagram**, which the stock list
 *    has no idea about (mermaid is a *language* of the code block here, not a
 *    block type: see `LANGUAGES` in CollabDocEditor).
 *  · in a table cell — BlockNote suppresses the menu entirely there, because a
 *    cell holds inline content and there is no block to insert. The old editor's
 *    cell menu is what people are used to, so the menu opens anyway and offers
 *    the things a cell *can* hold: the marks. (Lists in a cell, which the old
 *    editor faked with raw `<ul>` inside the cell, are genuinely gone — a
 *    BlockNote cell cannot contain a block.)
 *
 * Everything is labelled from a dictionary — BlockNote's for the stock items,
 * ours for the ones we add — so both lists are already EN and KO.
 */
import { Bold, Code, Italic, Strikethrough, Workflow } from 'lucide-react';
import type { BlockNoteEditor } from '@blocknote/core';
import { filterSuggestionItems, insertOrUpdateBlockForSlashMenu } from '@blocknote/core/extensions';
import { getDefaultReactSlashMenuItems, type DefaultReactSuggestionItem } from '@blocknote/react';
import { t } from '@/i18n';

/**
 * The editor, schema-erased.
 *
 * The doc schema is built in `CollabDocEditor` and importing it back here would
 * be circular. BlockNote's own extension surface is typed the same way
 * (`ExtensionFactoryInstance` takes a `BlockNoteEditor<any, any, any>`), and
 * every call below goes through an API that validates against the live schema.
 */
type Editor = BlockNoteEditor<any, any, any>;

/** Matches BlockNote's stock items, which render lucide icons at 18. */
const ICON_SIZE = 18;

/** What a new diagram starts with — the same source the old editor seeded. */
const DIAGRAM_PLACEHOLDER = `flowchart TD
  A[Idea] --> B{Worth building?}
  B -- yes --> C[Discovery]
  B -- no --> D[Park it]`;

/**
 * Diagram.
 *
 * Grouped with the code block, because that is what it is: `codeBlock` with
 * `language: "mermaid"`. Reusing the code block's group keeps the menu honest —
 * pick this and you land in a code block, with the picture drawn underneath by
 * `mermaidPreview.ts`.
 */
function diagramItem(editor: Editor): DefaultReactSuggestionItem {
  return {
    title: t('editor.blockDiagram'),
    subtext: t('editor.diagramHint'),
    // Typed in either language, plus the words people actually reach for.
    aliases: ['mermaid', 'diagram', 'flowchart', 'chart', 'graph', '다이어그램', '머메이드'],
    group: editor.dictionary.slash_menu.code_block.group,
    icon: <Workflow size={ICON_SIZE} />,
    onItemClick: () => {
      insertOrUpdateBlockForSlashMenu(editor, {
        type: 'codeBlock',
        props: { language: 'mermaid' },
        content: DIAGRAM_PLACEHOLDER,
      });
    },
  };
}

/**
 * The block list: BlockNote's, with Diagram slipped in behind the code block so
 * the two sit together. Spread rather than re-listed — a BlockNote release that
 * adds an item gives us that item, and the HTML mirror in `collab/src/docHtml.ts`
 * renders every block type in the default schema, children included.
 */
function blockItems(editor: Editor): DefaultReactSuggestionItem[] {
  const items = getDefaultReactSlashMenuItems(editor);
  const diagram = diagramItem(editor);
  const afterCode = items.findIndex((i) => i.title === editor.dictionary.slash_menu.code_block.title);
  return afterCode < 0
    ? [...items, diagram]
    : [...items.slice(0, afterCode + 1), diagram, ...items.slice(afterCode + 1)];
}

/**
 * The cell list: the marks, applied to whatever is typed next.
 *
 * `toggleStyles` with nothing selected sets ProseMirror's stored marks, so this
 * behaves the way the old cell menu's `<code>` item did — pick it, keep typing,
 * the text comes out styled.
 */
function cellItems(editor: Editor): DefaultReactSuggestionItem[] {
  const marks = editor.dictionary.formatting_toolbar;
  const mark = (
    style: 'bold' | 'italic' | 'strike' | 'code',
    label: string,
    Icon: typeof Bold,
  ): DefaultReactSuggestionItem => ({
    title: label,
    aliases: [style],
    icon: <Icon size={ICON_SIZE} />,
    onItemClick: () => {
      // Focus first: the menu took it on click, and a toggle with the caret
      // outside the editor has nothing to apply itself to.
      editor.focus();
      editor.toggleStyles({ [style]: true });
    },
  });

  return [
    mark('bold', marks.bold.tooltip, Bold),
    mark('italic', marks.italic.tooltip, Italic),
    mark('strike', marks.strike.tooltip, Strikethrough),
    mark('code', marks.code.tooltip, Code),
  ];
}

/** True when the caret is inside a table cell — BlockNote's own test for it. */
function inTableCell(editor: Editor): boolean {
  return editor.prosemirrorState.selection.$from.parent.type.isInGroup('tableContent');
}

/** `getItems` for the one `/` menu. */
export function docSlashItems(editor: Editor, query: string): DefaultReactSuggestionItem[] {
  return filterSuggestionItems(inTableCell(editor) ? cellItems(editor) : blockItems(editor), query);
}
