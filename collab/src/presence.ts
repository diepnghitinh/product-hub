import type {
  Extension,
  StatesArray,
  afterUnloadDocumentPayload,
  onAwarenessUpdatePayload,
} from '@hocuspocus/server';
import { roomName } from './auth.js';

/**
 * Who is in a page right now.
 *
 * Editors already get this over the socket — Yjs awareness is what draws the
 * other person's caret and selection, and it never touches the document. This
 * registry exists for the readers that *aren't* in the room: the docs list and
 * the page tree want "2 people are in here" without opening a WebSocket per row.
 *
 * In memory on purpose. Presence is true for as long as a socket is open and
 * meaningless afterwards, so persisting it would only create ghosts to expire.
 */
export interface Viewer {
  userId: string;
  name: string;
  color: string;
  avatarUrl?: string;
}

/** documentName (`tenantId:pageId`) → the awareness states currently in it. */
const byRoom = new Map<string, StatesArray>();

export function presence(): Extension {
  return {
    extensionName: 'Presence',

    async onAwarenessUpdate({ documentName, states }: onAwarenessUpdatePayload) {
      // `states` is the whole current set, not a delta, so replacing wholesale
      // keeps this correct without tracking added/updated/removed ourselves.
      if (states.length) byRoom.set(documentName, states);
      else byRoom.delete(documentName);
    },

    async afterUnloadDocument({ documentName }: afterUnloadDocumentPayload) {
      byRoom.delete(documentName);
    },
  };
}

/**
 * The people in each of `pageIds`, for one workspace.
 *
 * Keyed by tenant through the room name, so a caller can only ever learn about
 * pages in their own workspace even if they pass someone else's page id.
 * Deduplicated by user: two tabs is one person, not a crowd.
 */
export function viewersFor(tenantId: string, pageIds: string[]): Record<string, Viewer[]> {
  const result: Record<string, Viewer[]> = {};

  for (const pageId of pageIds) {
    const states = byRoom.get(roomName(tenantId, pageId));
    if (!states?.length) continue;

    const seen = new Map<string, Viewer>();
    for (const state of states) {
      const user = state['user'] as Partial<Viewer> | undefined;
      if (!user) continue;
      // Fall back to the Yjs client id so a client that forgot to send a userId
      // still shows up as *someone* rather than vanishing.
      const key = user.userId ?? `client:${state.clientId}`;
      if (seen.has(key)) continue;
      seen.set(key, {
        userId: user.userId ?? '',
        name: user.name ?? '',
        color: user.color ?? '',
        ...(user.avatarUrl ? { avatarUrl: user.avatarUrl } : {}),
      });
    }

    if (seen.size) result[pageId] = [...seen.values()];
  }

  return result;
}

export function roomsWithViewers(): number {
  return byRoom.size;
}
