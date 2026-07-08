import { Module } from '@nestjs/common';
import { ApplicationUsersModule } from '@application/users/users.module';
import { UsersController } from './users.controller';

@Module({
  imports: [ApplicationUsersModule],
  controllers: [UsersController],
})
export class UsersPresentationModule {}
