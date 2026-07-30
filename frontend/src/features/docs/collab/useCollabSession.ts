/**
 * One page's live editing session.
 *
 * Owns the WebSocket to the sync server (`collab/`), the Y.Doc the editor binds
 * to, and the awareness channel — the side channel that carries who is here,
 * where their caret is and what they have selected. Awareness never touches the
 * document, which is why a cursor moving costs nothing and is never saved.
 *
 * The hook deliberately does no editing itself. It hands back a fragment; the
 * editor binds to it. That split is what lets the presence avatars render while
 * the editor is still loading, and lets a reader watch a page without one.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { HocuspocusProvider } from '@hocuspocus/provider';
import { Awareness } from 'y-protocols/awareness';
import * as Y from 'yjs';
import { avatarColor } from '@/components/UserAvatar';
import { getToken } from '@/lib/api';
import { collabWsUrl } from '@/lib/env';
import { blocksOf, type YBlocks } from './blockDoc';
import { SELECTION_FIELD, sameSelection, type CollabSelection } from './selection';

export type CollabStatus = 'connecting' | 'connected' | 'offline' | 'denied';

/** One other person in the page, as the awareness channel describes them. */
export interface CollabPeer {
  clientId: number;
  userId: string;
  name: string;
  color: string;
  avatarUrl?: string | null;
  /**
   * Their caret and what they have selected, when they've told us — see
   * `selection.ts` for the coordinate and `CollabDocEditor` for the drawing.
   */
  selection?: CollabSelection | null;
}

export interface CollabSession {
  provider: HocuspocusProvider;
  /**
   * Held separately from the provider on purpose. `provider.awareness` is typed
   * `Awareness | null` (it is optional to Hocuspocus), but we always create one
   * and hand it in — and the editor's collaboration option wants a non-null
   * `{ awareness }`. Keeping our own reference states that guarantee once here
   * instead of casting it away at every use.
   */
  awareness: Awareness;
  /**
   * The document itself: one entry per Editor.js block, in page order. The
   * editor binds to this — see `blockDoc.ts` for what an entry holds and
   * `editorjsBinding.ts` for the binding.
   */
  blocks: YBlocks;
  /** Who else is here, self excluded, in a stable order. */
  peers: CollabPeer[];
  status: CollabStatus;
  /** True once the first sync has landed — before it, the page is still empty. */
  synced: boolean;
  me: { userId: string; name: string; color: string; avatarUrl?: string | null };
}

