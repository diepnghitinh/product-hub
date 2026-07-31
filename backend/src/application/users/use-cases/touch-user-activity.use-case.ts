import { Inject, Injectable } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { IUserRepository } from '../repositories/user.repository';

export interface TouchUserActivityRequest {
  userId: string;
}

/** How stale a stamp has to be before we write again. */
const WRITE_EVERY_MS = 60_000;

/** Cap on the throttle map so a long-lived process can't grow it without limit. */
const MAX_TRACKED_USERS = 10_000;

/**
 * Records that a user is online. Called from every authenticated request, so the
 * point of this use-case is the *throttle*: a single page load fires a dozen
 * requests, and stamping a timestamp on each one would turn a read-heavy app into
 * a write-heavy one for a number nobody reads to the minute. One write a minute
 * per user is precise enough for "last online" and costs nothing.
 *
 * The window lives in memory, so each API instance throttles independently — with
 * several instances the worst case is one write per minute *per instance*, which
 * is still bounded. Restarting just means one extra write.
 */
@Injectable()
export class TouchUserActivityUseCase implements IUsecaseExecute<
  TouchUserActivityRequest,
  Result<void>
> {
  private readonly lastWrite = new Map<string, number>();

  constructor(@Inject(IUserRepository) private readonly users: IUserRepository) {}

  async execute({ userId }: TouchUserActivityRequest): Promise<Result<void>> {
    if (!userId) return Result.ok<void>(undefined);

    const now = Date.now();
    const previous = this.lastWrite.get(userId);
    if (previous !== undefined && now - previous < WRITE_EVERY_MS) {
      return Result.ok<void>(undefined);
    }

    // Claim the window *before* awaiting, so concurrent requests from the same
    // user (a page load's parallel fetches) collapse into one write, not a burst.
    this.lastWrite.set(userId, now);
    this.evictStaleEntries(now);

    await this.users.touchLastActive(userId, new Date(now));
    return Result.ok<void>(undefined);
  }

  /** Drop entries whose window has long since expired — they'd write on their
   *  next request anyway, so forgetting them changes nothing but the memory. */
  private evictStaleEntries(now: number): void {
    if (this.lastWrite.size <= MAX_TRACKED_USERS) return;
    for (const [id, at] of this.lastWrite) {
      if (now - at >= WRITE_EVERY_MS) this.lastWrite.delete(id);
    }
  }
}
