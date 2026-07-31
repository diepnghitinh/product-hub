import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Textarea } from '@/components/ui/Textarea';
import {
  SelectMenu,
  SelectMenuContent,
  SelectMenuItem,
  SelectMenuTrigger,
  SelectMenuValue,
} from '@/components/ui/select-menu';
import { useCreateTenant, usePlans } from '@/lib/queries';

/** Radix Select can't hold `''`, so "no plan" needs a sentinel value. */
const NO_PLAN = '__none__';

const EMPTY = {
  name: '',
  slug: '',
  contactEmail: '',
  notes: '',
  adminName: '',
  adminEmail: '',
  adminPassword: '',
  planCode: NO_PLAN,
};

/**
 * Creating a workspace also creates its first admin — the API treats them as one
 * operation, because a workspace nobody can sign into is not a workspace.
 */
export function CreateTenantDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: (id: string) => void;
}) {
  const [form, setForm] = useState(EMPTY);
  const { data: plans } = usePlans();
  const create = useCreateTenant();

  const set = (key: keyof typeof EMPTY) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  function close() {
    setForm(EMPTY);
    create.reset();
    onClose();
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      const tenant = await create.mutateAsync({
        name: form.name.trim(),
        slug: form.slug.trim() || undefined,
        contactEmail: form.contactEmail.trim() || undefined,
        notes: form.notes.trim() || undefined,
        adminName: form.adminName.trim(),
        adminEmail: form.adminEmail.trim(),
        adminPassword: form.adminPassword,
        planCode: form.planCode === NO_PLAN ? undefined : form.planCode,
      });
      toast.success(`${tenant.name} created`);
      onCreated?.(tenant.id);
      close();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create the workspace');
    }
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title="New workspace"
      className="max-w-xl"
      footer={
        <>
          <Button type="button" variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" form="create-tenant" loading={create.isPending}>
            Create workspace
          </Button>
        </>
      }
    >
      <form id="create-tenant" onSubmit={onSubmit} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="t-name">Workspace name</Label>
            <Input
              id="t-name"
              required
              autoFocus
              value={form.name}
              onChange={(e) => set('name')(e.target.value)}
              placeholder="Acme Product Team"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t-slug">Slug</Label>
            <Input
              id="t-slug"
              value={form.slug}
              onChange={(e) => set('slug')(e.target.value)}
              placeholder="acme"
            />
            <p className="text-xs text-muted-foreground">
              Optional. Lowercase letters, numbers and dashes.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t-contact">Billing contact</Label>
            <Input
              id="t-contact"
              type="email"
              value={form.contactEmail}
              onChange={(e) => set('contactEmail')(e.target.value)}
              placeholder="billing@acme.co"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="t-plan">Plan</Label>
            <SelectMenu value={form.planCode} onValueChange={set('planCode')}>
              <SelectMenuTrigger id="t-plan">
                <SelectMenuValue />
              </SelectMenuTrigger>
              <SelectMenuContent>
                <SelectMenuItem value={NO_PLAN}>No plan yet</SelectMenuItem>
                {(plans ?? [])
                  .filter((p) => p.isActive)
                  .map((p) => (
                    <SelectMenuItem key={p.code} value={p.code}>
                      {p.name}
                    </SelectMenuItem>
                  ))}
              </SelectMenuContent>
            </SelectMenu>
          </div>
        </div>

        <div className="space-y-4 rounded-lg border bg-muted/30 p-4">
          <div>
            <p className="text-sm font-medium">First administrator</p>
            <p className="text-xs text-muted-foreground">
              They sign in at the workspace app and invite everyone else.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="a-name">Name</Label>
              <Input
                id="a-name"
                required
                value={form.adminName}
                onChange={(e) => set('adminName')(e.target.value)}
                placeholder="Alice Nguyen"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="a-email">Email</Label>
              <Input
                id="a-email"
                type="email"
                required
                value={form.adminEmail}
                onChange={(e) => set('adminEmail')(e.target.value)}
                placeholder="alice@acme.co"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="a-password">Temporary password</Label>
              <Input
                id="a-password"
                type="text"
                required
                minLength={6}
                value={form.adminPassword}
                onChange={(e) => set('adminPassword')(e.target.value)}
                placeholder="At least 6 characters"
              />
              <p className="text-xs text-muted-foreground">
                Shown as text on purpose — you have to pass it on. Tell them to change it.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="t-notes">Internal notes</Label>
          <Textarea
            id="t-notes"
            rows={2}
            value={form.notes}
            onChange={(e) => set('notes')(e.target.value)}
            placeholder="Anything the next operator should know."
          />
        </div>
      </form>
    </Dialog>
  );
}
