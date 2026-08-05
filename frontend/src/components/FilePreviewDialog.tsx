import { useCallback, useEffect, useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { ChevronLeft, ChevronRight, Download, FileQuestion, X } from 'lucide-react';
import { Button, Spinner } from '@/components/ui';
import { cn } from '@/lib/utils';
import { t } from '@/i18n';
import { formatFileSize } from '@/lib/format';
import { downloadFile, previewKindOf, type PreviewKind } from '@/lib/filePreview';
import { readWorkbook, type SheetRows } from '@/lib/sheets';
import { fetchUploadBytes } from '@/features/uploads/api';
import type { AttachedFile } from '@/types/dto';

/** How much of a sheet is drawn. Past this it stops being a preview and starts
 *  being a slow page — the footer says so rather than truncating silently. */
const MAX_SHEET_ROWS = 400;
const MAX_SHEET_COLS = 40;

interface FilePreviewDialogProps {
  /** The whole list, so the viewer can page through it with ← / →. */
  files: AttachedFile[];
  /** Index of the file being shown. */
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}

/**
 * The in-app file viewer: open an attachment and read it without downloading it
 * or leaving the workspace.
 *
 * Everything is rendered **client-side, from the workspace's own bytes** — no
 * third-party embed, so a spec or a revenue forecast is never handed to another
 * service to be rendered. Spreadsheets go through SheetJS (already in the app for
 * test-case import), `.docx` through docx-preview, PDFs and images through the
 * browser itself. Formats with no honest in-browser renderer (`.doc`, `.ppt`,
 * `.pptx`) say so and offer the download instead of faking it.
 *
 * The bytes come from `/uploads/content` rather than the storage URL — see
 * {@link fetchUploadBytes}. Both loaders are dynamic `import()`s so neither
 * parser is in the bundle until someone actually opens a file of that kind.
 */
export function FilePreviewDialog({
  files,
  index,
  onIndexChange,
  onClose,
}: FilePreviewDialogProps) {
  const file = files[index];
  const many = files.length > 1;

  const go = useCallback(
    (delta: number) => onIndexChange((index + delta + files.length) % files.length),
    [index, files.length, onIndexChange],
  );

  // ← / → page through the list (Esc is Radix's job).
  useEffect(() => {
    if (!many) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        go(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        go(1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [many, go]);

  if (!file) return null;

  return (
    <DialogPrimitive.Root
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-0 z-50 m-auto flex h-[calc(100dvh-2rem)] w-[calc(100%-1.5rem)] max-w-5xl flex-col overflow-hidden rounded-lg border bg-background shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 sm:w-[calc(100%-4rem)]"
        >
          {/* Header — name + size on the left, paging and actions on the right. */}
          <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2.5 sm:px-4">
            <div className="min-w-0 flex-1">
              <DialogPrimitive.Title className="truncate text-sm font-semibold leading-tight">
                {file.name}
              </DialogPrimitive.Title>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {[
                  formatFileSize(file.size),
                  many &&
                    t('uploads.previewOf')
                      .replace('{i}', String(index + 1))
                      .replace('{n}', String(files.length)),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>

            {many && (
              <div className="flex shrink-0 items-center">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 text-muted-foreground"
                  aria-label={t('uploads.previewPrev')}
                  onClick={() => go(-1)}
                >
                  <ChevronLeft />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 text-muted-foreground"
                  aria-label={t('uploads.previewNext')}
                  onClick={() => go(1)}
                >
                  <ChevronRight />
                </Button>
              </div>
            )}

            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 text-muted-foreground"
              aria-label={t('uploads.download')}
              title={t('uploads.download')}
              onClick={() => downloadFile(file)}
            >
              <Download />
            </Button>
            <DialogPrimitive.Close asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 text-muted-foreground"
                aria-label={t('common.close')}
              >
                <X />
              </Button>
            </DialogPrimitive.Close>
          </div>

          {/* Body. Keyed by URL so paging to the next file remounts the renderer
              rather than leaving the previous document on screen while it loads. */}
          <PreviewBody key={file.url} file={file} />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** What a loader hands back, tagged by which renderer should draw it. */
type Loaded =
  | { kind: 'blobUrl'; url: string; pdf: boolean }
  | { kind: 'sheet'; sheets: SheetRows[] }
  | { kind: 'html'; html: string }
  | { kind: 'text'; text: string };

function PreviewBody({ file }: { file: AttachedFile }) {
  const previewKind = previewKindOf(file);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState('');
  const [sheet, setSheet] = useState(0);

  useEffect(() => {
    if (previewKind === 'none') return;
    let cancelled = false;
    // Aborting tears down the sheet worker, so paging past a heavy spreadsheet
    // stops the parse instead of leaving it to finish for a file nobody's on.
    const abort = new AbortController();
    // Held outside the async body so cleanup can revoke it even if the effect is
    // torn down between creating the URL and setting state.
    let objectUrl = '';

    (async () => {
      try {
        const bytes = await fetchUploadBytes(file.url);
        if (cancelled) return;
        const next = await renderBytes(previewKind, bytes, file, abort.signal);
        if (cancelled) {
          if (next.kind === 'blobUrl') URL.revokeObjectURL(next.url);
          return;
        }
        if (next.kind === 'blobUrl') objectUrl = next.url;
        setLoaded(next);
      } catch (e) {
        if (!cancelled) setError((e as Error).message || t('uploads.previewFailed'));
      }
    })();

    return () => {
      cancelled = true;
      abort.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file.url, previewKind]);

  if (previewKind === 'none') return <NoPreview file={file} />;
  if (error) return <NoPreview file={file} message={error} />;
  if (!loaded)
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
        <Spinner className="size-5" />
        <p className="text-sm">{t('uploads.previewLoading')}</p>
      </div>
    );

  if (loaded.kind === 'blobUrl') {
    return loaded.pdf ? (
      // The browser's own PDF viewer. Same-origin (a blob: URL), so it needs no
      // bucket CORS and inherits the browser's zoom/print/search controls.
      <iframe src={loaded.url} title={file.name} className="min-h-0 flex-1 border-0 bg-muted/30" />
    ) : (
      <div className="min-h-0 flex-1 overflow-auto bg-muted/30 p-4">
        <img src={loaded.url} alt={file.name} className="mx-auto max-w-full rounded-md shadow-sm" />
      </div>
    );
  }

  if (loaded.kind === 'sheet')
    return <SheetView loaded={loaded} sheet={sheet} onSheet={setSheet} />;

  if (loaded.kind === 'html') {
    return (
      <div className="min-h-0 flex-1 overflow-auto bg-muted/30 p-3 sm:p-6">
        {/* docx-preview writes its own scoped styles alongside the markup; the
            wrapper only supplies the page-on-a-desk framing around them. */}
        <div
          className="mx-auto w-fit min-w-0 max-w-full overflow-x-auto rounded-md bg-background p-1 shadow-sm [&_.docx-wrapper]:!bg-transparent [&_.docx-wrapper]:!p-0 [&_.docx]:!mb-0 [&_.docx]:!shadow-none"
          dangerouslySetInnerHTML={{ __html: loaded.html }}
        />
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto bg-muted/30 p-3 sm:p-6">
      <pre className="mx-auto max-w-3xl whitespace-pre-wrap break-words rounded-md bg-background p-4 font-mono text-xs leading-relaxed shadow-sm">
        {loaded.text}
      </pre>
    </div>
  );
}

/** Turn raw bytes into something a renderer above can draw. */
async function renderBytes(
  kind: Exclude<PreviewKind, 'none'>,
  bytes: ArrayBuffer,
  file: AttachedFile,
  signal: AbortSignal,
): Promise<Loaded> {
  if (kind === 'pdf' || kind === 'image') {
    const blob = new Blob([bytes], { type: file.contentType || 'application/octet-stream' });
    return { kind: 'blobUrl', url: URL.createObjectURL(blob), pdf: kind === 'pdf' };
  }

  if (kind === 'text') return { kind: 'text', text: new TextDecoder().decode(bytes) };

  if (kind === 'sheet') {
    // Parsed in a worker, and capped there too — only the 400×40 the grid draws
    // crosses back, not the file's full 2,600×480. `formatted` renders dates and
    // percentages the way the file writes them rather than as serial numbers.
    const sheets = await readWorkbook(
      bytes,
      { formatted: true, maxRows: MAX_SHEET_ROWS, maxCols: MAX_SHEET_COLS },
      signal,
    );
    return { kind: 'sheet', sheets };
  }

  // .docx — rendered into a detached node so the markup can be handed over as a
  // string, keeping this function pure and the render path the same for all kinds.
  const { renderAsync } = await import('docx-preview');
  const host = document.createElement('div');
  await renderAsync(new Blob([bytes]), host, undefined, {
    inWrapper: true,
    ignoreWidth: true,
    ignoreHeight: true,
    experimental: true,
  });
  return { kind: 'html', html: host.innerHTML };
}

/** A spreadsheet, drawn as a grid with the row/column addresses the file's own
 *  formulas refer to — so "check C12" is followable here. */
function SheetView({
  loaded,
  sheet,
  onSheet,
}: {
  loaded: Extract<Loaded, { kind: 'sheet' }>;
  sheet: number;
  onSheet: (i: number) => void;
}) {
  const current = loaded.sheets[sheet] ?? loaded.sheets[0];
  const cols = Math.max(0, ...(current?.rows.map((r) => r.length) ?? [0]));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {loaded.sheets.length > 1 && (
        <div className="flex shrink-0 gap-1 overflow-x-auto border-b px-2 py-1.5">
          {loaded.sheets.map((s, i) => (
            <button
              key={s.name}
              type="button"
              onClick={() => onSheet(i)}
              className={cn(
                'shrink-0 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                i === sheet
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto">
        {!current || current.rows.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            {t('uploads.previewEmptySheet')}
          </p>
        ) : (
          <table className="w-max border-separate border-spacing-0 text-xs">
            <thead>
              <tr>
                {/* The corner box above the row numbers — sticky on both axes so
                    it stays put as the grid scrolls either way. */}
                <th className="sticky left-0 top-0 z-20 border-b border-r bg-muted px-2 py-1" />
                {Array.from({ length: cols }, (_, c) => (
                  <th
                    key={c}
                    className="sticky top-0 z-10 min-w-24 border-b border-r bg-muted px-2 py-1 text-center font-medium text-muted-foreground"
                  >
                    {columnName(c)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {current.rows.map((row, r) => (
                <tr key={r}>
                  <th className="sticky left-0 z-10 border-b border-r bg-muted px-2 py-1 text-right font-medium tabular-nums text-muted-foreground">
                    {r + 1}
                  </th>
                  {Array.from({ length: cols }, (_, c) => {
                    const text = cellText(row[c]);
                    return (
                      <td
                        key={c}
                        className="max-w-64 truncate border-b border-r px-2 py-1 align-top"
                        title={text || undefined}
                      >
                        {text}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Say what was left out — a grid that just stops looks like the file ends. */}
      {current?.truncated && (
        <p className="shrink-0 border-t bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
          {t('uploads.previewTruncated')
            .replace('{rows}', String(MAX_SHEET_ROWS))
            .replace('{cols}', String(MAX_SHEET_COLS))}
        </p>
      )}
    </div>
  );
}

/** A cell as text. Reads arrive formatted (so already strings), but the grid
 *  shouldn't be the thing that breaks if a raw number or date ever gets through. */
function cellText(cell: unknown): string {
  return cell == null ? '' : String(cell);
}

/** 0 → A, 25 → Z, 26 → AA — the spreadsheet's own column addresses. */
function columnName(index: number): string {
  let name = '';
  let n = index;
  while (n >= 0) {
    name = String.fromCharCode((n % 26) + 65) + name;
    n = Math.floor(n / 26) - 1;
  }
  return name;
}

/** The honest empty state: nothing to render, so offer the download. Also the
 *  error state, where `message` explains what went wrong instead. */
function NoPreview({ file, message }: { file: AttachedFile; message?: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <FileQuestion className="size-8 text-muted-foreground/60" aria-hidden />
      <div>
        <p className="text-sm font-medium">{message ?? t('uploads.previewUnsupported')}</p>
        <p className="mt-1 text-xs text-muted-foreground">{t('uploads.previewDownloadHint')}</p>
      </div>
      <Button type="button" size="sm" variant="secondary" onClick={() => downloadFile(file)}>
        <Download className="mr-1.5 size-4" />
        {t('uploads.download')}
      </Button>
    </div>
  );
}
