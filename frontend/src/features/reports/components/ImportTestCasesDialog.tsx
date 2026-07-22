import { useCallback, useMemo, useRef, useState, type DragEvent } from 'react';
import { Upload } from 'lucide-react';
import {
  Alert,
  AlertDescription,
  Button,
  Dialog,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';
import { cn } from '@/lib/utils';
import { t } from '@/i18n';
import {
  buildTemplateBlob,
  buildTemplateJson,
  parseTestCasesFile,
  type ParseResult,
} from '../parse-test-cases';
import { useImportTestCases } from '../api';

interface ImportTestCasesDialogProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  reportId: string;
}

const ACCEPT = '.xlsx,.xls,.csv,.json';

const isAccepted = (file: File) => /\.(xlsx|xls|csv|json)$/i.test(file.name);

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

/** The dash placeholder for an empty preview cell. */
const Empty = () => <span className="text-muted-foreground">—</span>;

export function ImportTestCasesDialog({
  open,
  onClose,
  projectId,
  reportId,
}: ImportTestCasesDialogProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [parsing, setParsing] = useState(false);
  const [result, setResult] = useState<ParseResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [doneMsg, setDoneMsg] = useState<string | null>(null);
  const importCases = useImportTestCases(projectId);

  const handleFile = useCallback(async (file: File) => {
    setDoneMsg(null);
    setFileName(file.name);
    if (!isAccepted(file)) {
      setError(t('report.importUnsupported'));
      setResult(null);
      return;
    }
    setParsing(true);
    setError(null);
    setResult(null);
    try {
      const parsed = await parseTestCasesFile(file);
      if (parsed.cases.length === 0) setError(t('report.importEmpty'));
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

  function doImport() {
    if (!result || result.cases.length === 0) return;
    importCases.mutate(
      { id: reportId, cases: result.cases },
      {
        onSuccess: (res) =>
          setDoneMsg(
            `Imported ${res.imported} ${res.imported === 1 ? 'case' : 'cases'}` +
              (res.skipped ? ` (${res.skipped} skipped)` : '') +
              '.',
          ),
        onError: (e) => setError((e as Error).message),
      },
    );
  }

  function close() {
    setFileName('');
    setParsing(false);
    setResult(null);
    setError(null);
    setDragOver(false);
    setDoneMsg(null);
    if (fileRef.current) fileRef.current.value = '';
    onClose();
  }

  const preview = useMemo(() => result?.cases.slice(0, 5) ?? [], [result]);
  const noun = (n: number) => (n === 1 ? t('report.caseOne') : t('report.caseMany'));

  return (
    <Dialog
      open={open}
      onClose={close}
      title={t('report.importCases')}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            {doneMsg ? t('common.done') : t('common.cancel')}
          </Button>
          {!doneMsg && (
            <Button
              onClick={doImport}
              disabled={!result || result.cases.length === 0 || parsing}
              loading={importCases.isPending}
            >
              {result?.cases.length
                ? `${t('report.import')} ${result.cases.length} ${noun(result.cases.length)}`
                : t('report.import')}
            </Button>
          )}
        </>
      }
    >
      <p className="mb-4 text-sm text-muted-foreground">{t('report.importHint')}</p>

      {doneMsg ? (
        <Alert variant="success">
          <AlertDescription>{doneMsg}</AlertDescription>
        </Alert>
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
                downloadBlob(await buildTemplateBlob(), 'test-cases-template.xlsx')
              }
            >
              {t('report.excelTemplate')}
            </Button>
            <span aria-hidden>·</span>
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0 text-xs"
              onClick={() => downloadBlob(buildTemplateJson(), 'test-cases-template.json')}
            >
              {t('report.jsonTemplate')}
            </Button>
          </div>

          {error && (
            <Alert variant="destructive" className="mt-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Parsed preview */}
          {result && result.cases.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-sm">
                <span className="font-semibold text-foreground">{result.cases.length}</span>{' '}
                <span className="text-muted-foreground">
                  {noun(result.cases.length)} {t('report.importReady')}
                  {result.skipped > 0 &&
                    ` · ${result.skipped} ${t('report.importSkipped')}`}
                </span>
              </p>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow className="[&>th]:h-8 [&>th]:text-xs [&>th]:uppercase [&>th]:tracking-wide">
                      <TableHead>{t('report.colArea')}</TableHead>
                      <TableHead>{t('report.colType')}</TableHead>
                      <TableHead>{t('report.colResult')}</TableHead>
                      <TableHead>{t('report.colOwner')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.map((c, i) => (
                      <TableRow key={i} className="[&>td]:py-1.5 [&>td]:text-xs">
                        <TableCell>{c.area || <Empty />}</TableCell>
                        <TableCell>{c.type || <Empty />}</TableCell>
                        <TableCell>{c.result || <Empty />}</TableCell>
                        <TableCell>{c.owner || <Empty />}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {result.cases.length > preview.length && (
                <p className="mt-2 text-xs text-muted-foreground">
                  +{result.cases.length - preview.length} {t('report.importMoreRows')}
                </p>
              )}
            </div>
          )}
        </>
      )}
    </Dialog>
  );
}
