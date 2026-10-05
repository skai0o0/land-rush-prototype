import { GameState } from "../schema/GameState";
import { LANDMARK_ROSTER } from "../../../shared/constants/landmarks";
import { SCHOOL_IDS } from "../../../shared/constants/schools";
import { BEACON_CRYSTALS } from "../../../shared/constants/gameplay";
import { retentionAt } from "./knowledge";

export type Placement = { kind: "hqs" | "landmarks" | "unistops" | "chests"; id: string; x: number; y: number; configKey?: string; tier?: string; name?: string; threshold?: number; moved: boolean };
export function footprint(p: Placement): [number, number][] {
  const result: [number, number][] = [];
  if (p.kind === "hqs") {
    for (let dx = -10; dx <= 10; dx++) {
      const edge = Math.floor((20 - Math.abs(dx)) / Math.sqrt(3));
      for (let dy = -edge; dy <= edge; dy++) result.push([p.x + dx, p.y + dy]);
    }
  } else {
    const dims = p.kind === "landmarks" ? LANDMARK_ROSTER[p.configKey!].footprint : p.kind === "unistops" ? {width:10,height:5} : {width:2,height:2};
    const x = p.kind === "landmarks" ? p.x : p.x - Math.floor(dims.width / 2);
    const y = p.kind === "landmarks" ? p.y : p.y - Math.floor(dims.height / 2);
    for (let dx=0; dx<dims.width; dx++) for (let dy=0; dy<dims.height; dy++) result.push([x+dx,y+dy]);
  }
  return result;
}

/** Validate the complete resulting layout before any room mutation, including swaps. */
export function planMapLayout(state: GameState, data: any, landmarkTiles: Map<string, unknown>, neglectMs?: number, stepMs?: number): Placement[] {
  if (!data || typeof data !== "object") throw new Error("Bố trí không hợp lệ");
  const result: Placement[] = [];
  for (const kind of ["hqs","landmarks","unistops","chests"] as const) {
    const entries = new Map<string, Placement>();
    for (const [id, item] of state[kind] as any) entries.set(id, {kind,id,x:item.x,y:item.y ?? item.z,configKey:item.landmarkKey,tier:item.tier,name:item.name,threshold:item.maxCrystals,moved:false});
    if (data[kind] !== undefined) {
      if (!Array.isArray(data[kind]) || data[kind].length > 500) throw new Error("Danh sách bố trí không hợp lệ");
      const seen = new Set<string>();
      for (const item of data[kind]) {
        const id = kind === "hqs" ? item?.schoolId : item?.id || item?.landmarkKey;
        if (typeof id !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(id) || seen.has(id)) throw new Error("Mã đối tượng không hợp lệ hoặc bị trùng");
        seen.add(id);
        const old = entries.get(id);
        const x = item.x, y = kind === "hqs" || kind === "landmarks" ? item.y ?? item.z : item.z ?? item.y;
        if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) throw new Error("Tọa độ phải là số nguyên");
        const configKey = old?.configKey || item.landmarkKey || id;
        if (kind === "hqs" && !SCHOOL_IDS.includes(id)) throw new Error("Trường không hợp lệ");
        if (kind === "landmarks" && (!LANDMARK_ROSTER[configKey] || (old && item.landmarkKey && item.landmarkKey !== configKey))) throw new Error("Công trình không hợp lệ");
        const tier = item.tier || old?.tier || "aspire";
        if ((kind === "unistops" || kind === "chests") && !["aspire","nitro","predator"].includes(tier)) throw new Error("Hạng quà không hợp lệ");
        const threshold = item.maxCrystals ?? item.maxFuel ?? old?.threshold ?? BEACON_CRYSTALS;
        if (kind === "landmarks" && (!Number.isSafeInteger(threshold) || threshold < 1 || threshold > 1000000)) throw new Error("Mốc tinh thể không hợp lệ");
        entries.set(id,{kind,id,x,y,configKey,tier,name:typeof item.name === "string" ? item.name.slice(0,120) : old?.name,threshold:Math.max(BEACON_CRYSTALS,threshold),moved:!old || old.x!==x || old.y!==y});
      }
    }
    result.push(...entries.values());
  }
  const occupied = new Map<string, Placement>();
  const landmarkConfigs = new Set<string>();
  for (const p of result) if (p.kind === "landmarks") {
    if (landmarkConfigs.has(p.configKey!)) throw new Error("Công trình bị lặp trong bố trí");
    landmarkConfigs.add(p.configKey!);
  }
  for (const p of result) for (const [x,y] of footprint(p)) {
    if (x<0 || x>=1000 || y<0 || y>=1000) throw new Error("Footprint vượt biên bản đồ");
    const key=`${x},${y}`, previous=occupied.get(key);
    if (previous && (p.moved || previous.moved)) throw new Error("Footprint các đối tượng bị chồng lên nhau");
    occupied.set(key,p);
    if (p.moved && (p.kind === "hqs" || p.kind === "landmarks") && !landmarkTiles.has(key)) {
      const tile=state.claimedTiles.get(key);
      // Foundations may move; a relocation cannot erase students' explored knowledge.
      if (tile && (tile.knowledgeInitialized ? Array.from(tile.knowledge.values()).some(k=>!k.persistent && retentionAt(k,Date.now(),neglectMs,stepMs)>0) : tile.ownerId && tile.maxHp!==500)) throw new Error("Vị trí mới đang có tri thức sinh viên; chọn vùng trống");
    }
  }
  return result;
}
