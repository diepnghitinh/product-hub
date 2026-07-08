import { CreateUserUseCase } from './create-user.use-case';
import { IUserRepository } from '../repositories/user.repository';
import { PasswordService } from '@module-shared/services/password.service';
import { Role } from '@core/interfaces';

describe('CreateUserUseCase', () => {
  let users: jest.Mocked<IUserRepository>;
  let password: jest.Mocked<PasswordService>;
  let useCase: CreateUserUseCase;

  beforeEach(() => {
    users = {
      findById: jest.fn(),
      findByEmail: jest.fn(),
      existsByEmail: jest.fn(),
      findByTenant: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<IUserRepository>;
    password = {
      hash: jest.fn().mockResolvedValue('hashed'),
      compare: jest.fn(),
    } as unknown as jest.Mocked<PasswordService>;
    useCase = new CreateUserUseCase(users, password);
  });

  it('creates a user with a hashed password', async () => {
    users.existsByEmail.mockResolvedValue(false);

    const result = await useCase.execute({
      tenantId: 't1',
      dto: { name: 'Jane', email: 'Jane@Acme.co', password: 'secret123', role: Role.TESTER },
    });

    expect(result.isSuccess).toBe(true);
    expect(password.hash).toHaveBeenCalledWith('secret123');
    const user = result.getValue();
    expect(user.email).toBe('jane@acme.co');
    expect(user.tenantId).toBe('t1');
    expect(users.save).toHaveBeenCalledTimes(1);
  });

  it('rejects a duplicate email', async () => {
    users.existsByEmail.mockResolvedValue(true);

    const result = await useCase.execute({
      tenantId: 't1',
      dto: { name: 'Jane', email: 'jane@acme.co', password: 'secret123' },
    });

    expect(result.isFailure).toBe(true);
    expect(users.save).not.toHaveBeenCalled();
  });
});
