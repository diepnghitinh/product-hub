import { CreateProjectUseCase } from './create-project.use-case';
import { IProjectRepository } from '../repositories/project.repository';
import { Environment } from '../domain/enums/environment.enum';

describe('CreateProjectUseCase', () => {
  let projects: jest.Mocked<IProjectRepository>;
  let useCase: CreateProjectUseCase;

  beforeEach(() => {
    projects = {
      findById: jest.fn(),
      findByTenant: jest.fn(),
      existsBySlug: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<IProjectRepository>;
    useCase = new CreateProjectUseCase(projects);
  });

  it('creates a project with a slug derived from the title', async () => {
    projects.existsBySlug.mockResolvedValue(false);

    const result = await useCase.execute({
      tenantId: 't1',
      userId: 'u1',
      userName: 'Jane',
      dto: { title: 'Checkout Revamp', environment: Environment.STAGING },
    });

    expect(result.isSuccess).toBe(true);
    const project = result.getValue();
    expect(project.tenantId).toBe('t1');
    expect(project.slug).toBe('checkout-revamp');
    expect(project.createdBy).toBe('u1');
    expect(project.owner).toBe('Jane'); // defaults to creator name
    expect(project.environment).toBe(Environment.STAGING);
    expect(projects.save).toHaveBeenCalledTimes(1);
  });

  it('appends a suffix when the slug is already taken', async () => {
    // First candidate exists, second is free.
    projects.existsBySlug
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    const result = await useCase.execute({
      tenantId: 't1',
      userId: 'u1',
      userName: 'Jane',
      dto: { title: 'Checkout Revamp' },
    });

    expect(result.getValue().slug).toBe('checkout-revamp-2');
  });
});
