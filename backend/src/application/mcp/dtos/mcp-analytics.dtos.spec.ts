import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { McpBugStatsDto } from './mcp-analytics.dtos';

// Mirrors the app's real global pipe (see main.ts:
// `new ValidationPipe({ transform: true, whitelist: true })`) so this test
// actually exercises the transform/validate order the HTTP route hits,
// rather than calling the use-case directly.
async function runValidationPipe(query: Record<string, unknown>) {
  const instance = plainToInstance(McpBugStatsDto, query, {
    enableImplicitConversion: false,
  });
  const errors = await validate(instance, { whitelist: true });
  return { instance, errors };
}

describe('McpBugStatsDto — groupBy through the real ValidationPipe', () => {
  it('accepts a single groupBy value (?groupBy=status) instead of rejecting it', async () => {
    const { instance, errors } = await runValidationPipe({ groupBy: 'status' });
    expect(errors).toHaveLength(0);
    expect(instance.groupBy).toEqual(['status']);
  });

  it('accepts multiple groupBy values (?groupBy=status&groupBy=severity)', async () => {
    const { instance, errors } = await runValidationPipe({ groupBy: ['status', 'severity'] });
    expect(errors).toHaveLength(0);
    expect(instance.groupBy).toEqual(['status', 'severity']);
  });

  it('leaves groupBy undefined when omitted entirely', async () => {
    const { instance, errors } = await runValidationPipe({});
    expect(errors).toHaveLength(0);
    expect(instance.groupBy).toBeUndefined();
  });
});
