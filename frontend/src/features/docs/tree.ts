import type { DocPageSummary } from '@/types/dto';

export interface DocTreeNode {
  page: DocPageSummary;
  depth: number;
  children: DocTreeNode[];
}

/** Where a dragged page lands relative to the row it was dropped on. */
export type DropPosition = 'before' | 'after' | 'inside';

/**
 * Assembles the flat page list the API returns into the rail's tree. Pages whose
 * parent is missing (deleted mid-session) are lifted to the root rather than
 * dropped — a page you can't see is a page you can't fix.
 */
export function buildDocTree(pages: DocPageSummary[]): DocTreeNode[] {
  const byId = new Map(pages.map((p) => [p.id, p]));
  const children = new Map<string, DocPageSummary[]>();
  for (const page of pages) {
    const parent = page.parentId && byId.has(page.parentId) ? page.parentId : '';
    const list = children.get(parent) ?? [];
    list.push(page);
    children.set(parent, list);
  }

  const build = (parentId: string, depth: number): DocTreeNode[] =>
    (children.get(parentId) ?? [])
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((page) => ({ page, depth, children: build(page.id, depth + 1) }));

  return build('', 0);
}

/** The rows actually painted: a collapsed node hides its whole subtree. */
export function visibleRows(nodes: DocTreeNode[], collapsed: Set<string>): DocTreeNode[] {
  const out: DocTreeNode[] = [];
  const walk = (list: DocTreeNode[]) => {
    for (const node of list) {
      out.push(node);
      if (!collapsed.has(node.page.id)) walk(node.children);
    }
  };
  walk(nodes);
  return out;
}

/** Every page nested under `id`, at any depth (excludes `id` itself). */
export function descendantIds(pages: DocPageSummary[], id: string): string[] {
  const out: string[] = [];
  const queue = [id];
  while (queue.length) {
    const current = queue.shift() as string;
    for (const page of pages) {
      if (page.parentId === current) {
        out.push(page.id);
        queue.push(page.id);
      }
    }
  }
  return out;
}

/** Filters the tree to pages matching `query`, keeping ancestors of a hit so a
 *  nested match is still reachable. Empty query returns everything. */
export function filterPages(pages: DocPageSummary[], query: string): DocPageSummary[] {
  const q = query.trim().toLowerCase();
  if (!q) return pages;
  const byId = new Map(pages.map((p) => [p.id, p]));
  const keep = new Set<string>();
  for (const page of pages) {
    if (!page.title.toLowerCase().includes(q)) continue;
    keep.add(page.id);
    let parent = page.parentId;
    while (parent && byId.has(parent) && !keep.has(parent)) {
      keep.add(parent);
      parent = (byId.get(parent) as DocPageSummary).parentId;
    }
  }
  return pages.filter((p) => keep.has(p.id));
}

/**
 * The tree as it should look after a drop: `dragId` becomes a child of `targetId`
 * ('inside') or its sibling just before/after it. Returns the whole list with
 * every sibling group renumbered from 0, so orders stay dense.
 *
 * Dropping a page into its own subtree would detach that branch, so it's refused
 * here (the API refuses it too — this just avoids the round trip).
 */
export function movePage(
  pages: DocPageSummary[],
  dragId: string,
  targetId: string,
  position: DropPosition,
): DocPageSummary[] | null {
  if (dragId === targetId) return null;
  const dragged = pages.find((p) => p.id === dragId);
  const target = pages.find((p) => p.id === targetId);
  if (!dragged || !target) return null;
  if (descendantIds(pages, dragId).includes(targetId)) return null;

  const parentId = position === 'inside' ? target.id : target.parentId;
  // Rebuild the destination group in the order it should end up in, then
  // renumber every group so no two siblings share an `order`.
  const siblings = pages
    .filter((p) => p.parentId === parentId && p.id !== dragId)
    .sort((a, b) => a.order - b.order);

  const moved: DocPageSummary = { ...dragged, parentId };
  if (position === 'inside') {
    siblings.push(moved);
  } else {
    const at = siblings.findIndex((p) => p.id === targetId);
    siblings.splice(at < 0 ? siblings.length : at + (position === 'after' ? 1 : 0), 0, moved);
  }

  const ordered = new Map(siblings.map((p, i) => [p.id, i]));
  return pages.map((p) => {
    if (p.id === dragId) return { ...moved, order: ordered.get(dragId) ?? 0 };
    if (p.parentId === parentId && ordered.has(p.id))
      return { ...p, order: ordered.get(p.id) as number };
    return p;
  });
}

/** Only the pages whose position actually changed — one write per moved page. */
export function positionDiff(
  before: DocPageSummary[],
  after: DocPageSummary[],
): { id: string; parentId: string; order: number }[] {
  const prev = new Map(before.map((p) => [p.id, p]));
  return after
    .filter((p) => {
      const was = prev.get(p.id);
      return !was || was.parentId !== p.parentId || was.order !== p.order;
    })
    .map((p) => ({ id: p.id, parentId: p.parentId, order: p.order }));
}
