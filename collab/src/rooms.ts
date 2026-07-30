/**
 * What each open room points at, resolved once when the document loads.
 *
 * Every store and every mirror write needs the page's `docId` and tenant. Both
 * are settled at load time and can't change while the room is open, so looking
 * them up again on each debounced write would be a database round trip for an
 * answer we already have.
 */
export interface RoomInfo {
  tenantId: string;
  pageId: string;
  docId: string;
}

const rooms = new Map<string, RoomInfo>();

export function rememberRoom(documentName: string, info: RoomInfo): void {
  rooms.set(documentName, info);
}

export function getRoom(documentName: string): RoomInfo | undefined {
  return rooms.get(documentName);
}

export function forgetRoom(documentName: string): void {
  rooms.delete(documentName);
}

export function openRoomCount(): number {
  return rooms.size;
}
