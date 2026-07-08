import { useState, type ComponentType } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import {
  AlignLeft,
  Check,
  CircleAlert,
  ClipboardCheck,
  FileText,
  ListChecks,
  Plus,
  SquareCheck,
  User,
  X,
} from 'lucide-react';
import { Button, Input, Select, Textarea } from '@/components/ui';
import type { TestCaseData } from '@/types/dto';

interface CaseEditDialogProps {
  testCase: TestCaseData;
  users: string[];
  onClose: () => void;
  onSave: (updated: TestCaseData) => void;
}

/** Purple icon + uppercase label used for every field header. */
function SectionLabel({
  icon: Icon,
  children,
  trailing,
}: {
  icon: ComponentType<{ className?: string }>;
  children: React.ReactNode;
  trailing?: React.ReactNode;
}) {
  return (
    <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-primary">
      <Icon className="size-3.5" />
      {children}
      {trailing}
    </span>
  );
}

/**
 * Full "Edit test case" modal — a wide three-column form (details · steps ·
 * note) with a header badge and Save/Cancel footer. Edits a local draft and
 * commits it on Save. Built on the app's design-system primitives.
 */
export function CaseEditDialog({ testCase, users, onClose, onSave }: CaseEditDialogProps) {
  const [draft, setDraft] = useState<TestCaseData>(testCase);
  const patch = (p: Partial<TestCaseData>) => setDraft((d) => ({ ...d, ...p }));

  const steps = draft.testSteps ?? [];
  const setSteps = (next: string[]) => patch({ testSteps: next });
  const ownerKnown = !draft.owner || users.includes(draft.owner);

  return (
    <DialogPrimitive.Root open onOpenChange={(next) => !next && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-50 grid max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-[1080px] -translate-x-1/2 -translate-y-1/2 grid-rows-[auto_1fr_auto] overflow-hidden rounded-xl border bg-background shadow-2xl duration-200 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        >
          {/* Header */}
          <div className="flex items-start gap-3 border-b bg-muted/30 px-6 py-4">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <ClipboardCheck className="size-5" />
            </span>
            <div className="min-w-0">
              <DialogPrimitive.Title className="text-base font-semibold tracking-tight">
                Edit test case
              </DialogPrimitive.Title>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Make changes, then save to apply
              </p>
            </div>
            <DialogPrimitive.Close
              aria-label="Close"
              className="-mr-1 ml-auto grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-5" />
            </DialogPrimitive.Close>
          </div>

          {/* Body: details · steps · note */}
          <div className="grid gap-x-6 gap-y-6 overflow-y-auto px-6 py-5 lg:grid-cols-3">
            {/* Column 1 — details */}
            <div className="flex flex-col gap-5">
              <label className="flex flex-col gap-1.5">
                <SectionLabel
                  icon={AlignLeft}
                  trailing={
                    draft.shortId ? (
                      <span className="ml-auto font-mono text-[11px] font-medium normal-case tracking-normal text-muted-foreground">
                        {draft.shortId}
                      </span>
                    ) : null
                  }
                >
                  Name
                </SectionLabel>
                <Input
                  value={draft.area}
                  placeholder="Test case name"
                  onChange={(e) => patch({ area: e.target.value })}
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <SectionLabel icon={User}>Owner</SectionLabel>
                <Select value={draft.owner} onChange={(e) => patch({ owner: e.target.value })}>
                  <option value="">— Unassigned —</option>
                  {users.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                  {!ownerKnown && <option value={draft.owner}>{draft.owner}</option>}
                </Select>
              </label>

              <label className="flex flex-col gap-1.5">
                <SectionLabel icon={CircleAlert}>Precondition</SectionLabel>
                <Textarea
                  rows={3}
                  value={draft.precondition ?? ''}
                  placeholder="What must be true before running this case"
                  onChange={(e) => patch({ precondition: e.target.value })}
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <SectionLabel icon={Check}>Expected result</SectionLabel>
                <Textarea
                  rows={3}
                  value={draft.expectedResult ?? ''}
                  placeholder="What should happen"
                  onChange={(e) => patch({ expectedResult: e.target.value })}
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <SectionLabel icon={SquareCheck}>Actual result</SectionLabel>
                <Textarea
                  rows={3}
                  value={draft.actualResult ?? ''}
                  placeholder="What actually happened"
                  onChange={(e) => patch({ actualResult: e.target.value })}
                />
              </label>
            </div>

            {/* Column 2 — steps */}
            <div className="flex flex-col gap-3">
              <SectionLabel icon={ListChecks}>Test steps</SectionLabel>
              <div className="flex flex-col gap-2">
                {steps.map((s, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="mt-1 grid size-7 shrink-0 place-items-center rounded-md border bg-muted text-xs font-semibold text-muted-foreground">
                      {i + 1}
                    </span>
                    <Textarea
                      rows={2}
                      value={s}
                      placeholder={`Step ${i + 1}`}
                      className="min-h-[60px]"
                      onChange={(e) => setSteps(steps.map((v, j) => (j === i ? e.target.value : v)))}
                    />
                    <button
                      type="button"
                      aria-label="Remove step"
                      onClick={() => setSteps(steps.filter((_, j) => j !== i))}
                      className="mt-1 grid size-7 shrink-0 place-items-center rounded-md border text-muted-foreground transition-colors hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                ))}
              </div>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setSteps([...steps, ''])}
              >
                <Plus className="size-4" /> Add step
              </Button>
            </div>

            {/* Column 3 — note */}
            <div className="flex min-h-[220px] flex-col gap-3">
              <SectionLabel icon={FileText}>Note</SectionLabel>
              <Textarea
                value={draft.note ?? ''}
                placeholder="Additional notes, context, or follow-ups"
                className="min-h-[220px] flex-1 resize-none"
                onChange={(e) => patch({ note: e.target.value })}
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 border-t bg-muted/30 px-6 py-4">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={() => onSave(draft)}>Save</Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
