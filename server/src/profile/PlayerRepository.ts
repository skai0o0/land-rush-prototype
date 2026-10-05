import { Pool } from 'pg';

/** Identity persistence only. Wallet/inventory storage needs a separate reviewed schema. */
export interface GameUserRecord { id: string; portalUserId: string; displayName: string; databaseSchoolId: string; schoolCode: string; studentId?: string; email?: string; campaignId: string; status: string }
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
    const {rows}=await this.pool.query('select u.*, lower(s.code) as school_code from public.game_users u join public.schools s on s.id=u.school_id where u.campaign_id=$1 and u.portal_user_id=$2',[campaignId,portalUserId]);
    if(!rows.length)return undefined;
    const r=rows[0];return {id:r.id,portalUserId:r.portal_user_id,displayName:r.display_name,databaseSchoolId:r.school_id,schoolCode:r.school_code,studentId:r.student_id ?? undefined,email:r.email ?? undefined,campaignId:r.campaign_id,status:r.status};
  }
}
