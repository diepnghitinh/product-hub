import { ApiKeyEntity } from './api-key.entity';
import { ApiKeyScope } from './api-key.enums';

const base = {
  tenantId: 't1',
  name: 'CI pipeline',
  keyHash: 'hash',
  prefix: 'phk_ab12',
  createdBy: 'u1',
};

describe('ApiKeyEntity.create — scope', () => {
  it('defaults a new key to read-only', () => {
    const result = ApiKeyEntity.create(base);
    expect(result.isSuccess).toBe(true);
    expect(result.getValue().scope).toBe(ApiKeyScope.READ_ONLY);
  });

  it('preserves an explicit scope', () => {
    const result = ApiKeyEntity.create({ ...base, scope: ApiKeyScope.READ_WRITE_DELETE });
    expect(result.getValue().scope).toBe(ApiKeyScope.READ_WRITE_DELETE);
  });
});
