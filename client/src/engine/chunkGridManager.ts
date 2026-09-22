import * as THREE from "three";
import { getTerrainColor, getTerrainHeight, isInsideLeveledZone } from "./terrainNoise";

export const MAP_SIZE = 1000;
export const CHUNK_SIZE = 50;
export const CHUNKS_PER_AXIS = MAP_SIZE / CHUNK_SIZE; // 20

interface ChunkData {
  cx: number;
  cy: number;
  mesh: THREE.InstancedMesh;
  dirtyColor: boolean;
  dirtyMatrix: boolean;
}

interface TileFlipAnimation {
  x: number;
  y: number;
  cx: number;
  cy: number;
  instanceIdx: number;
  fromColor: THREE.Color;
  toColor: THREE.Color;
  baseY: number;
  currentElevation: number;
  startTime: number;
  duration: number;
}

export class ChunkGridManager {
  public group: THREE.Group = new THREE.Group();
  private chunks: Map<string, ChunkData> = new Map();
  private activeTileAnimations: Map<string, TileFlipAnimation> = new Map();
  private tempColor = new THREE.Color();
  private tempMatrix = new THREE.Matrix4();
  private tempPosition = new THREE.Vector3();
  private tempScale = new THREE.Vector3(1, 1, 1);
  private tempRotation = new THREE.Quaternion();
  private dummyObj = new THREE.Object3D();

  private tileGeometry: THREE.BoxGeometry;
  private tileMaterial: THREE.MeshLambertMaterial;

  // Chunk culling state
  private lastCamCX = -999;
  private lastCamCY = -999;
  private lastRadius = -999;
  public visibleChunksCount = 0;

  constructor() {
    this.group.name = "ChunkGridManagerGroup";

    // Chunky voxel tile: 0.98 x 0.2 x 0.98 with subtle border gaps
    this.tileGeometry = new THREE.BoxGeometry(0.96, 0.2, 0.96);
    this.tileMaterial = new THREE.MeshLambertMaterial();

    this.initChunks();
  }

  private initChunks() {
    const dummy = new THREE.Object3D();
    const countPerChunk = CHUNK_SIZE * CHUNK_SIZE;

    for (let cx = 0; cx < CHUNKS_PER_AXIS; cx++) {
      for (let cy = 0; cy < CHUNKS_PER_AXIS; cy++) {
        const mesh = new THREE.InstancedMesh(this.tileGeometry, this.tileMaterial, countPerChunk);
        mesh.castShadow = false;
        mesh.receiveShadow = true;
        mesh.userData = { isTerrainChunk: true, cx, cy };

        let idx = 0;
        for (let ly = 0; ly < CHUNK_SIZE; ly++) {
          for (let lx = 0; lx < CHUNK_SIZE; lx++) {
            const wx = cx * CHUNK_SIZE + lx;
            const wy = cy * CHUNK_SIZE + ly;

            const baseHeight = getTerrainHeight(wx, wy);
            const naturalColorHex = getTerrainColor(wx, wy);

            // Center tile in world coordinates
            dummy.position.set(wx, baseHeight, wy);
            dummy.scale.set(1, 1, 1);
            dummy.rotation.set(0, 0, 0);
            dummy.updateMatrix();

            mesh.setMatrixAt(idx, dummy.matrix);
            this.tempColor.setHex(naturalColorHex);
            mesh.setColorAt(idx, this.tempColor);

            idx++;
          }
        }

        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) {
          mesh.instanceColor.needsUpdate = true;
        }

        // Accurate bounding box & sphere so Three.js handles culling properly
        mesh.computeBoundingBox();
        mesh.computeBoundingSphere();

        const chunkKey = `${cx},${cy}`;
        this.chunks.set(chunkKey, {
          cx,
          cy,
          mesh,
          dirtyColor: false,
          dirtyMatrix: false
        });

        this.group.add(mesh);
      }
    }

