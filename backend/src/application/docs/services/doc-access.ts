import { Inject, Injectable } from '@nestjs/common';
import { JwtPayload, Role } from '@core/interfaces';
import { DocEntity } from '../domain/entities/doc.entity';
import { DocViewer, IDocRepository } from '../repositories/doc.repository';

/**
 * "May this person open this doc?" — asked once at the top of every doc read.
 *
 * A doc has a lot of ways in: the hub list, the doc itself, one page, that page's
 * PDF, its version history, its comment threads, the linked-docs strip on an
 * issue, and the collaborative session behind the editor. Each of those used to
 * start with the same two lines (`findById`, compare tenant), and a private doc
 * is only private if *all* of them ask the extra question. So they don't ask it
 * themselves — they come through here.
 *
 * The answer to "not yours" is deliberately the same as the answer to "doesn't
 * exist": `null`, which every caller already turns into *Doc not found*. Telling
 * someone they're forbidden from `DOC-4KQ2P9X` confirms that `DOC-4KQ2P9X` is a
 * doc somebody wrote.
 */
@Injectable()
export class DocAccess {
  constructor(@Inject(IDocRepository) private readonly docs: IDocRepository) {}

  /** The viewer a request speaks for. Admins see everything — see `DocEntity.isVisibleTo`. */
  static viewer(auth: JwtPayload): DocViewer {
    return { userId: auth.userId, isAdmin: auth.role === Role.ADMIN };
  }

  /**
   * Resolve whatever the URL carried — a `DOC-6HCUHKX` ref or the uuid — and hand
   * it back only if this viewer is allowed to see it.
   */
  async read(tenantId: string, idOrRef: string, viewer: DocViewer): Promise<DocEntity | null> {
    return this.gate(await this.docs.findByIdOrRef(tenantId, idOrRef), tenantId, viewer);
  }

  /**
   * The same gate, keyed by the uuid. Page, version and comment routes nest under
   * a doc id that has already been resolved once, so they never carry a ref.
   */
  async readById(tenantId: string, docId: string, viewer: DocViewer): Promise<DocEntity | null> {
    return this.gate(await this.docs.findById(docId), tenantId, viewer);
  }

  private gate(doc: DocEntity | null, tenantId: string, viewer: DocViewer): DocEntity | null {
    if (!doc || doc.tenantId !== tenantId) return null;
    return doc.isVisibleTo(viewer.userId, viewer.isAdmin) ? doc : null;
  }
}
