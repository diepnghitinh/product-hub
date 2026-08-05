import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { UnauthorizedDomainException } from '@core/exceptions';
import { AuthenticateApiKeyUseCase } from '@application/api-keys/use-cases/api-key.use-cases';
import { ApiKeyScope } from '@application/api-keys/domain/api-key.enums';

export interface ApiAuth {
  tenantId: string;
  name: string;
  /** The key's own id — what an MCP event is attributed to. */
  keyId: string;
  /** The user who generated the key. A key-authenticated write acts as them, so
   *  an item created through MCP has a real author instead of a nameless robot. */
  userId: string;
  /** The key's ceiling on write/delete — gated at the MCP tool boundary. */
  scope: ApiKeyScope;
}

/**
 * Authenticates a request via the `x-api-key` header and attaches
 * `request.apiAuth`. Used on `@Public()` public-API and MCP routes.
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
    req.apiAuth = {
      tenantId: entity.tenantId,
      name: entity.name,
      keyId: entity.id.toString(),
      userId: entity.createdBy,
      scope: entity.scope,
    };
    return true;
  }
}
