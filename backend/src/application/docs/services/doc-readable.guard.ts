import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { EntityNotFoundException } from '@core/exceptions';
import { JwtPayload } from '@core/interfaces';
import { DocAccess } from './doc-access';

/**
 * "You can't comment on a doc you can't read." Put on a whole controller that
 * lives under `docs/:docId`, so the check happens once per request instead of
 * once per handler.
 *
 * The docs controller threads a viewer through its use-cases by hand, because
 * each one needs the resolved doc anyway. The comment routes don't — they're
 * keyed by page and comment id and never touch the doc — so for them the same
 * rule is cheaper *and* safer as a guard: a route added to that controller next
 * year is covered without anyone remembering this file exists.
 *
 * Not found, never forbidden: same reasoning as `DocAccess`.
 */
@Injectable()
export class DocReadableGuard implements CanActivate {
  constructor(private readonly access: DocAccess) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<{ user?: JwtPayload; params?: Record<string, string> }>();
    const auth = request.user;
    // `:docId` is in the controller's own path, so it is always there — if it
    // ever isn't, the guard has been hung on a route it can't judge, and the
    // safe answer to "may this person read a doc I can't identify" is no.
    const docId = request.params?.docId;
    if (!auth || !docId) throw new EntityNotFoundException('Doc not found');

    const doc = await this.access.readById(auth.tenantId, docId, DocAccess.viewer(auth));
    if (!doc) throw new EntityNotFoundException('Doc not found');
    return true;
  }
}
