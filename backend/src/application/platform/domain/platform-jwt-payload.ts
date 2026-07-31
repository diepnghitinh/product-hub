/**
 * What a platform operator's token carries. Note the absence of `tenantId`: a
 * platform admin belongs to no workspace, which is exactly why this payload is
 * a different type from {@link JwtPayload} rather than a superset of it.
 */
export interface PlatformJwtPayload {
  adminId: string;
  email: string;
  name: string;
  /** Always 'platform' — the marker the strategy checks. */
  scope: 'platform';
}
