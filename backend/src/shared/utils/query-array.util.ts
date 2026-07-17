import { Transform } from 'class-transformer';

/**
 * Sentinel for "no assignee" in a multi-value assignee filter.
 *
 * Unassigned is stored as `''`, but a bare `?assigneeId=` is indistinguishable
 * from "filter not set" (and `TransformQueryArray` drops blanks), so clients
 * pass this instead and the repository maps it back to `''`.
 */
export const UNASSIGNED_QUERY = '__unassigned__';

/** Maps the unassigned sentinel back to the stored empty string. */
export const resolveAssignees = (ids: string[]): string[] =>
  ids.map((id) => (id === UNASSIGNED_QUERY ? '' : id));

/**
 * Normalizes a multi-value query param to `string[]`.
 *
 * Accepts every shape a client might send and stays backwards compatible with
 * the single-value callers that predate multi-select filters:
 *   ?status=open              -> ['open']
 *   ?status=open,in-progress  -> ['open', 'in-progress']
 *   ?status=open&status=done  -> ['open', 'done']   (qs array)
 * Empty/blank collapses to `undefined` so the repository skips the filter.
 */
export const TransformQueryArray = () =>
  Transform(({ value }: { value: unknown }) => {
    if (value === undefined || value === null || value === '') return undefined;
    const parts = (Array.isArray(value) ? value : String(value).split(','))
      .map((v) => String(v).trim())
      .filter(Boolean);
    return parts.length ? parts : undefined;
  });
