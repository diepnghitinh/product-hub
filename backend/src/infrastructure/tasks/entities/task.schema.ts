import { Schema } from 'mongoose';
import { v4 as uuid } from 'uuid';
import { TaskStatus } from '@application/tasks/domain/enums/task.enums';

export interface TaskDoc {
  _id: string;
  tenantId: string;
  title: string;
  description: string;
  status: TaskStatus;
  roadmapId: string;
  roadmapItemId: string;
  roadmapItemLabel: string;
  projectId: string;
  assigneeId: string;
  assigneeName: string;
  createdBy: string;
  createdByName: string;
  dueDate: string;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

export const TaskSchema = new Schema<TaskDoc>(
  {
    _id: { type: String, default: () => uuid() },
    tenantId: { type: String, required: true, index: true },
    title: { type: String, required: true, maxlength: 200 },
    description: { type: String, default: '' },
    status: { type: String, enum: Object.values(TaskStatus), default: TaskStatus.TODO },
    roadmapId: { type: String, default: '', index: true },
    roadmapItemId: { type: String, default: '', index: true },
    roadmapItemLabel: { type: String, default: '' },
    projectId: { type: String, default: '', index: true },
    assigneeId: { type: String, default: '', index: true },
    assigneeName: { type: String, default: '' },
    createdBy: { type: String, default: '' },
    createdByName: { type: String, default: '' },
    dueDate: { type: String, default: '' },
    order: { type: Number, default: 0 },
  },
  { timestamps: true },
);
