/**
 * Platform-console JWT settings.
 *
 * The secret defaults to the app's `JWT_SECRET` *suffixed*, so a deployment that
 * never sets `PLATFORM_JWT_SECRET` still can't have its tenant tokens accepted
 * here (different secret ⇒ signature mismatch). Set it explicitly in production.
 */
export const platformJwtConstants = {
  secret:
    process.env.PLATFORM_JWT_SECRET ||
    `${process.env.JWT_SECRET || 'dev-secret-change-me'}::platform`,
  expiresIn: process.env.PLATFORM_JWT_EXPIRES_IN || '12h',
};
