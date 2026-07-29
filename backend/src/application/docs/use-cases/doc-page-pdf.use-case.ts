import { Inject, Injectable, Logger } from '@nestjs/common';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { PdfService, PuppeteerPage } from '@module-shared/services/pdf.service';
import { docPagePrintHtml, pdfFilename } from '../services/doc-page-print';
import { IDocRepository } from '../repositories/doc.repository';
import { IDocPageRepository } from '../repositories/doc-page.repository';

/** A rendered page: the bytes, and what the browser should call the file. */
export interface DocPagePdf {
  buffer: Buffer;
  filename: string;
}

/**
 * `mermaid`'s browser bundle, injected into the print page from disk — no CDN,
 * so an air-gapped deployment exports the same diagrams as this laptop. Resolved
 * once and remembered; if the package isn't installed, diagrams print as their
 * source and everything else still exports.
 */
const mermaidBundlePath = (() => {
  let cached: string | null | undefined;
  return (): string | null => {
    if (cached === undefined) {
      try {
        cached = require.resolve('mermaid/dist/mermaid.min.js');
      } catch {
        cached = null;
      }
    }
    return cached;
  };
})();

/** What `mermaid.min.js` puts on `window`, narrowed to the two calls used here. */
interface MermaidGlobal {
  initialize(config: Record<string, unknown>): void;
  render(id: string, text: string): Promise<{ svg: string }>;
}

@Injectable()
export class ExportDocPagePdfUseCase
  implements
    IUsecaseExecute<
      { docId: string; pageId: string; tenantId: string; locale: string },
      Result<DocPagePdf>
    >
{
  private readonly logger = new Logger(ExportDocPagePdfUseCase.name);

  constructor(
    @Inject(IDocRepository) private readonly docs: IDocRepository,
    @Inject(IDocPageRepository) private readonly pages: IDocPageRepository,
    private readonly pdf: PdfService,
  ) {}

  async execute({
    docId,
    pageId,
    tenantId,
    locale,
  }: {
    docId: string;
    pageId: string;
    tenantId: string;
    locale: string;
  }): Promise<Result<DocPagePdf>> {
    const page = await this.pages.findById(pageId);
    if (!page || page.tenantId !== tenantId || page.docId !== docId) {
      return Result.fail('Page not found');
    }
    const doc = await this.docs.findById(docId);
    if (!doc || doc.tenantId !== tenantId) return Result.fail('Doc not found');

    const html = docPagePrintHtml({
      docTitle: doc.title,
      title: page.title,
      content: page.content,
      coverUrl: page.coverUrl,
      updatedByName: page.updatedByName,
      updatedAt: page.updatedAt,
      fontStyle: page.fontStyle,
      fontSize: page.fontSize,
      showTitle: page.showTitle,
      showCover: page.showCover,
      showUpdated: page.showUpdated,
      showLinks: page.showLinks,
      showAttachments: page.showAttachments,
      links: page.links.map((l) => ({ title: l.title })),
      attachments: page.attachments.map((a) => ({ name: a.name, size: a.size })),
      locale,
    });

    const buffer = await this.pdf.render(html, {
      headerText: doc.title,
      footerText: page.title,
      onPage: (p) => this.preparePage(p),
    });
    return Result.ok({ buffer, filename: pdfFilename(page.title, doc.title) });
  }

  /**
   * The two things the stored HTML can't do on its own: unfold every toggle
   * (paper has no disclosure control), and turn diagram source into a diagram.
   */
  private async preparePage(page: PuppeteerPage): Promise<void> {
    await page.evaluate(() => {
      document.querySelectorAll('details').forEach((d) => d.setAttribute('open', ''));
    });

    const bundle = mermaidBundlePath();
    if (!bundle) return;
    const hasDiagram = await page.evaluate(() => !!document.querySelector('figure.mermaid-block'));
    if (!hasDiagram) return;

    try {
      await page.addScriptTag({ path: bundle });
      await page.evaluate(async () => {
        const mermaid = (window as unknown as { mermaid: MermaidGlobal }).mermaid;
        mermaid.initialize({ startOnLoad: false, theme: 'default' });
        const figures = Array.from(document.querySelectorAll('figure.mermaid-block'));
        for (const [index, figure] of figures.entries()) {
          const source = figure.querySelector('.mermaid-source')?.textContent?.trim();
          if (!source) continue;
          try {
            const { svg } = await mermaid.render(`print-diagram-${index}`, source);
            // The source stays in the DOM (hidden) so a diagram that fails to
            // draw later still has something to show.
            figure.insertAdjacentHTML('beforeend', svg);
            figure.classList.add('drawn');
          } catch {
            /* An invalid diagram prints as its source — the author's own text. */
          }
        }
      });
    } catch (err) {
      // A diagram is worth a warning, never a failed export.
      this.logger.warn(`Diagram rendering skipped: ${(err as Error).message}`);
    }
  }
}
