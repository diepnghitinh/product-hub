import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { TaskStatus } from '../domain/enums/task.enums';

export class UpdateTaskStatusDto {
  @ApiProperty({ enum: TaskStatus })
  @IsEnum(TaskStatus)
  status: TaskStatus;
}
