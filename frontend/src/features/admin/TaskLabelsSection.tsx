import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Input,
  Spinner,
} from '@/components/ui';
import { t } from '@/i18n';
import type { TaskLabelConfig } from '@/types/enums';
import { useTaskLabels, useUpdateTaskLabels } from '@/features/settings/api';

/**
 * Manage the workspace's task labels. Unlike statuses there are no built-ins —
 * a workspace starts with none, and an empty list is a valid saved state.
 *
 * Reads the narrow `/settings/task-labels` rather than the whole `/settings`:
 * that one is @Roles(ADMIN) and returns the webhook config, so fetching it here
 * would 403 for the Product managers who are allowed to edit labels.
 */
export function TaskLabelsSection() {
  const { data } = useTaskLabels();
  const save = useUpdateTaskLabels();
  const [rows, setRows] = useState<TaskLabelConfig[]>([]);
  const loading = data === undefined;

  useEffect(() => {
    if (data) setRows(data);
  }, [data]);

  function update(key: string, patch: Partial<TaskLabelConfig>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }
  function addLabel() {
    // Stable generated slug — the name is editable but the key mustn't change
    // once tasks reference it.
    const taken = new Set(rows.map((r) => r.key));
    let n = rows.length + 1;
    while (taken.has(`label-${n}`)) n += 1;
    setRows((rs) => [...rs, { key: `label-${n}`, name: 'New label', color: '#a855f7' }]);
  }
  function removeLabel(key: string) {
    setRows((rs) => rs.filter((r) => r.key !== key));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('labels.title')}</CardTitle>
        <CardDescription>{t('labels.hint')}</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="grid place-items-center rounded-xl border border-dashed p-8">
            <Spinner />
          </div>
        ) : (
          <div className="divide-y rounded-xl border">
            {rows.length === 0 && (
              <p className="p-6 text-center text-sm text-muted-foreground">{t('labels.empty')}</p>
            )}
            {rows.map((r) => (
              <div key={r.key} className="flex flex-wrap items-center gap-3 p-3 sm:gap-4 sm:px-4">
                <input
                  type="color"
                  className="size-8 shrink-0 cursor-pointer rounded-md border bg-transparent p-0.5"
                  value={r.color}
                  aria-label={t('labels.color')}
                  onChange={(e) => update(r.key, { color: e.target.value })}
                />
                <Input
                  className="min-w-0 flex-1 sm:max-w-xs"
                  value={r.name}
                  placeholder={t('labels.name')}
                  onChange={(e) => update(r.key, { name: e.target.value })}
                />
                <span className="font-mono text-xs text-muted-foreground">{r.key}</span>
                <button
                  type="button"
                  aria-label={t('common.delete')}
                  className="ml-auto grid size-7 place-items-center rounded text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => removeLabel(r.key)}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}
            <div className="p-2">
              <Button variant="ghost" size="sm" onClick={addLabel}>
                <Plus className="mr-1.5 size-3.5" />
                {t('labels.add')}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
      <CardFooter className="justify-end">
        <Button
          onClick={() => save.mutate(rows)}
          loading={save.isPending}
          disabled={rows.some((r) => !r.name.trim())}
        >
          {t('labels.save')}
        </Button>
      </CardFooter>
    </Card>
  );
}
