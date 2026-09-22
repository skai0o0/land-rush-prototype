// Fast 2D Simplex/Perlin Noise generator for procedural terrain
function createNoise2D(seed = 42) {
  const perm = new Uint8Array(512);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  
  // Seeded shuffle
  let s = seed;
  for (let i = 255; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    const tmp = p[i];
    p[i] = p[j];
    p[j] = tmp;
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];

  const F2 = 0.5 * (Math.sqrt(3.0) - 1.0);
  const G2 = (3.0 - Math.sqrt(3.0)) / 6.0;

  return function noise2D(x: number, y: number): number {
    let n0 = 0, n1 = 0, n2 = 0;
    const s = (x + y) * F2;
    const i = Math.floor(x + s);
    const j = Math.floor(y + s);
    const t = (i + j) * G2;
    const X0 = i - t;
    const Y0 = j - t;
    const x0 = x - X0;
    const y0 = y - Y0;

    let i1 = 0, j1 = 0;
    if (x0 > y0) { i1 = 1; j1 = 0; } else { i1 = 0; j1 = 1; }

    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1.0 + 2.0 * G2;
    const y2 = y0 - 1.0 + 2.0 * G2;

    const ii = i & 255;
    const jj = j & 255;

    const grad = (hash: number, gx: number, gy: number) => {
      const h = hash & 7;
      const u = h < 4 ? gx : gy;
      const v = h < 4 ? gy : gx;
      return ((h & 1) ? -u : u) + ((h & 2) ? -2.0 * v : 2.0 * v);
    };

    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 > 0) {
      t0 *= t0;
      n0 = t0 * t0 * grad(perm[ii + perm[jj]], x0, y0);
    }

    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 > 0) {
      t1 *= t1;
      n1 = t1 * t1 * grad(perm[ii + i1 + perm[jj + j1]], x1, y1);
    }

    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 > 0) {
      t2 *= t2;
      n2 = t2 * t2 * grad(perm[ii + 1 + perm[jj + 1]], x2, y2);
    }

    return 70.0 * (n0 + n1 + n2);
  };
}

const heightNoise = createNoise2D(1337);
const moistureNoise = createNoise2D(9999);
const roadNoise = createNoise2D(7777);

export type TerrainType = "water" | "hill" | "grass" | "dirt" | "road";

// Lake center (Hồ Đá is centered around 500, 500 or in the mid-north)
export const HO_DA_CENTER = { x: 500, y: 500, radius: 65 };

export function isRoad(x: number, y: number): boolean {
  // Main campus arterial crossroads
  const mainAxisX = Math.abs(x - 500) <= 2;
  const mainAxisY = Math.abs(y - 500) <= 2;
  const ringRoad = Math.abs(Math.hypot(x - 500, y - 500) - 280) <= 2;
  const secondary1 = Math.abs(x - 250) <= 1 && y >= 200 && y <= 800;
  const secondary2 = Math.abs(x - 750) <= 1 && y >= 200 && y <= 800;
  return mainAxisX || mainAxisY || ringRoad || secondary1 || secondary2;
}

export function isHoDaLake(x: number, y: number): boolean {
  const dist = Math.hypot(x - HO_DA_CENTER.x, y - HO_DA_CENTER.y);
  // Organic lake rim via noise
  const noise = heightNoise(x * 0.05, y * 0.05) * 8;
  return (dist + noise) < HO_DA_CENTER.radius;
}

export interface LeveledZone {
  id: string;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  foundationHeight: number;
}

const leveledZones: LeveledZone[] = [];

export function registerLeveledZone(
  id: string,
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  foundationHeight: number
): void {
  const idx = leveledZones.findIndex((z) => z.id === id);
  const zone: LeveledZone = { id, minX, maxX, minY, maxY, foundationHeight };
  if (idx >= 0) {
    leveledZones[idx] = zone;
  } else {
    leveledZones.push(zone);
  }
}

export function clearLeveledZones(): void {
  leveledZones.length = 0;
}

export function isInsideLeveledZone(x: number, y: number): boolean {
  for (let i = 0; i < leveledZones.length; i++) {
    const z = leveledZones[i];
    if (x >= z.minX && x <= z.maxX && y >= z.minY && y <= z.maxY) {
      return true;
    }
  }
  return false;
}

export function getLeveledZone(x: number, y: number): LeveledZone | undefined {
  for (let i = 0; i < leveledZones.length; i++) {
    const z = leveledZones[i];
    if (x >= z.minX && x <= z.maxX && y >= z.minY && y <= z.maxY) {
      return z;
    }
  }
  return undefined;
}

export function getFootprintFoundationHeight(
  minX: number,
  maxX: number,
  minY: number,
  maxY: number
): number {
  let maxH = 0;
  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      const h = getRawTerrainHeight(x, y);
      if (h > maxH) maxH = h;
    }
  }
  return Math.max(0, maxH);
}

export function getRawTerrainHeight(x: number, y: number): number {
  if (isHoDaLake(x, y)) {
    return -0.4; // Inverted quarry lake basin
  }
  const n = heightNoise(x * 0.012, y * 0.012);
  if (n > 0.45) return 0.4;  // High hill
  if (n > 0.15) return 0.2;  // Low hill
  return 0.0; // Flat plain
}

export function getTerrainHeight(x: number, y: number): number {
  for (let i = 0; i < leveledZones.length; i++) {
    const z = leveledZones[i];
    if (x >= z.minX && x <= z.maxX && y >= z.minY && y <= z.maxY) {
      return z.foundationHeight;
    }
  }
  return getRawTerrainHeight(x, y);
}

export function getTerrainMoisture(x: number, y: number): number {
  return (moistureNoise(x * 0.015, y * 0.015) + 1.0) * 0.5; // 0..1
}

export function getTerrainType(x: number, y: number): TerrainType {
  if (isHoDaLake(x, y)) return "water";
  if (isRoad(x, y)) return "road";
  const h = getTerrainHeight(x, y);
  if (h > 0.15) return "hill";
  const m = getTerrainMoisture(x, y);
  if (m < 0.3) return "dirt";
  return "grass";
}

// Terrain color palette
export const TERRAIN_COLORS: Record<TerrainType, number> = {
  water: 0x1ca3a3, // Emerald jade water
  hill: 0x8c5b3e,  // Basalt red soil / rock
  grass: 0x5b8c5a, // Lush campus grass
  dirt: 0x7d6853,  // Earth dirt
  road: 0x4a525a   // Dark grey tarmac
};

export function getTerrainColor(x: number, y: number): number {
  const type = getTerrainType(x, y);
  return TERRAIN_COLORS[type];
}
