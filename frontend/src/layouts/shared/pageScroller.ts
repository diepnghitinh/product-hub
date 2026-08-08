/**
 * The scroll container `CenteredPageLayout` and `FullWidthPageLayout` share.
 *
 * `scrollbar-gutter: stable` reserves the scrollbar's width whether or not the
 * page overflows *right now*. Without it, a screen that swaps content in place —
 * Settings changing tabs, Planning switching Roadmaps ↔ OKRs — jumps sideways
 * the moment the incoming panel is tall enough to scroll, because the scrollbar
 * appearing narrows the column under it. Measured at 11px.
 *
 * This is not only a "show scroll bars: always" problem. The app themes
 * scrollbars with `scrollbar-width: thin` (`styles/tailwind.css`), and a themed
 * scrollbar is a *classic* one that takes layout space. Where the platform still
 * draws an overlay scrollbar the gutter is zero, so reserving it costs nothing.
 *
 * Scoped to `sm` like the scrolling it pairs with: below that the document
 * scrolls and there is no gutter to hold.
 *
 * **It only covers pages that scroll through one of those two layouts.** A
 * surface that hand-rolls its own scroll area still jumps: the board list/
 * timeline wrapper (`min-h-0 flex-1 overflow-y-auto` + `BOARD_GUTTER`) and a
 * kanban column's card list both do. Fixing those means the same 11px off every
 * board, so it's a deliberate decision rather than an oversight — take it
 * app-wide or not at all.
 */
export const PAGE_SCROLLER = 'min-w-0 flex-1 sm:overflow-y-auto sm:[scrollbar-gutter:stable]';
