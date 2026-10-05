import { Pool } from 'pg';

/** Identity persistence only. Wallet/inventory storage needs a separate reviewed schema. */
export interface GameUserRecord { id: string; portalUserId: string; displayName: string; schoolId: string; campaignId: string; status: string }
export interface PlayerRepository {
  findByPortalId(campaignId: string, portalUserId: string): Promise<GameUserRecord | undefined>;
}
export class InMemoryPlayerRepository implements PlayerRepository {
  readonly users = new Map<string,GameUserRecord>();
  async findByPortalId(campaignId:string,portalUserId:string) {return Array.from(this.users.values()).find(u=>u.campaignId===campaignId&&u.portalUserId===portalUserId);}
}
export class PostgresPlayerRepository implements PlayerRepository {
  constructor(private pool: Pool) {}
  async findByPortalId(campaignId:string,portalUserId:string) {
    const {rows}=await this.pool.query('select id,portal_user_id,display_name,school_id,campaign_id,status from public.game_users where campaign_id=$1 and portal_user_id=$2',[campaignId,portalUserId]);
    if(!rows.length)return undefined;
    const r=rows[0];return {id:r.id,portalUserId:r.portal_user_id,displayName:r.display_name,schoolId:r.school_id,campaignId:r.campaign_id,status:r.status};
  }
}
