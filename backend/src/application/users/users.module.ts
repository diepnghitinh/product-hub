import { Module } from '@nestjs/common';
import { InfrastructureUsersModule } from '@infrastructure/users/users.module';
import {
  CreateUserUseCase,
  GetUsersUseCase,
  GetUserUseCase,
  UpdateUserUseCase,
  DeleteUserUseCase,
  ChangePasswordUseCase,
  ResetUserPasswordUseCase,
  GetPersonalStatusesUseCase,
  ReplacePersonalStatusesUseCase,
} from './use-cases';

const useCases = [
  CreateUserUseCase,
  GetUsersUseCase,
  GetUserUseCase,
  UpdateUserUseCase,
  DeleteUserUseCase,
  ChangePasswordUseCase,
  ResetUserPasswordUseCase,
  GetPersonalStatusesUseCase,
  ReplacePersonalStatusesUseCase,
];

@Module({
  imports: [InfrastructureUsersModule],
  providers: [...useCases],
  exports: [...useCases],
})
export class ApplicationUsersModule {}
