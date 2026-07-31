import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Textarea } from '@/components/ui/Textarea';
import { useUpdateTenant } from '@/lib/queries';
import type { Tenant } from '@/lib/types';

export function EditTenantDialog({
  open,
  onClose,
  tenant,
}: {
  open: boolean;
  onClose: () => void;
  tenant: Tenant;
}) {
  const update = useUpdateTenant();
  const [name, setName] = useState(tenant.name);
  const [slug, setSlug] = useState(tenant.slug ?? '');
  const [contactEmail, setContactEmail] = useState(tenant.contactEmail ?? '');
  const [notes, setNotes] = useState(tenant.notes ?? '');

  // Re-seed on open, so reopening after a cancel shows what is actually saved.
  useEffect(() => {
    if (!open) return;
    setName(tenant.name);
    setSlug(tenant.slug ?? '');
    setContactEmail(tenant.contactEmail ?? '');
    setNotes(tenant.notes ?? '');
  }, [open, tenant]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      await update.mutateAsync({
        id: tenant.id,
        name: name.trim(),
        // Empty means "clear it", which the API stores as null — not "leave alone".
        slug: slug.trim() || null,
        contactEmail: contactEmail.trim() || null,
        notes: notes.trim() || null,
      });
      toast.success('Workspace updated');
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save the workspace');
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Edit workspace"
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="edit-tenant" loading={update.isPending}>
            Save
          </Button>
        </>
      }
    >
      <form id="edit-tenant" onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="e-name">Name</Label>
          <Input id="e-name" required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="e-slug">Slug</Label>
          <Input id="e-slug" value={slug} onChange={(e) => setSlug(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="e-contact">Billing contact</Label>
          <Input
            id="e-contact"
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="e-notes">Internal notes</Label>
          <Textarea
            id="e-notes"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </form>
    </Dialog>
  );
}
