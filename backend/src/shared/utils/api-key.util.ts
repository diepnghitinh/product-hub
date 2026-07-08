import { createHash, randomBytes } from 'crypto';

const PREFIX = 'phk_';

/** Generate a new API key: returns the plaintext (shown once), its hash, and a
 * masked display prefix. */
export function generateApiKey(): { key: string; hash: string; prefix: string } {
  const key = PREFIX + randomBytes(24).toString('hex');
  return {
    key,
    hash: hashApiKey(key),
    prefix: `${key.slice(0, 12)}…`,
  };
}

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}
