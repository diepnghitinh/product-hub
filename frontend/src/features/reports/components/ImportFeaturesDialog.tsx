import { useCallback, useMemo, useRef, useState, type DragEvent } from 'react';
import { Upload } from 'lucide-react';
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Checkbox,
  Dialog,
} from '@/components/ui';
import { cn } from '@/lib/utils';
import { t, type I18nKey } from '@/i18n';
import type { ReportDto } from '@/types/dto';
import {
  buildFeatureTemplateBlob,
  buildFeatureTemplateJson,
  parseFeaturesFile,
  type FeatureParseResult,
  type FeatureSource,
} from '../parse-features';
import { useImportFeatures } from '../api';

interface ImportFeaturesDialogProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  /** The group the imported features land in. */
  groupId: string;
  groupTitle: string;
  /** Features already in this group — matched by label so a repeat import tops
   *  the same feature up instead of creating a twin. */
  existing: ReportDto[];
}

const ACCEPT = '.xlsx,.xls,.csv,.json';

const isAccepted = (file: File) => /\.(xlsx|xls|csv|json)$/i.test(file.name);

const nameKey = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ');

/** Counts read inside sentences here, so they carry their own noun rather than
 *  leaving a hard-coded plural to say "1 features". */
const featureNoun = (n: number) => (n === 1 ? t('report.featureOne') : t('report.featureMany'));
const caseNoun = (n: number) => (n === 1 ? t('report.caseOne') : t('report.caseMany'));
const features = (n: number) => `${n} ${featureNoun(n)}`;
const cases = (n: number) => `${n} ${caseNoun(n)}`;

/** Tells the reader *why* the file split the way it did. */
const SPLIT_HINT: Record<FeatureSource, I18nKey> = {
  column: 'report.importSplitColumn',
  sheet: 'report.importSplitSheet',
  file: 'report.importSplitFile',
};

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Import a file's worth of features into one sidebar group. The file may be a
 * plain list of feature names, or those names with their test cases beside
 * them — see `parse-features.ts` for the shapes it reads.
 */
