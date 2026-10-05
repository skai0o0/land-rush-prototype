export interface PortalIdentity {
  /** Canonical game_users.id; gameplay/profile/session keys use this value. */
  gameUserId: string;
  portalUserId: string;
  /** School-scoped MSSV metadata; never an authentication or gameplay key. */
  studentId: string;
  /** Canonical gameplay code (e.g. hcmut), never the schools.id UUID. */
  schoolCode: string;
  /** Internal campaigns.id UUID resolved by the game adapter. Webmaster supplies
   * an external campaign code such as r2pl-2027, not this database UUID. */
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
