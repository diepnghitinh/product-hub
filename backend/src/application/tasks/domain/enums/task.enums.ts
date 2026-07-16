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
