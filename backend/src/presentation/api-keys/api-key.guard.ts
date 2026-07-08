import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { UnauthorizedDomainException } from '@core/exceptions';
import { AuthenticateApiKeyUseCase } from '@application/api-keys/use-cases/api-key.use-cases';

export interface ApiAuth {
  tenantId: string;
  name: string;
}

/**
 * Authenticates a request via the `x-api-key` header and attaches
 * `request.apiAuth` ({ tenantId, name }). Used on `@Public()` public-API routes.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly authenticate: AuthenticateApiKeyUseCase) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | undefined>; apiAuth?: ApiAuth }>();
    const key = req.headers['x-api-key'] ?? '';
    const result = await this.authenticate.execute({ key });
    if (result.isFailure) {
      throw new UnauthorizedDomainException(result.error as string);
    }
    const entity = result.getValue();
    req.apiAuth = { tenantId: entity.tenantId, name: entity.name };
    return true;
  }
}
