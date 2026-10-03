import * as THREE from "three";
import {
  createOakTreeGeometry,
  createBirchTreeGeometry,
  createGrassTuftGeometry,
  createFlowerGeometry
} from "./natureProps";
import {
  getTerrainHeight,
  getTerrainMoisture,
  isRoad,
  isHoDaLake
} from "./terrainNoise";
import { expandRect, getHQRect, getLandmarkRect } from "../../../shared/constants/footprint";
import { applyFogOfWar } from "./fogOfWarShader";
import type { FogOfWarManager } from "./fogOfWarManager";

export class NatureGridManager {
  public group: THREE.Group = new THREE.Group();

  private oakMesh!: THREE.InstancedMesh;
  private birchMesh!: THREE.InstancedMesh;
  private grassMesh!: THREE.InstancedMesh;
  private flowerMesh!: THREE.InstancedMesh;

  private isBuilt = false;
  private fogOfWar: FogOfWarManager | null = null;
  private natureMaterial?: THREE.MeshLambertMaterial;

  // Set of exclusion coordinate keys: "x,y"
  private exclusionSet: Set<string> = new Set();
  private currentHQs: { x: number; y: number }[] = [];
  private currentLandmarks: { x: number; y: number; width: number; height: number }[] = [];

  constructor() {
    this.group.name = "NaturePropsGroup";
  }

  public setFogOfWar(fog: FogOfWarManager): void {
    this.fogOfWar = fog;
    if (this.natureMaterial) {
      applyFogOfWar(this.natureMaterial, fog);
      this.natureMaterial.needsUpdate = true;
    }
  }

  public isExcluded(x: number, y: number): boolean {
    if (this.exclusionSet.has(`${x},${y}`)) return true;
    for (let i = 0; i < this.currentHQs.length; i++) {
      const hq = this.currentHQs[i];
      const bounds = expandRect(getHQRect(hq.x, hq.y));
      if (x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY) return true;
    }
    for (let i = 0; i < this.currentLandmarks.length; i++) {
      const lm = this.currentLandmarks[i];
      const bounds = expandRect(getLandmarkRect(lm.x, lm.y, lm.width, lm.height));
      if (x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY) {
        return true;
      }
    }
    return false;
  }

  public setExclusionZones(
    hqs: { x: number; y: number }[],
    landmarks: { x: number; y: number; width: number; height: number }[]
  ) {
    this.currentHQs = [...hqs];
    this.currentLandmarks = [...landmarks];
    this.exclusionSet.clear();

    // Exclude HQs: HQ models have ~20 tiles diameter (radius 10). Use 12x12 buffer to fully clear the school grounds
    for (const hq of hqs) {
      const bounds = expandRect(getHQRect(hq.x, hq.y));
      for (let x = bounds.minX; x <= bounds.maxX; x++) {
        for (let y = bounds.minY; y <= bounds.maxY; y++) {
          this.exclusionSet.add(`${x},${y}`);
        }
      }
    }

    // Exclude Landmarks (footprint + 2 margin)
    for (const lm of landmarks) {
      const bounds = expandRect(getLandmarkRect(lm.x, lm.y, lm.width, lm.height));
      for (let x = bounds.minX; x <= bounds.maxX; x++) {
        for (let y = bounds.minY; y <= bounds.maxY; y++) {
          this.exclusionSet.add(`${x},${y}`);
        }
      }
    }

    // Rebuild props with new exclusion boundaries
    this.buildProps();
  }

