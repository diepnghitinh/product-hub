import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ITaskRepository } from '@application/tasks/repositories/task.repository';
import { TaskSchema } from './entities/task.schema';
import { TaskRepository } from './repositories/task.repository';

@Module({
  imports: [MongooseModule.forFeature([{ name: 'Task', schema: TaskSchema }])],
  providers: [{ provide: ITaskRepository, useClass: TaskRepository }],
  exports: [ITaskRepository],
})
export class InfrastructureTasksModule {}
