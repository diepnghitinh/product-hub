import { useState, type FormEvent } from 'react';
import { Button, Dialog, Field, Input, Select, Textarea } from '@/components/ui';
import { t } from '@/i18n';
import { BUG_SEVERITIES, BUG_SEVERITY_LABEL, BugSeverity } from '@/types/enums';
import { useCreateBug } from '../api';

interface CreateBugDialogProps {
  open: boolean;
  onClose: () => void;
  /** Pre-attach the new bug to a project (from the project Bugs tab). */
  defaultProjectId?: string;
  /** Pre-link the new bug to a test case (from the Testing table). */
  defaultCaseId?: string;
  defaultCaseLabel?: string;
  defaultReportId?: string;
  /** Open the bug straight into a column (set when added from that column). */
  defaultStatus?: string;
  /** The team whose list to create in — without it the API uses the default team. */
  teamId?: string;
  /** Create straight into a team cycle (a cycle-filtered board creates there —
   *  otherwise the new card instantly vanishes from the filtered view). */
  defaultCycleId?: string;
}

export function CreateBugDialog({
  open,
  onClose,
  defaultProjectId,
  defaultCaseId,
  defaultCaseLabel,
  defaultReportId,
  defaultStatus,
  teamId,
  defaultCycleId,
}: CreateBugDialogProps) {
  const create = useCreateBug();
  const [title, setTitle] = useState('');
  const [severity, setSeverity] = useState<BugSeverity>(BugSeverity.MEDIUM);
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setError(null);
    create.mutate(
      {
        title: title.trim(),
        severity,
        description: description.trim(),
        status: defaultStatus || undefined,
        teamId: teamId || undefined,
        cycleId: defaultCycleId || undefined,
        projectId: defaultProjectId || undefined,
        caseId: defaultCaseId || undefined,
        caseLabel: defaultCaseLabel || undefined,
        reportId: defaultReportId || undefined,
      },
      {
        onSuccess: () => {
          setTitle('');
          setDescription('');
          setSeverity(BugSeverity.MEDIUM);
          onClose();
        },
        onError: (err) => setError((err as Error).message),
      },
    );
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('bugs.report')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} type="button">
            {t('common.cancel')}
          </Button>
          <Button form="bug-form" type="submit" loading={create.isPending}>
            {t('common.create')}
          </Button>
        </>
      }
    >
      <form id="bug-form" onSubmit={submit}>
        {error && (
          <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}
        {defaultCaseLabel && (
          <div className="mb-4 flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-foreground">
            <span aria-hidden>🔗</span>
            <span className="text-muted-foreground">{t('bugs.linkedCase')}</span>
            <span className="font-medium">{defaultCaseLabel}</span>
          </div>
        )}
        <Field label={t('bugs.title2')} htmlFor="b-title">
          <Input id="b-title" value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus />
        </Field>
        <Field label={t('bugs.severity')} htmlFor="b-sev">
          <Select
            id="b-sev"
            value={severity}
            onValueChange={(v) => setSeverity(v as BugSeverity)}
            options={BUG_SEVERITIES.map((s) => ({ value: s, label: BUG_SEVERITY_LABEL[s] }))}
          />
        </Field>
        <Field label={t('bugs.description')} htmlFor="b-desc">
          <Textarea id="b-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
      </form>
    </Dialog>
  );
}
