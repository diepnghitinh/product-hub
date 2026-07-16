import { Module } from '@nestjs/common';
import { ApplicationTasksModule } from '@application/tasks/tasks.module';
import { TasksController } from './tasks.controller';

@Module({
  imports: [ApplicationTasksModule],
  controllers: [TasksController],
})
export class TasksPresentationModule {}
