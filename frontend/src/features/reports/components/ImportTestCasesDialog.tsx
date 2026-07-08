import { useRef, useState } from 'react';
import { Alert, AlertDescription, Button, Dialog } from '@/components/ui';
import { t } from '@/i18n';
import { parseTestCasesFile, type RawCase } from '../parse-test-cases';
import { useImportTestCases } from '../api';

interface ImportTestCasesDialogProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  reportId: string;
}

export function ImportTestCasesDialog({
  open,
  onClose,
  projectId,
  reportId,
}: ImportTestCasesDialogProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<RawCase[] | null>(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [doneMsg, setDoneMsg] = useState<string | null>(null);
  const importCases = useImportTestCases(projectId);

  async function onFile(file: File) {
    setError(null);
    setDoneMsg(null);
    setFileName(file.name);
    try {
      const cases = await parseTestCasesFile(file);
      setParsed(cases);
    } catch {
      setError('Could not read that file. Use .xlsx or .json.');
      setParsed(null);
    }
  }

  function doImport() {
    if (!parsed) return;
    importCases.mutate(
      { id: reportId, cases: parsed },
      {
        onSuccess: (res) =>
          setDoneMsg(`Imported ${res.imported} cases (${res.skipped} skipped).`),
        onError: (e) => setError((e as Error).message),
      },
    );
  }

  function close() {
    setParsed(null);
    setFileName('');
    setError(null);
    setDoneMsg(null);
    onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title={t('report.importCases')}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            {doneMsg ? 'Done' : t('common.cancel')}
          </Button>
          {!doneMsg && (
            <Button onClick={doImport} disabled={!parsed} loading={importCases.isPending}>
              {t('report.import')}
            </Button>
          )}
        </>
      }
    >
      <p className="mb-4 text-sm text-muted-foreground">{t('report.importHint')}</p>
      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {doneMsg ? (
        <Alert variant="success">
          <AlertDescription>{doneMsg}</AlertDescription>
        </Alert>
      ) : (
        <>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.json"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
          />
          <Button variant="secondary" onClick={() => fileRef.current?.click()}>
            {t('report.chooseFile')}
          </Button>
          {fileName && (
            <p className="mt-3 text-sm text-muted-foreground">
              {fileName}
              {parsed && ` · ${parsed.length} ${t('report.importParsed')}`}
            </p>
          )}
        </>
      )}
    </Dialog>
  );
}
