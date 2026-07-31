import { Module } from '@nestjs/common';
import { InfrastructureUsersModule } from '@infrastructure/users/users.module';
import {
  CreateUserUseCase,
  GetUsersUseCase,
  GetUserUseCase,
  UpdateUserUseCase,
  UpdateMyAvatarUseCase,
  DeleteUserUseCase,
  ChangePasswordUseCase,
  ResetUserPasswordUseCase,
  GetPersonalStatusesUseCase,
  ReplacePersonalStatusesUseCase,
  TouchUserActivityUseCase,
} from './use-cases';

const useCases = [
  CreateUserUseCase,
  GetUsersUseCase,
  GetUserUseCase,
  UpdateUserUseCase,
  UpdateMyAvatarUseCase,
  DeleteUserUseCase,
  ChangePasswordUseCase,
  ResetUserPasswordUseCase,
  GetPersonalStatusesUseCase,
  ReplacePersonalStatusesUseCase,
  TouchUserActivityUseCase,
];

@Module({
  imports: [InfrastructureUsersModule],
  providers: [...useCases],
  exports: [...useCases],
})
export class ApplicationUsersModule {}