  public buildProps() {
    if (this.isBuilt) {
      if (this.oakMesh) this.oakMesh.geometry.dispose();
      if (this.birchMesh) this.birchMesh.geometry.dispose();
      if (this.grassMesh) this.grassMesh.geometry.dispose();
      if (this.flowerMesh) this.flowerMesh.geometry.dispose();
      this.group.clear();
    }

    // MeshLambertMaterial with vertex colors to receive and cast natural sunlight
    const material = new THREE.MeshLambertMaterial({
      vertexColors: true
    });
    this.natureMaterial = material;
    if (this.fogOfWar) {
      applyFogOfWar(material, this.fogOfWar);
    }

    const geomOak = createOakTreeGeometry();
    const geomBirch = createBirchTreeGeometry();
    const geomGrass = createGrassTuftGeometry();
    const geomFlower = createFlowerGeometry();

    const oakMatrices: THREE.Matrix4[] = [];
    const birchMatrices: THREE.Matrix4[] = [];
    const grassMatrices: THREE.Matrix4[] = [];
    const flowerMatrices: THREE.Matrix4[] = [];

    const dummy = new THREE.Object3D();

    // Detect mobile environment
    const isMobile = typeof window !== "undefined" && (
      window.innerWidth <= 768 ||
      /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
    );

    // Pseudo-random deterministic PRNG
    const pseudoRandom = (x: number, y: number, seed: number) => {
      const n = Math.sin(x * 12.9898 + y * 78.233 + seed) * 43758.5453;
      return n - Math.floor(n);
    };

    // Step through the 1000x1000 map:
    // Step = 4 on mobile (cuts 43% props), step = 3 on desktop
    const sampleStep = isMobile ? 4 : 3;

    for (let x = 6; x < 994; x += sampleStep) {
      for (let y = 6; y < 994; y += sampleStep) {
        // Jitter within cell
        const jx = x + Math.floor(pseudoRandom(x, y, 1.1) * sampleStep);
        const jy = y + Math.floor(pseudoRandom(x, y, 2.2) * sampleStep);

        if (this.isExcluded(jx, jy)) continue;
        if (isRoad(jx, jy)) continue;
        if (isHoDaLake(jx, jy)) continue;

        const h = getTerrainHeight(jx, jy);
        if (h < 0) continue;

        const m = getTerrainMoisture(jx, jy);
        const roll = pseudoRandom(jx, jy, 3.3);

        // Ground anchor height: terrain tile top is at h + 0.1
        const groundH = h + 0.1;
        dummy.rotation.set(0, pseudoRandom(jx, jy, 4.4) * Math.PI * 2, 0);

        if (h > 0.15) {
          // Hills & Highlands
          if (roll < 0.07) {
            // Hill Oak Tree
            const scale = 0.85 + pseudoRandom(jx, jy, 5.5) * 0.4;
            dummy.scale.set(scale, scale, scale);
            dummy.position.set(jx, groundH, jy);
            dummy.updateMatrix();
            oakMatrices.push(dummy.matrix.clone());
          } else if (roll < 0.11) {
            // Hill Birch Tree
            const scale = 0.85 + pseudoRandom(jx, jy, 6.6) * 0.35;
            dummy.scale.set(scale, scale, scale);
            dummy.position.set(jx, groundH, jy);
            dummy.updateMatrix();
            birchMatrices.push(dummy.matrix.clone());
          } else if (roll < 0.22 && !isMobile) {
            // Hill Grass Tuft
            const scale = 0.75 + pseudoRandom(jx, jy, 7.7) * 0.5;
            dummy.scale.set(scale, scale, scale);
            dummy.position.set(jx, groundH, jy);
            dummy.updateMatrix();
            grassMatrices.push(dummy.matrix.clone());
          }
        } else {
          // Plains & Lowlands
          if (m > 0.62) {
            // High moisture: Birch grove & Wildflowers
            if (roll < 0.11) {
              // Birch Tree
              const scale = 0.9 + pseudoRandom(jx, jy, 8.8) * 0.35;
              dummy.scale.set(scale, scale, scale);
              dummy.position.set(jx, groundH, jy);
              dummy.updateMatrix();
              birchMatrices.push(dummy.matrix.clone());
            } else if (roll < 0.17) {
              // Wild Flower
              const scale = 0.8 + pseudoRandom(jx, jy, 9.9) * 0.4;
              dummy.scale.set(scale, scale, scale);
              dummy.position.set(jx, groundH, jy);
              dummy.updateMatrix();
              flowerMatrices.push(dummy.matrix.clone());
            } else if (roll < 0.28 && !isMobile) {
              // Lush Grass Tuft
              const scale = 0.8 + pseudoRandom(jx, jy, 10.1) * 0.45;
              dummy.scale.set(scale, scale, scale);
              dummy.position.set(jx, groundH, jy);
              dummy.updateMatrix();
              grassMatrices.push(dummy.matrix.clone());
            }
          } else if (m > 0.35) {
            // Moderate moisture: Oak Forest & Grass
            if (roll < 0.10) {
              // Oak Tree
              const scale = 0.85 + pseudoRandom(jx, jy, 11.2) * 0.45;
              dummy.scale.set(scale, scale, scale);
              dummy.position.set(jx, groundH, jy);
              dummy.updateMatrix();
              oakMatrices.push(dummy.matrix.clone());
            } else if (roll < 0.13) {
              // Sparse Birch Tree
              const scale = 0.85 + pseudoRandom(jx, jy, 12.3) * 0.35;
              dummy.scale.set(scale, scale, scale);
              dummy.position.set(jx, groundH, jy);
              dummy.updateMatrix();
              birchMatrices.push(dummy.matrix.clone());
            } else if (roll < 0.16) {
              // Meadow Flower
              const scale = 0.75 + pseudoRandom(jx, jy, 13.4) * 0.35;
              dummy.scale.set(scale, scale, scale);
              dummy.position.set(jx, groundH, jy);
              dummy.updateMatrix();
              flowerMatrices.push(dummy.matrix.clone());
            } else if (roll < 0.26 && !isMobile) {
              // Grass Tuft
              const scale = 0.75 + pseudoRandom(jx, jy, 14.5) * 0.4;
              dummy.scale.set(scale, scale, scale);
              dummy.position.set(jx, groundH, jy);
              dummy.updateMatrix();
              grassMatrices.push(dummy.matrix.clone());
            }
          } else {
            // Drier plains
            if (roll < 0.05) {
              // Sparse Oak Tree
              const scale = 0.75 + pseudoRandom(jx, jy, 15.6) * 0.35;
              dummy.scale.set(scale, scale, scale);
              dummy.position.set(jx, groundH, jy);
              dummy.updateMatrix();
              oakMatrices.push(dummy.matrix.clone());
            } else if (roll < 0.14 && !isMobile) {
              // Dry Grass Tuft
              const scale = 0.65 + pseudoRandom(jx, jy, 16.7) * 0.35;
              dummy.scale.set(scale, scale, scale);
              dummy.position.set(jx, groundH, jy);
              dummy.updateMatrix();
              grassMatrices.push(dummy.matrix.clone());
            }
          }
        }
      }
    }

    this.oakMesh = new THREE.InstancedMesh(geomOak, material, oakMatrices.length);
    this.oakMesh.castShadow = true;
    this.oakMesh.receiveShadow = true;
    oakMatrices.forEach((m, idx) => this.oakMesh.setMatrixAt(idx, m));
    this.oakMesh.instanceMatrix.needsUpdate = true;
    this.group.add(this.oakMesh);

    this.birchMesh = new THREE.InstancedMesh(geomBirch, material, birchMatrices.length);
    this.birchMesh.castShadow = true;
    this.birchMesh.receiveShadow = true;
    birchMatrices.forEach((m, idx) => this.birchMesh.setMatrixAt(idx, m));
    this.birchMesh.instanceMatrix.needsUpdate = true;
    this.group.add(this.birchMesh);

    if (grassMatrices.length > 0) {
      this.grassMesh = new THREE.InstancedMesh(geomGrass, material, grassMatrices.length);
      this.grassMesh.castShadow = false;
      this.grassMesh.receiveShadow = true;
      grassMatrices.forEach((m, idx) => this.grassMesh.setMatrixAt(idx, m));
      this.grassMesh.instanceMatrix.needsUpdate = true;
      this.group.add(this.grassMesh);
    }

    if (flowerMatrices.length > 0) {
      this.flowerMesh = new THREE.InstancedMesh(geomFlower, material, flowerMatrices.length);
      this.flowerMesh.castShadow = false;
      this.flowerMesh.receiveShadow = true;
      flowerMatrices.forEach((m, idx) => this.flowerMesh.setMatrixAt(idx, m));
      this.flowerMesh.instanceMatrix.needsUpdate = true;
      this.group.add(this.flowerMesh);
    }

    this.isBuilt = true;
    console.log(
      `[NatureGridManager] Spawned ${oakMatrices.length} OakTrees, ${birchMatrices.length} BirchTrees, ${grassMatrices.length} GrassTufts, ${flowerMatrices.length} Flowers (isMobile: ${isMobile}).`
    );
  }

  public setShadowCasting(castShadow: boolean): void {
    if (this.oakMesh) this.oakMesh.castShadow = castShadow;
    if (this.birchMesh) this.birchMesh.castShadow = castShadow;
    if (this.grassMesh) this.grassMesh.castShadow = castShadow;
    if (this.flowerMesh) this.flowerMesh.castShadow = castShadow;
  }
}
