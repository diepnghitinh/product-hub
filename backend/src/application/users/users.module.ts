import { Module } from '@nestjs/common';
import { InfrastructureUsersModule } from '@infrastructure/users/users.module';
import {
  CreateUserUseCase,
  GetUsersUseCase,
  GetUserUseCase,
  UpdateUserUseCase,
  DeleteUserUseCase,
  ChangePasswordUseCase,
} from './use-cases';

const useCases = [
  CreateUserUseCase,
  GetUsersUseCase,
  GetUserUseCase,
  UpdateUserUseCase,
  DeleteUserUseCase,
  ChangePasswordUseCase,
];

@Module({
  imports: [InfrastructureUsersModule],
  providers: [...useCases],
  exports: [...useCases],
})
export class ApplicationUsersModule {}