export function ImportFeaturesDialog({
  open,
  onClose,
  projectId,
  groupId,
  groupTitle,
  existing,
}: ImportFeaturesDialogProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [parsing, setParsing] = useState(false);
  const [result, setResult] = useState<FeatureParseResult | null>(null);
  const [skipped, setSkipped] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [done, setDone] = useState<{ text: string; failed: string[] } | null>(null);
  const [progress, setProgress] = useState(0);
  const importFeatures = useImportFeatures(projectId);

  const existingByName = useMemo(() => {
    const map = new Map<string, ReportDto>();
    for (const r of existing) map.set(nameKey(r.label || r.title), r);
    return map;
  }, [existing]);

  const rows = useMemo(
    () =>
      (result?.features ?? []).map((f) => ({
        ...f,
        match: existingByName.get(nameKey(f.name)),
        selected: !skipped.has(nameKey(f.name)),
      })),
    [result, existingByName, skipped],
  );
  const chosen = rows.filter((r) => r.selected);
  const chosenCases = chosen.reduce((n, r) => n + r.cases.length, 0);

  const handleFile = useCallback(async (file: File) => {
    setDone(null);
    setFileName(file.name);
    setSkipped(new Set());
    if (!isAccepted(file)) {
      setError(t('report.importUnsupported'));
      setResult(null);
      return;
    }
    setParsing(true);
    setError(null);
    setResult(null);
    try {
      const parsed = await parseFeaturesFile(file);
      if (parsed.features.length === 0) setError(t('report.importFeaturesEmpty'));
      else setResult(parsed);
    } catch {
      setError(t('report.importUnsupported'));
    } finally {
      setParsing(false);
    }
  }, []);

  function onDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  }

  function toggle(name: string) {
    setSkipped((prev) => {
      const next = new Set(prev);
      const key = nameKey(name);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  function doImport() {
    if (chosen.length === 0) return;
    setProgress(0);
    importFeatures.mutate(
      {
        groupId,
        features: chosen.map((r) => ({
          name: r.name,
          reportId: r.match?.id,
          cases: r.cases,
        })),
        onProgress: setProgress,
      },
      {
        onSuccess: (res) => {
          const parts = [
            t('report.importFeaturesCreated').replace('{features}', features(res.created)),
          ];
          if (res.toppedUp > 0)
            parts.push(t('report.importFeaturesToppedUp').replace('{n}', String(res.toppedUp)));
          if (res.cases > 0)
            parts.push(t('report.importFeaturesCases').replace('{cases}', cases(res.cases)));
          setDone({
            text: parts.join(' · '),
            failed: res.failed.map((f) => `${f.name}: ${f.message}`),
          });
        },
        onError: (e) => setError((e as Error).message),
      },
    );
  }

  function close() {
    setFileName('');
    setParsing(false);
    setResult(null);
    setSkipped(new Set());
    setError(null);
    setDragOver(false);
    setDone(null);
    setProgress(0);
    if (fileRef.current) fileRef.current.value = '';
    onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title={t('report.importFeatures')}
      className="max-w-xl"
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            {done ? t('common.done') : t('common.cancel')}
          </Button>
          {!done && (
            <Button
              onClick={doImport}
              disabled={chosen.length === 0 || parsing}
              loading={importFeatures.isPending}
            >
              {importFeatures.isPending
                ? `${t('report.import')} ${progress}/${chosen.length}`
                : chosen.length > 0
                  ? `${t('report.import')} ${features(chosen.length)}`
                  : t('report.import')}
            </Button>
          )}
        </>
      }
    >
      <p className="mb-4 text-sm text-muted-foreground">
        {t('report.importFeaturesHint')}{' '}
        <span className="font-medium text-foreground">{groupTitle}</span>.
      </p>

      {done ? (
        <>
          <Alert variant="success">
            <AlertDescription>{done.text}</AlertDescription>
          </Alert>
          {done.failed.length > 0 && (
            <Alert variant="destructive" className="mt-3">
              <AlertDescription>
                <p className="font-medium">{t('report.importFeaturesFailed')}</p>
                <ul className="mt-1 list-disc pl-4">
                  {done.failed.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}
        </>
      ) : (
        <>
          {/* Drag-and-drop / click dropzone */}
          <label
            className={cn(
              'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-input bg-muted/30 px-6 py-8 text-center transition-colors hover:border-primary/50 hover:bg-accent',
              dragOver && 'border-primary bg-primary/5',
              error && 'border-destructive/60',
            )}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
          >
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPT}
              className="sr-only"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
            <Upload className="size-6 text-muted-foreground" aria-hidden />
            <div className="text-sm">
              <span className="font-medium text-foreground">{t('report.dropFile')}</span>{' '}
              {t('report.orBrowse')}
            </div>
            <div className="text-xs text-muted-foreground">{t('report.importFormats')}</div>
            {fileName && (
              <div
                className="mt-1 max-w-full truncate rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground"
                title={fileName}
              >
                {parsing ? t('report.parsing') : fileName}
              </div>
            )}
          </label>

          {/* Template downloads */}
          <div className="mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
            <span>{t('report.importTemplatesLabel')}</span>
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0 text-xs"
              onClick={async () =>
                downloadBlob(await buildFeatureTemplateBlob(), 'features-template.xlsx')
              }
            >
              {t('report.excelTemplate')}
            </Button>
            <span aria-hidden>·</span>
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0 text-xs"
              onClick={() => downloadBlob(buildFeatureTemplateJson(), 'features-template.json')}
            >
              {t('report.jsonTemplate')}
            </Button>
          </div>

          {error && (
            <Alert variant="destructive" className="mt-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Parsed preview — every feature the file asks for, opt-out by row. */}
          {result && rows.length > 0 && (
            <div className="mt-4">
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <p className="text-sm">
                  <span className="font-semibold text-foreground">{rows.length}</span>{' '}
                  <span className="text-muted-foreground">
                    {featureNoun(rows.length)} {t('report.importReady')}
                    {result.skipped > 0 && ` · ${result.skipped} ${t('report.importSkipped')}`}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">{t(SPLIT_HINT[result.source])}</p>
              </div>

              <ul className="max-h-64 divide-y overflow-y-auto rounded-md border">
                {rows.map((row) => (
                  <li key={nameKey(row.name)}>
                    <label className="flex cursor-pointer items-center gap-3 px-3 py-2 transition-colors hover:bg-accent/50">
                      <Checkbox
                        checked={row.selected}
                        onCheckedChange={() => toggle(row.name)}
                        aria-label={row.name}
                      />
                      <span
                        className={cn(
                          'min-w-0 flex-1 truncate text-sm',
                          !row.selected && 'text-muted-foreground line-through',
                        )}
                        title={row.name}
                      >
                        {row.name}
                      </span>
                      {row.match && (
                        <Badge variant="muted" className="shrink-0">
                          {t('report.importExisting')}
                        </Badge>
                      )}
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {cases(row.cases.length)}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>

              {chosen.length > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {t('report.importFeaturesSummary')
                    .replace('{features}', features(chosen.length))
                    .replace('{cases}', cases(chosenCases))}
                </p>
              )}
            </div>
          )}
        </>
      )}
    </Dialog>
  );
}
