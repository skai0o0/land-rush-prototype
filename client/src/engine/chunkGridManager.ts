import * as THREE from "three";
import { getTerrainColor, getTerrainHeight } from "./terrainNoise";

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

export class ChunkGridManager {
  public group: THREE.Group = new THREE.Group();
  private chunks: Map<string, ChunkData> = new Map();
  private tempColor = new THREE.Color();
  private tempMatrix = new THREE.Matrix4();
  private tempPosition = new THREE.Vector3();
  private tempScale = new THREE.Vector3(1, 1, 1);
  private tempRotation = new THREE.Quaternion();

  private tileGeometry: THREE.BoxGeometry;
  private tileMaterial: THREE.MeshLambertMaterial;

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
  }

  public setTileColor(x: number, y: number, colorHex: string | number) {
    if (x < 0 || x >= MAP_SIZE || y < 0 || y >= MAP_SIZE) return;

    const cx = Math.floor(x / CHUNK_SIZE);
    const cy = Math.floor(y / CHUNK_SIZE);
    const chunk = this.chunks.get(`${cx},${cy}`);
    if (!chunk) return;

    const lx = x % CHUNK_SIZE;
    const ly = y % CHUNK_SIZE;
    const instanceIdx = ly * CHUNK_SIZE + lx;

    if (typeof colorHex === "string") {
      this.tempColor.set(colorHex);
    } else {
      this.tempColor.setHex(colorHex);
    }

    chunk.mesh.setColorAt(instanceIdx, this.tempColor);
    if (chunk.mesh.instanceColor) {
      chunk.mesh.instanceColor.needsUpdate = true;
    }
  }

  public setTileElevation(x: number, y: number, extraElevation: number) {
    if (x < 0 || x >= MAP_SIZE || y < 0 || y >= MAP_SIZE) return;

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
