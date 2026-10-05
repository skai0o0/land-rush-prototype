export interface PortalIdentity {
  gameUserId: string;
  portalUserId: string;
  schoolId: string;
  displayName: string;
  email?: string;
}
export interface IdentityProvider {
  verifyGameSession(sessionToken: string): Promise<PortalIdentity>;
}
/** Contract only. Production remains closed until the Portal adapter is supplied. */
export class PortalIdentityProvider implements IdentityProvider {
  async verifyGameSession(_sessionToken: string): Promise<PortalIdentity> {
    throw new Error('Portal identity integration is not configured');
  }
}
