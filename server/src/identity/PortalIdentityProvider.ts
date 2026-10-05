export interface PortalIdentity {
  gameUserId: string;
  portalUserId: string;
  studentId: string;
  /** Canonical gameplay code (e.g. hcmut), never the schools.id UUID. */
  schoolCode: string;
  /** campaigns.id UUID, not the campaign code. Portal/Webmaster is authoritative. */
  campaignId: string;
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
