/** JWT settings, read from env (loaded globally by ConfigModule). */
export const jwtConstants = {
  secret: process.env.JWT_SECRET || 'dev-secret-change-me',
  expiresIn: process.env.JWT_EXPIRES_IN || '7d',
};
