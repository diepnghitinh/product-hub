import { useState, type ReactNode } from 'react';
import { Ban, Copy, Flag, GitBranch, GitMerge, Link2 } from 'lucide-react';
import type { MenuItem } from '@/components/ui';
import { t } from '@/i18n';
import { IssueKind, RELATION_TYPES, RELATION_TYPE_LABEL, RelationType } from '@/types/enums';
import { PickIssueDialog } from './PickIssueDialog';
import { useCreateIssueRelation } from './relations.api';

const ICON: Record<RelationType, typeof Flag> = {
  [RelationType.PARENT_OF]: GitBranch,
  [RelationType.SUB_ISSUE_OF]: GitMerge,
  [RelationType.RELATED_TO]: Link2,
  [RelationType.BLOCKED_BY]: Ban,
  [RelationType.BLOCKS]: Ban,
  [RelationType.DUPLICATE_OF]: Copy,
};

/**
 * The "Mark as ▸" submenu item + its issue picker, for a task/bug detail page.
 * Returns a `MenuItem` to drop into the ⋯ menu and the picker node to render.
 * Linking is same-type — a task links tasks, a bug links bugs.
 */
export function useRelationActions(subject: IssueKind, issueId: string) {
  const [type, setType] = useState<RelationType | null>(null);
  const create = useCreateIssueRelation();

  const markAsItem: MenuItem = {
    label: t('relations.markAs'),
    icon: <Flag className="size-4" />,
    children: RELATION_TYPES.map((rt) => {
      const Icon = ICON[rt];
      return {
        label: RELATION_TYPE_LABEL[rt],
        icon: <Icon className="size-4" />,
        onClick: () => setType(rt),
      };
    }),
  };

  const picker: ReactNode = (
    <PickIssueDialog
      open={type !== null}
      subject={subject}
      excludeIds={[issueId]}
      title={type ? RELATION_TYPE_LABEL[type] : ''}
      pending={create.isPending}
      onClose={() => setType(null)}
      onPick={(targetId) => {
        if (!type) return;
        create.mutate(
          { issueType: subject, sourceId: issueId, targetId, relationType: type },
          { onSuccess: () => setType(null) },
        );
      }}
    />
  );

  return { markAsItem, picker };
}