const HSL = /hsl\(\s*([\d.]+)[\s,]+([\d.]+)%[\s,]+([\d.]+)%/i;

/**
 * The workspace palette as a hex triplet.
 *
 * The palette is authored in `hsl(…)`, which is fine for CSS but not for a
 * colour that gets *derived* from: the presence marker fades a peer's colour to
 * a tint by appending an alpha pair (`${color}1f`), and `hsl(248 53% 58%)1f` is
 * not a colour — it silently paints nothing. Converting once here keeps the
 * palette as the single source of truth rather than duplicating nine colours by
 * hand in a second notation.
 */
function toHex(color: string): string {
  const m = HSL.exec(color);
  if (!m) return /^#[0-9a-f]{6}$/i.test(color) ? color : '#6d56d8';
  const h = Number(m[1]) / 360;
  const s = Number(m[2]) / 100;
  const l = Number(m[3]) / 100;
  const a = s * Math.min(l, 1 - l);
  const channel = (n: number): string => {
    const k = (n + h * 12) % 12;
    const v = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(v * 255)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

/**
 * A collaborator's caret colour is the colour they already have.
 *
 * `avatarColor` hashes the user id into the workspace palette and is what tints
 * their avatar disc and their doc tags, so reusing it means a caret in the margin
 * and the face in the presence row are recognisably the same person — with
 * nothing stored and no colour handed out on arrival (which would change on every
 * reconnect, and have two windows disagree about who is who).
 */
const colorForUser = (seed: string): string => toHex(avatarColor(seed));

/** Same person, in the same place — everything the UI draws from a peer. */
const samePeer = (a: CollabPeer, b: CollabPeer): boolean =>
  a.clientId === b.clientId &&
  a.userId === b.userId &&
  a.name === b.name &&
  a.color === b.color &&
  a.avatarUrl === b.avatarUrl &&
  sameSelection(a.selection, b.selection);

function peersFrom(awareness: Awareness): CollabPeer[] {
  const found: CollabPeer[] = [];
  awareness.getStates().forEach((state, clientId) => {
    if (clientId === awareness.clientID) return;
    const peer = state as
      | { user?: Partial<CollabPeer>; [SELECTION_FIELD]?: CollabSelection | null }
      | undefined;
    const user = peer?.user;
    if (!user?.userId) return;
    found.push({
      clientId,
      userId: user.userId,
      name: user.name || '—',
      color: user.color || colorForUser(user.userId),
      avatarUrl: user.avatarUrl ?? null,
      selection: peer?.[SELECTION_FIELD] ?? null,
    });
  });
  // Two tabs of the same person are one person in the avatar row — and one
  // caret in the page. The tab with a caret in the page wins, so opening a
  // second copy of a page doesn't blank out where you are in the first.
  const seen = new Set<string>();
  return found
    .sort((a, b) => Number(!!b.selection) - Number(!!a.selection))
    .filter((p) => (seen.has(p.userId) ? false : seen.add(p.userId)))
    .sort((a, b) => a.name.localeCompare(b.name));
}

interface Options {
  tenantId: string | undefined;
  pageId: string;
  user: { id: string; name: string; avatarUrl?: string | null } | null;
  /** Off for a build with no sync server, and for a page opened read-only. */
  enabled: boolean;
}

export function useCollabSession({
  tenantId,
  pageId,
  user,
  enabled,
}: Options): CollabSession | null {
  const [session, setSession] = useState<CollabSession | null>(null);
  const [peers, setPeers] = useState<CollabPeer[]>([]);
  const [status, setStatus] = useState<CollabStatus>('connecting');
  const [synced, setSynced] = useState(false);

  const me = useMemo(
    () =>
      user
        ? {
            userId: user.id,
            name: user.name,
            color: colorForUser(user.id),
            avatarUrl: user.avatarUrl ?? null,
          }
        : null,
    [user],
  );

  // Held in a ref so the identity of the person typing can be refreshed (a name
  // or avatar change) without tearing down the socket and losing the document.
  const meRef = useRef(me);
  meRef.current = me;

  const room = tenantId && pageId ? `${tenantId}:${pageId}` : '';
  const url = collabWsUrl();
  const on = enabled && !!url && !!room && !!me;

  useEffect(() => {
    if (!on) {
      setSession(null);
      return;
    }
    const token = getToken();
    if (!token) return;

    const doc = new Y.Doc();
    const awareness = new Awareness(doc);
    setStatus('connecting');
    setSynced(false);

    const provider = new HocuspocusProvider({
      url,
      name: room,
      token,
      document: doc,
      awareness,
      onStatus: ({ status: s }) => setStatus(s === 'connected' ? 'connected' : 'offline'),
      onSynced: () => setSynced(true),
      // The server refuses a room that belongs to another workspace, and refuses
      // an expired token. Neither is retryable, so say so instead of spinning.
      onAuthenticationFailed: () => setStatus('denied'),
    });

    // Publish who we are. This is the whole of "somebody can see me here": the
    // presence row reads `name`/`avatarUrl`, and the marker in the page margin
    // reads `color` plus the `block` field the editor keeps current.
    awareness.setLocalStateField('user', meRef.current);

    // Awareness fires for our own changes too — every time the caret moves to
    // another block. Handing back a new array for an unchanged list of people
    // re-renders everyone downstream, and anything that re-publishes awareness
    // from an effect would then never stop, so an unchanged list keeps its
    // identity.
    const onAwareness = () =>
      setPeers((prev) => {
        const next = peersFrom(awareness);
        return prev.length === next.length && prev.every((p, i) => samePeer(p, next[i]))
          ? prev
          : next;
      });
    awareness.on('change', onAwareness);
    onAwareness();

    setSession({
      provider,
      awareness,
      blocks: blocksOf(doc),
      peers: [],
      status: 'connecting',
      synced: false,
      me: meRef.current!,
    });

    return () => {
      awareness.off('change', onAwareness);
      // Order matters: leaving the room before the socket closes is what removes
      // this person's avatar from everyone else's window immediately, rather
      // than when the server eventually times the connection out.
      awareness.setLocalState(null);
      provider.destroy();
      doc.destroy();
      setSession(null);
      setPeers([]);
    };
  }, [on, room, url]);

  // Keep the published identity current without reconnecting.
  useEffect(() => {
    if (!session || !me) return;
    session.awareness.setLocalStateField('user', me);
  }, [session, me]);

  return useMemo(
    () => (session && me ? { ...session, peers, status, synced, me } : null),
    [session, peers, status, synced, me],
  );
}
