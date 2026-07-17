/**
 * Task workflow status — the checkable state of a piece of engineering work.
 * These are the fixed columns of a task list, in this order. The vocabulary is
 * shared with the (future) OKR "Individual"; values mirror the frontend
 * `TaskStatus` enum exactly (frontend/backend enums must match).
 */
export enum TaskStatus {
  TODO = 'todo',
  IN_PROGRESS = 'in-progress',
  DONE = 'done',
}

export const TASK_STATUSES: TaskStatus[] = [
  TaskStatus.TODO,
  TaskStatus.IN_PROGRESS,
  TaskStatus.DONE,
];

/**
 * Tenant-configurable board column for tasks — mirrors `BugStatusConfig`. `key`
 * is the value stored on each task: built-ins (`TaskStatus`) can be
 * relabelled/recoloured/reordered but not removed, and admins may add custom
 * columns with their own slug key. Typed `string` to allow those.
 */
export interface TaskStatusConfig {
  key: string;
  label: string;
  color: string;
}

const DEFAULT_TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  [TaskStatus.TODO]: 'To do',
  [TaskStatus.IN_PROGRESS]: 'In progress',
  [TaskStatus.DONE]: 'Done',
};

/** Semantic colours (mirror the frontend TASK_STATUS_COLOR tokens as hex). */
const DEFAULT_TASK_STATUS_COLOR: Record<TaskStatus, string> = {
  [TaskStatus.TODO]: '#6b7280',
  [TaskStatus.IN_PROGRESS]: '#2563eb',
  [TaskStatus.DONE]: '#16a34a',
};

export const DEFAULT_TASK_STATUSES: TaskStatusConfig[] = TASK_STATUSES.map((key) => ({
  key,
  label: DEFAULT_TASK_STATUS_LABEL[key],
  color: DEFAULT_TASK_STATUS_COLOR[key],
}));

/**
 * A tenant-defined task label (`key` is the stable slug stored on a task, the
 * name/colour are editable). Unlike statuses there are no built-ins — a
 * workspace starts with none and defines its own.
 */
export interface TaskLabelConfig {
  key: string;
  name: string;
  color: string;
}

export const DEFAULT_TASK_LABELS: TaskLabelConfig[] = [];