    // Initial culling from campus center (500, 500)
    this.updateVisibleChunks(500, 500, 0.72);
  }

  /**
   * Dynamic chunk culling based on camera target (camX, camZ) and zoom level.
   * Only ~9 to 16 chunks are visible at a time (~25,000 - 40,000 tiles),
   * hiding the remaining 384+ chunks (960,000 tiles) to cut 96% of GPU geometry workload.
   */
  public updateVisibleChunks(camX: number, camZ: number, zoomLevel: number, forceRadius?: number): void {
    const centerCX = Math.floor(camX / CHUNK_SIZE);
    const centerCY = Math.floor(camZ / CHUNK_SIZE);

    // Zoom level determines frustum span. Normal zoom is ~0.72.
    // Span at 0.72 is ~70 tiles (~1.4 chunks) -> radius 2 chunks (5x5 grid = 25 chunks max).
    // When zoomed way out (1.4+), span expands up to 4 chunks radius.
    const radius = forceRadius ?? Math.min(4, Math.max(2, Math.ceil((75 * zoomLevel) / CHUNK_SIZE) + 1));

    if (centerCX === this.lastCamCX && centerCY === this.lastCamCY && radius === this.lastRadius) {
      return;
    }
    this.lastCamCX = centerCX;
    this.lastCamCY = centerCY;
    this.lastRadius = radius;

    const minCX = Math.max(0, centerCX - radius);
    const maxCX = Math.min(CHUNKS_PER_AXIS - 1, centerCX + radius);
    const minCY = Math.max(0, centerCY - radius);
    const maxCY = Math.min(CHUNKS_PER_AXIS - 1, centerCY + radius);

    let count = 0;
    this.chunks.forEach((chunk) => {
      const isVisible =
        chunk.cx >= minCX &&
        chunk.cx <= maxCX &&
        chunk.cy >= minCY &&
        chunk.cy <= maxCY;

      if (chunk.mesh.visible !== isVisible) {
        chunk.mesh.visible = isVisible;
      }
      if (isVisible) count++;
    });
    this.visibleChunksCount = count;
  }

  public getChunk(cx: number, cy: number): ChunkData | undefined {
    return this.chunks.get(`${cx},${cy}`);
  }

  public getChunkForWorldCoord(wx: number, wy: number): ChunkData | undefined {
    const cx = Math.floor(wx / CHUNK_SIZE);
    const cy = Math.floor(wy / CHUNK_SIZE);
    return this.chunks.get(`${cx},${cy}`);
  }

  /**
   * Fast candidate mesh lookup for raycasting.
   * Instead of testing all 400 chunks and 1,000,000 instances, returns only
   * the 1 chunk (or 2-3 adjacent chunks if near a boundary) containing (wx, wy).
   */
  public getCandidateMeshesForRaycast(wx: number, wy: number): THREE.InstancedMesh[] {
    const cx = Math.floor(wx / CHUNK_SIZE);
    const cy = Math.floor(wy / CHUNK_SIZE);
    const meshes: THREE.InstancedMesh[] = [];

    const primary = this.chunks.get(`${cx},${cy}`);
    if (primary) meshes.push(primary.mesh);

    // If close to chunk boundaries (within 4 tiles), include neighbors to prevent border misses
    const lx = wx % CHUNK_SIZE;
    const ly = wy % CHUNK_SIZE;
    if (lx < 4 && cx > 0) {
      const left = this.chunks.get(`${cx - 1},${cy}`);
      if (left) meshes.push(left.mesh);
    } else if (lx > CHUNK_SIZE - 4 && cx < CHUNKS_PER_AXIS - 1) {
      const right = this.chunks.get(`${cx + 1},${cy}`);
      if (right) meshes.push(right.mesh);
    }
    if (ly < 4 && cy > 0) {
      const up = this.chunks.get(`${cx},${cy - 1}`);
      if (up) meshes.push(up.mesh);
    } else if (ly > CHUNK_SIZE - 4 && cy < CHUNKS_PER_AXIS - 1) {
      const down = this.chunks.get(`${cx},${cy + 1}`);
      if (down) meshes.push(down.mesh);
    }

    return meshes;
  }

  public setTileColor(x: number, y: number, colorHex: string | number, animate = false) {
    if (x < 0 || x >= MAP_SIZE || y < 0 || y >= MAP_SIZE) return;

    const cx = Math.floor(x / CHUNK_SIZE);
    const cy = Math.floor(y / CHUNK_SIZE);
    const chunk = this.chunks.get(`${cx},${cy}`);
    if (!chunk) return;

    const lx = x % CHUNK_SIZE;
    const ly = y % CHUNK_SIZE;
    const instanceIdx = ly * CHUNK_SIZE + lx;

    const targetColor = new THREE.Color();
    if (typeof colorHex === "string") {
      targetColor.set(colorHex);
    } else {
      targetColor.setHex(colorHex);
    }

    const animKey = `${x},${y}`;

    // Guard 1: If tile is already actively animating towards this exact color, ignore duplicate call
    const existingAnim = this.activeTileAnimations.get(animKey);
    if (existingAnim && existingAnim.toColor.getHex() === targetColor.getHex()) {
      return;
    }

    if (animate) {
      const fromColor = new THREE.Color();
      chunk.mesh.getColorAt(instanceIdx, fromColor);

      // Guard 2: If tile is already at target color and not mid-animation, no need to flip again
      if (!existingAnim && fromColor.getHex() === targetColor.getHex()) {
        return;
      }

      // Decompose current matrix to extract elevation and base height
      const baseHeight = getTerrainHeight(x, y);
      chunk.mesh.getMatrixAt(instanceIdx, this.tempMatrix);
      this.tempMatrix.decompose(this.tempPosition, this.tempRotation, this.tempScale);
      const currentElevation = this.tempPosition.y - baseHeight;

      this.activeTileAnimations.set(animKey, {
        x,
        y,
        cx,
        cy,
        instanceIdx,
        fromColor,
        toColor: targetColor,
        baseY: baseHeight,
        currentElevation,
        startTime: performance.now(),
        duration: 420
      });
      return;
    }

    chunk.mesh.setColorAt(instanceIdx, targetColor);
    if (chunk.mesh.instanceColor) {
      chunk.mesh.instanceColor.needsUpdate = true;
    }
  }

  public update(_delta: number, now: number) {
    if (this.activeTileAnimations.size === 0) return;

    const affectedChunks = new Set<ChunkData>();
    const finishedKeys: string[] = [];

    this.activeTileAnimations.forEach((anim, key) => {
      const chunk = this.chunks.get(`${anim.cx},${anim.cy}`);
      if (!chunk) {
        finishedKeys.push(key);
        return;
      }

      const elapsed = now - anim.startTime;
      const progress = Math.min(1.0, elapsed / anim.duration);

      // Eased progress for smooth flip
      const ease = 1 - Math.pow(1 - progress, 3); // easeOutCubic

      if (progress >= 1.0) {
        // Finalize state
        chunk.mesh.setColorAt(anim.instanceIdx, anim.toColor);
        this.dummyObj.position.set(anim.x, anim.baseY + anim.currentElevation, anim.y);
        this.dummyObj.rotation.set(0, 0, 0);
        this.dummyObj.scale.set(1, 1, 1);
        this.dummyObj.updateMatrix();
        chunk.mesh.setMatrixAt(anim.instanceIdx, this.dummyObj.matrix);

        finishedKeys.push(key);
        affectedChunks.add(chunk);
      } else {
        // Color transition lerp
        this.tempColor.copy(anim.fromColor).lerp(anim.toColor, progress);
        chunk.mesh.setColorAt(anim.instanceIdx, this.tempColor);

        // Jump height: smooth arc
        const jumpHeight = Math.sin(Math.PI * progress) * 0.75;
        // 360-degree flip around X axis
        const flipRot = Math.PI * 2 * ease;
        // Subtle pop scale
        const popScale = 1.0 + 0.12 * Math.sin(Math.PI * progress);

        this.dummyObj.position.set(anim.x, anim.baseY + anim.currentElevation + jumpHeight, anim.y);
        this.dummyObj.rotation.set(flipRot, 0, 0);
        this.dummyObj.scale.set(popScale, popScale, popScale);
        this.dummyObj.updateMatrix();
        chunk.mesh.setMatrixAt(anim.instanceIdx, this.dummyObj.matrix);

        affectedChunks.add(chunk);
      }
    });

    for (const key of finishedKeys) {
      this.activeTileAnimations.delete(key);
    }

    for (const chunk of affectedChunks) {
      chunk.mesh.instanceMatrix.needsUpdate = true;
      if (chunk.mesh.instanceColor) {
        chunk.mesh.instanceColor.needsUpdate = true;
      }
    }
  }

  public flattenArea(minX: number, maxX: number, minY: number, maxY: number, targetHeight: number) {
    const affectedChunks = new Set<string>();

    for (let x = minX; x <= maxX; x++) {
      if (x < 0 || x >= MAP_SIZE) continue;
      for (let y = minY; y <= maxY; y++) {
        if (y < 0 || y >= MAP_SIZE) continue;

        const cx = Math.floor(x / CHUNK_SIZE);
        const cy = Math.floor(y / CHUNK_SIZE);
        const chunkKey = `${cx},${cy}`;
        const chunk = this.chunks.get(chunkKey);
        if (!chunk) continue;

        const lx = x % CHUNK_SIZE;
        const ly = y % CHUNK_SIZE;
        const instanceIdx = ly * CHUNK_SIZE + lx;

        chunk.mesh.getMatrixAt(instanceIdx, this.tempMatrix);
        this.tempMatrix.decompose(this.tempPosition, this.tempRotation, this.tempScale);

        this.tempPosition.y = targetHeight;
        this.tempMatrix.compose(this.tempPosition, this.tempRotation, this.tempScale);

        chunk.mesh.setMatrixAt(instanceIdx, this.tempMatrix);
        affectedChunks.add(chunkKey);
      }
    }

    for (const chunkKey of affectedChunks) {
      const chunk = this.chunks.get(chunkKey);
      if (chunk) {
        chunk.mesh.instanceMatrix.needsUpdate = true;
      }
    }
  }

  public setTileElevation(x: number, y: number, extraElevation: number) {
    if (x < 0 || x >= MAP_SIZE || y < 0 || y >= MAP_SIZE) return;

    // Do not elevate tiles within building leveled zones to prevent clipping through floor/steps
    if (isInsideLeveledZone(x, y)) return;

    const cx = Math.floor(x / CHUNK_SIZE);
    const cy = Math.floor(y / CHUNK_SIZE);
    const chunk = this.chunks.get(`${cx},${cy}`);
    if (!chunk) return;

    const lx = x % CHUNK_SIZE;
    const ly = y % CHUNK_SIZE;
    const instanceIdx = ly * CHUNK_SIZE + lx;

    const baseHeight = getTerrainHeight(x, y);
    chunk.mesh.getMatrixAt(instanceIdx, this.tempMatrix);
    this.tempMatrix.decompose(this.tempPosition, this.tempRotation, this.tempScale);

    this.tempPosition.y = baseHeight + extraElevation;
    this.tempMatrix.compose(this.tempPosition, this.tempRotation, this.tempScale);

    chunk.mesh.setMatrixAt(instanceIdx, this.tempMatrix);
    chunk.mesh.instanceMatrix.needsUpdate = true;
  }

  public resetTerrainColor(x: number, y: number) {
    if (x < 0 || x >= MAP_SIZE || y < 0 || y >= MAP_SIZE) return;

    const cx = Math.floor(x / CHUNK_SIZE);
    const cy = Math.floor(y / CHUNK_SIZE);
    const chunk = this.chunks.get(`${cx},${cy}`);
    if (!chunk) return;

    const lx = x % CHUNK_SIZE;
    const ly = y % CHUNK_SIZE;
    const instanceIdx = ly * CHUNK_SIZE + lx;

    const naturalColorHex = getTerrainColor(x, y);
    this.tempColor.setHex(naturalColorHex);
    chunk.mesh.setColorAt(instanceIdx, this.tempColor);
    if (chunk.mesh.instanceColor) {
      chunk.mesh.instanceColor.needsUpdate = true;
    }

    // Reset height
    const baseHeight = getTerrainHeight(x, y);
    chunk.mesh.getMatrixAt(instanceIdx, this.tempMatrix);
    this.tempMatrix.decompose(this.tempPosition, this.tempRotation, this.tempScale);
    this.tempPosition.y = baseHeight;
    this.tempMatrix.compose(this.tempPosition, this.tempRotation, this.tempScale);
    chunk.mesh.setMatrixAt(instanceIdx, this.tempMatrix);
    chunk.mesh.instanceMatrix.needsUpdate = true;
  }

  // Convert chunk index & instanceId to tile world coordinate
  public getTileCoords(mesh: THREE.InstancedMesh, instanceId: number): { x: number; y: number } | null {
    if (!mesh.userData.isTerrainChunk) return null;
    const cx = mesh.userData.cx;
    const cy = mesh.userData.cy;
    const lx = instanceId % CHUNK_SIZE;
    const ly = Math.floor(instanceId / CHUNK_SIZE);
    return {
      x: cx * CHUNK_SIZE + lx,
      y: cy * CHUNK_SIZE + ly
    };
  }
}
