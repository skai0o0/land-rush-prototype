import * as THREE from "three";
import {
  createMelaleucaGeometry,
  createPoincianaGeometry,
  createGraniteGeometry,
  createWildGrassGeometry
} from "./natureProps";
import {
  getTerrainHeight,
  getTerrainMoisture,
  isRoad,
  isHoDaLake
} from "./terrainNoise";

export class NatureGridManager {
  public group: THREE.Group = new THREE.Group();

  private melaleucaMesh!: THREE.InstancedMesh;
  private poincianaMesh!: THREE.InstancedMesh;
  private graniteMesh!: THREE.InstancedMesh;
  private grassMesh!: THREE.InstancedMesh;

  private isBuilt = false;

  // Set of exclusion coordinate keys: "x,y"
  private exclusionSet: Set<string> = new Set();
  private currentHQs: { x: number; y: number }[] = [];
  private currentLandmarks: { x: number; y: number; width: number; height: number }[] = [];

  constructor() {
    this.group.name = "NaturePropsGroup";
  }

  public isExcluded(x: number, y: number): boolean {
    if (this.exclusionSet.has(`${x},${y}`)) return true;
    for (let i = 0; i < this.currentHQs.length; i++) {
      const hq = this.currentHQs[i];
      if (Math.abs(x - hq.x) <= 12 && Math.abs(y - hq.y) <= 12) return true;
    }
    for (let i = 0; i < this.currentLandmarks.length; i++) {
      const lm = this.currentLandmarks[i];
      if (x >= lm.x - 2 && x <= lm.x + lm.width + 2 && y >= lm.y - 2 && y <= lm.y + lm.height + 2) {
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
      for (let dx = -12; dx <= 12; dx++) {
        for (let dy = -12; dy <= 12; dy++) {
          this.exclusionSet.add(`${hq.x + dx},${hq.y + dy}`);
        }
      }
    }

    // Exclude Landmarks (footprint + 2 margin)
    for (const lm of landmarks) {
      for (let dx = -2; dx <= lm.width + 2; dx++) {
        for (let dy = -2; dy <= lm.height + 2; dy++) {
          this.exclusionSet.add(`${lm.x + dx},${lm.y + dy}`);
        }
      }
    }

    // Rebuild props with new exclusion boundaries
    this.buildProps();
  }

  public buildProps() {
    if (this.isBuilt) {
      if (this.melaleucaMesh) this.melaleucaMesh.geometry.dispose();
      if (this.poincianaMesh) this.poincianaMesh.geometry.dispose();
      if (this.graniteMesh) this.graniteMesh.geometry.dispose();
      if (this.grassMesh) this.grassMesh.geometry.dispose();
      this.group.clear();
    }

    const material = new THREE.MeshLambertMaterial({
      vertexColors: true
    });

    const geomMelaleuca = createMelaleucaGeometry();
    const geomPoinciana = createPoincianaGeometry();
    const geomGranite = createGraniteGeometry();
    const geomGrass = createWildGrassGeometry();

    // Collect transform matrices for each category
    const melaleucaMatrices: THREE.Matrix4[] = [];
    const poincianaMatrices: THREE.Matrix4[] = [];
    const graniteMatrices: THREE.Matrix4[] = [];
    const grassMatrices: THREE.Matrix4[] = [];

    const dummy = new THREE.Object3D();

    // Pseudo-random deterministic PRNG
    const pseudoRandom = (x: number, y: number, seed: number) => {
      const n = Math.sin(x * 12.9898 + y * 78.233 + seed) * 43758.5453;
      return n - Math.floor(n);
    };

    // Step through the 1000x1000 map in increments of 3 tiles to sample natural distribution
    for (let x = 6; x < 994; x += 3) {
      for (let y = 6; y < 994; y += 3) {
        // Jitter within cell
        const jx = x + Math.floor(pseudoRandom(x, y, 1.1) * 3);
        const jy = y + Math.floor(pseudoRandom(x, y, 2.2) * 3);

        if (this.isExcluded(jx, jy)) continue;
        if (isRoad(jx, jy)) continue;
        if (isHoDaLake(jx, jy)) continue;

        const h = getTerrainHeight(jx, jy);
        if (h < 0) continue; // Skip water basins

        const m = getTerrainMoisture(jx, jy);
        const roll = pseudoRandom(jx, jy, 3.3);

        dummy.rotation.set(0, pseudoRandom(jx, jy, 4.4) * Math.PI * 2, 0);

        if (h > 0.15) {
          // Hills: granite rocks and scattered dry grass
          if (roll < 0.28) {
            const scale = 0.7 + pseudoRandom(jx, jy, 5.5) * 0.6;
            dummy.scale.set(scale, scale, scale);
            dummy.position.set(jx, h, jy);
            dummy.updateMatrix();
            graniteMatrices.push(dummy.matrix.clone());
          } else if (roll < 0.45) {
            const scale = 0.8 + pseudoRandom(jx, jy, 6.6) * 0.4;
            dummy.scale.set(scale, scale, scale);
            dummy.position.set(jx, h, jy);
            dummy.updateMatrix();
            grassMatrices.push(dummy.matrix.clone());
          }
        } else {
          // Plains & woodlands: trees and grass based on moisture
          if (m > 0.65) {
            // High moisture: Royal Poinciana forest (phượng vĩ)
            if (roll < 0.35) {
              const scale = 0.85 + pseudoRandom(jx, jy, 7.7) * 0.4;
              dummy.scale.set(scale, scale, scale);
              dummy.position.set(jx, h, jy);
              dummy.updateMatrix();
              poincianaMatrices.push(dummy.matrix.clone());
            } else if (roll < 0.6) {
              const scale = 0.8 + pseudoRandom(jx, jy, 8.8) * 0.5;
              dummy.scale.set(scale, scale, scale);
              dummy.position.set(jx, h, jy);
              dummy.updateMatrix();
              grassMatrices.push(dummy.matrix.clone());
            }
          } else if (m > 0.38) {
            // Moderate moisture: Melaleuca groves (tràm)
            if (roll < 0.32) {
              const scale = 0.85 + pseudoRandom(jx, jy, 9.9) * 0.45;
              dummy.scale.set(scale, scale, scale);
              dummy.position.set(jx, h, jy);
              dummy.updateMatrix();
              melaleucaMatrices.push(dummy.matrix.clone());
            } else if (roll < 0.5) {
              const scale = 0.7 + pseudoRandom(jx, jy, 10.1) * 0.5;
              dummy.scale.set(scale, scale, scale);
              dummy.position.set(jx, h, jy);
              dummy.updateMatrix();
              grassMatrices.push(dummy.matrix.clone());
            }
          } else {
            // Dry ground: sparse grass and occasional rocks
            if (roll < 0.25) {
              const scale = 0.6 + pseudoRandom(jx, jy, 11.2) * 0.4;
              dummy.scale.set(scale, scale, scale);
              dummy.position.set(jx, h, jy);
              dummy.updateMatrix();
              grassMatrices.push(dummy.matrix.clone());
            } else if (roll < 0.32) {
              const scale = 0.6 + pseudoRandom(jx, jy, 12.3) * 0.5;
              dummy.scale.set(scale, scale, scale);
              dummy.position.set(jx, h, jy);
              dummy.updateMatrix();
              graniteMatrices.push(dummy.matrix.clone());
            }
          }
        }
      }
    }

    // Instantiate InstancedMeshes
    this.melaleucaMesh = new THREE.InstancedMesh(geomMelaleuca, material, melaleucaMatrices.length);
    this.melaleucaMesh.castShadow = true;
    this.melaleucaMesh.receiveShadow = true;
    melaleucaMatrices.forEach((m, idx) => this.melaleucaMesh.setMatrixAt(idx, m));
    this.melaleucaMesh.instanceMatrix.needsUpdate = true;
    this.group.add(this.melaleucaMesh);

    this.poincianaMesh = new THREE.InstancedMesh(geomPoinciana, material, poincianaMatrices.length);
    this.poincianaMesh.castShadow = true;
    this.poincianaMesh.receiveShadow = true;
    poincianaMatrices.forEach((m, idx) => this.poincianaMesh.setMatrixAt(idx, m));
    this.poincianaMesh.instanceMatrix.needsUpdate = true;
    this.group.add(this.poincianaMesh);

    this.graniteMesh = new THREE.InstancedMesh(geomGranite, material, graniteMatrices.length);
    this.graniteMesh.castShadow = true;
    this.graniteMesh.receiveShadow = true;
    graniteMatrices.forEach((m, idx) => this.graniteMesh.setMatrixAt(idx, m));
    this.graniteMesh.instanceMatrix.needsUpdate = true;
    this.group.add(this.graniteMesh);

    this.grassMesh = new THREE.InstancedMesh(geomGrass, material, grassMatrices.length);
    this.grassMesh.castShadow = false;
    this.grassMesh.receiveShadow = true;
    grassMatrices.forEach((m, idx) => this.grassMesh.setMatrixAt(idx, m));
    this.grassMesh.instanceMatrix.needsUpdate = true;
    this.group.add(this.grassMesh);

    this.isBuilt = true;
    console.log(
      `[NatureGridManager] Spawned ${melaleucaMatrices.length} Melaleuca, ${poincianaMatrices.length} Poinciana, ${graniteMatrices.length} Granite, ${grassMatrices.length} Grass.`
    );
  }
}
