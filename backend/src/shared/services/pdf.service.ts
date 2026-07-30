import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import puppeteer, { Browser } from 'puppeteer';

/** What a caller can say about the paper. Everything else is this service's call. */
export interface PdfOptions {
  /** Printed above every page, centred, small and grey. Usually the doc's name. */
  headerText?: string;
  /** Printed bottom-left, opposite the page numbers. */
  footerText?: string;
  /** Extra script to run in the page before printing (diagram rendering, etc). */
  onPage?: (page: PuppeteerPage) => Promise<void>;
}

/** The bits of a puppeteer Page a caller is allowed to touch. */
export type PuppeteerPage = Awaited<ReturnType<Browser['newPage']>>;

/** Header/footer live in their own tiny document with no access to page CSS —
 *  everything they need has to be inline, and `font-size` defaults to microscopic.
 *
 *  Single quotes around `Segoe UI` are not a style choice: this string is dropped
 *  into a `style="…"` attribute, so a double quote here closes the attribute and
 *  throws away every declaration after it — which prints the label at a few
 *  pixels tall, hard against the left edge, with no sign that anything is wrong. */
const CHROME_LABEL_CSS =
  "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;" +
  'font-size:8px;color:#8a8a8a;width:100%;padding:0 16mm;box-sizing:border-box;';

/**
 * HTML → PDF, with a real browser.
 *
 * One headless Chrome is launched on first use and kept — a launch costs the
 * better part of a second, and an export that takes a second to start feels
 * broken. Pages are opened and closed per render, which is where the memory
 * goes, so a long-lived browser stays cheap. If it dies (crash, OOM, a killed
 * container) the next render notices and launches a fresh one.
 *
 * Chromium ships with the `puppeteer` package, which is what a laptop uses. A
 * container can't: that download is a glibc build (our image is Alpine) and it
 * lands in the installing user's ~/.cache, not the one the server runs as. So
 * the image installs the distro's own Chromium and points
 * `PUPPETEER_EXECUTABLE_PATH` at it — see backend/Dockerfile.
 */
@Injectable()
export class PdfService implements OnModuleDestroy {
  private readonly logger = new Logger(PdfService.name);
  private browser?: Browser;
  /** Held while a launch is in flight so ten simultaneous exports launch one browser. */
  private launching?: Promise<Browser>;

  private async getBrowser(): Promise<Browser> {
    if (this.browser?.connected) return this.browser;
    if (this.launching) return this.launching;
    this.launching = puppeteer
      .launch({
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        // `--no-sandbox` is what makes this work in a container running as root;
        // the only thing rendered is HTML this server just built.
        args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
      })
      .then((browser) => {
        this.browser = browser;
        this.launching = undefined;
        browser.on('disconnected', () => {
          if (this.browser === browser) this.browser = undefined;
        });
        return browser;
      })
      .catch((err: Error) => {
        this.launching = undefined;
        // Puppeteer's own message for a missing browser reads as a build
        // problem ("did you run browsers install?") and gets shown to whoever
        // clicked Export. Say where we looked instead — that's the one fact
        // that tells you whether the image or the env var is wrong.
        this.logger.error(
          `Could not start the print browser (executablePath=${
            process.env.PUPPETEER_EXECUTABLE_PATH || 'puppeteer default'
          }): ${err.message}`,
        );
        throw new Error(
          'PDF export could not start a browser on the server. ' +
            'Install Chromium in the API image and point PUPPETEER_EXECUTABLE_PATH at it.',
        );
      });
    return this.launching;
  }

  /**
   * Render a standalone HTML document to A4.
   *
   * `load` waits for the images to arrive. The timeout is a ceiling rather than
   * a target, and missing it is not fatal: a page whose images have gone (a
   * deleted upload, a bucket that's briefly unreachable) still exports, with a
   * gap where the picture was, instead of failing in front of the reader.
   */
  async render(html: string, options: PdfOptions = {}): Promise<Buffer> {
    const browser = await this.getBrowser();
    const page = await browser.newPage();
    try {
      await page
        .setContent(html, { waitUntil: 'load', timeout: 20_000 })
        .catch((err) => this.logger.warn(`Print page did not settle: ${(err as Error).message}`));
      await options.onPage?.(page);
      const header = options.headerText ?? '';
      const footer = options.footerText ?? '';
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: `<div style="${CHROME_LABEL_CSS}text-align:center;">${escapeHtml(header)}</div>`,
        footerTemplate:
          `<div style="${CHROME_LABEL_CSS}display:flex;justify-content:space-between;">` +
          `<span>${escapeHtml(footer)}</span>` +
          '<span><span class="pageNumber"></span> / <span class="totalPages"></span></span>' +
          '</div>',
        // Room for the header and footer above; the sides match the app's measure.
        margin: { top: '18mm', bottom: '18mm', left: '16mm', right: '16mm' },
      });
      return Buffer.from(pdf);
    } finally {
      await page.close().catch(() => undefined);
    }
  }

  async onModuleDestroy(): Promise<void> {
    const browser = this.browser;
    this.browser = undefined;
    if (browser) {
      await browser.close().catch((err) => this.logger.warn(`Browser close failed: ${err}`));
    }
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
