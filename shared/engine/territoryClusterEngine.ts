export class TerritoryClusterEngine {
  private width: number;
  private height: number;
  private ownerMap: Uint8Array;
  private fortifyTierMap: Uint8Array;
  private troopMap: Uint16Array;
  
  constructor(width: number = 1000, height: number = 1000) {
    this.width = width;
    this.height = height;
    const size = width * height;
    this.ownerMap = new Uint8Array(size);
    this.fortifyTierMap = new Uint8Array(size);
    this.troopMap = new Uint16Array(size);
  }

  public getIndex(x: number, y: number): number {
    return y * this.width + x;
  }

  public getCoords(index: number): { x: number; y: number } {
    return {
      x: index % this.width,
      y: Math.floor(index / this.width)
    };
  }

  public setTile(x: number, y: number, schoolId: number, tier: number, troops: number): void {
    const idx = this.getIndex(x, y);
    this.ownerMap[idx] = schoolId;
    this.fortifyTierMap[idx] = tier;
    this.troopMap[idx] = troops;
  }

  public getTileFortifyTier(x: number, y: number): number {
    return this.fortifyTierMap[this.getIndex(x, y)];
  }

  public evaluateCluster(startX: number, startY: number): any {
    const idx = this.getIndex(startX, startY);
    const schoolId = this.ownerMap[idx];
    if (schoolId === 0) return null;

    const visited = new Set<number>();
    const queue: number[] = [idx];
    visited.add(idx);
    
    const cluster: number[] = [];

    // Valid cluster tiles need fortifyTier >= 3 or already part of a cluster (tier >= 3 logic)
    // Wait, the requirement says: "Tìm cụm liên thông các ô cùng trường có fortifyTier >= 3."
    
    while (queue.length > 0) {
      const current = queue.shift()!;
      cluster.push(current);

      const { x, y } = this.getCoords(current);
      const neighbors = this.getNeighbors(x, y);

      for (const nIdx of neighbors) {
        if (!visited.has(nIdx)) {
          if (this.ownerMap[nIdx] === schoolId && this.fortifyTierMap[nIdx] >= 3) {
            visited.add(nIdx);
            queue.push(nIdx);
          }
        }
      }
    }

    let result = {
      type: 'none',
      clusterSize: cluster.length,
      tiles: cluster,
      borderTiles: [] as any[],
      boundingBox: null as any
    };

    if (cluster.length >= 10000) {
      // Mega Emblem
      let minX = this.width, minY = this.height, maxX = 0, maxY = 0;
      cluster.forEach(cIdx => {
        this.fortifyTierMap[cIdx] = 6;
        const coords = this.getCoords(cIdx);
        if (coords.x < minX) minX = coords.x;
        if (coords.y < minY) minY = coords.y;
        if (coords.x > maxX) maxX = coords.x;
        if (coords.y > maxY) maxY = coords.y;
      });
      result.type = 'mega_emblem';
      result.boundingBox = [minX, minY, maxX, maxY];
    } else if (cluster.length >= 100) {
      // Bastion
      const borderTiles: any[] = [];
      cluster.forEach(cIdx => {
        this.fortifyTierMap[cIdx] = 4;
        const coords = this.getCoords(cIdx);
        // Border Detection
        let borders = [];
        if (coords.y === 0 || this.ownerMap[this.getIndex(coords.x, coords.y - 1)] !== schoolId || this.fortifyTierMap[this.getIndex(coords.x, coords.y - 1)] < 3) borders.push('top');
        if (coords.x === this.width - 1 || this.ownerMap[this.getIndex(coords.x + 1, coords.y)] !== schoolId || this.fortifyTierMap[this.getIndex(coords.x + 1, coords.y)] < 3) borders.push('right');
        if (coords.y === this.height - 1 || this.ownerMap[this.getIndex(coords.x, coords.y + 1)] !== schoolId || this.fortifyTierMap[this.getIndex(coords.x, coords.y + 1)] < 3) borders.push('bottom');
        if (coords.x === 0 || this.ownerMap[this.getIndex(coords.x - 1, coords.y)] !== schoolId || this.fortifyTierMap[this.getIndex(coords.x - 1, coords.y)] < 3) borders.push('left');
        
        if (borders.length > 0) {
          borderTiles.push({ index: cIdx, borders });
        }
      });
      result.type = 'bastion';
      result.borderTiles = borderTiles;
    } else {
      // Downgrade to 3 if it was previously part of a bastion but now disconnected
      cluster.forEach(cIdx => {
        if (this.fortifyTierMap[cIdx] > 3) {
          this.fortifyTierMap[cIdx] = 3; // Demote to 3
        }
      });
    }

    return result;
  }

  private getNeighbors(x: number, y: number): number[] {
    const neighbors = [];
    if (y > 0) neighbors.push(this.getIndex(x, y - 1));
    if (x < this.width - 1) neighbors.push(this.getIndex(x + 1, y));
    if (y < this.height - 1) neighbors.push(this.getIndex(x, y + 1));
    if (x > 0) neighbors.push(this.getIndex(x - 1, y));
    return neighbors;
  }

  public getFullState() {
    return {
      ownerMap: this.ownerMap,
      fortifyTierMap: this.fortifyTierMap,
      troopMap: this.troopMap
    };
  }

  public getBorderFlags(schoolId: number): any[] {
    // Return mock for now or implement full scan
    return [];
  }

  public getMegaEmblems(schoolId: number): any[] {
    // Return mock for now or implement full scan
    return [];
  }
}
