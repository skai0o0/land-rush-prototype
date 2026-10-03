import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { getSchoolColor } from '../../../shared/constants/schools';
import { getTerrainHeight } from './terrainNoise';
import { applyFogOfWar } from './fogOfWarShader';
import type { FogOfWarManager } from './fogOfWarManager';

export interface BorderTileData {
  index: number;
  borders: string[];
}

interface FlagInstance {
  x: number;
  y: number;
  schoolId: string;
  borderType: string;
  color: THREE.Color;
}

export class BorderFlagManager {
  public group = new THREE.Group();
  private instancedMesh?: THREE.InstancedMesh;
  private flagMaterial?: THREE.MeshStandardMaterial;
  private fogOfWar: FogOfWarManager | null = null;
  private maxFlags = 20000;
  private activeFlags: FlagInstance[] = [];
  
  private megaEmblemZones: { minX: number; minY: number; maxX: number; maxY: number }[] = [];

  constructor() {
    this.group.name = 'BorderFlagsGroup';
    this.initMesh();
  }

  public setFogOfWar(fog: FogOfWarManager): void {
    this.fogOfWar = fog;
    if (this.flagMaterial) {
      applyFogOfWar(this.flagMaterial, fog);
      this.flagMaterial.needsUpdate = true;
    }
  }

  private initMesh() {
    // 1. Sleek dark carbon metallic pole
    const poleGeo = new THREE.CylinderGeometry(0.05, 0.05, 1.55, 6).toNonIndexed();
    poleGeo.translate(0, 0.775, 0); // Base at 0
    poleGeo.deleteAttribute('uv');
    
    // Dark carbon metallic color [0.12, 0.15, 0.20]
    const poleCount = poleGeo.attributes.position.count;
    const poleColors = new Float32Array(poleCount * 3);
    for (let i = 0; i < poleCount; i++) {
      poleColors[i * 3] = 0.12;
      poleColors[i * 3 + 1] = 0.15;
      poleColors[i * 3 + 2] = 0.20;
    }
    poleGeo.setAttribute('color', new THREE.BufferAttribute(poleColors, 3));
    poleGeo.computeVertexNormals();

    // 2. Neon cyan Predator beacon finial cap
    const capGeo = new THREE.ConeGeometry(0.09, 0.2, 6).toNonIndexed();
    capGeo.translate(0, 1.62, 0);
    capGeo.deleteAttribute('uv');
    const capCount = capGeo.attributes.position.count;
    const capColors = new Float32Array(capCount * 3);
    for (let i = 0; i < capCount; i++) {
      // Neon Cyan [0.0, 1.0, 0.91]
      capColors[i * 3] = 0.0;
      capColors[i * 3 + 1] = 1.0;
      capColors[i * 3 + 2] = 0.91;
    }
    capGeo.setAttribute('color', new THREE.BufferAttribute(capColors, 3));
    capGeo.computeVertexNormals();

    // 3. Angled cyber pennant (Predator chevron shape)
    const clothGeo = new THREE.BufferGeometry();
    const clothVertices = new Float32Array([
      // Upper triangle
      0, 1.48, 0,
      0, 0.76, 0,
      0.88, 1.24, 0,
      // Lower chevron triangle
      0, 0.76, 0,
      0.68, 0.96, 0,
      0.88, 1.24, 0
    ]);
    clothGeo.setAttribute('position', new THREE.BufferAttribute(clothVertices, 3));
    clothGeo.computeVertexNormals();

    const clothCount = clothGeo.attributes.position.count;
    const clothColorsArr = new Float32Array(clothCount * 3);
    for (let i = 0; i < clothCount; i++) {
      clothColorsArr[i * 3] = 1.0;
      clothColorsArr[i * 3 + 1] = 1.0;
      clothColorsArr[i * 3 + 2] = 1.0;
    }
    clothGeo.setAttribute('color', new THREE.BufferAttribute(clothColorsArr, 3));

    let mergedGeo = mergeGeometries([poleGeo, capGeo, clothGeo]);
    if (!mergedGeo) {
      console.warn('[BorderFlagManager] mergeGeometries failed, using fallback cone geometry.');
      mergedGeo = new THREE.ConeGeometry(0.2, 0.8, 4);
    }

    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.35,
      metalness: 0.35,
      side: THREE.DoubleSide
    });
    this.flagMaterial = material;
    if (this.fogOfWar) {
      applyFogOfWar(material, this.fogOfWar);
    }

    this.instancedMesh = new THREE.InstancedMesh(mergedGeo, material, this.maxFlags);
    this.instancedMesh.count = 0;
    this.instancedMesh.castShadow = true;
    this.instancedMesh.receiveShadow = true;
    
    this.group.add(this.instancedMesh);
  }

  public addBastionFlags(schoolId: string, borderTiles: BorderTileData[]) {
    const schoolColor = new THREE.Color(getSchoolColor(schoolId));
    
    const newFlags: FlagInstance[] = [];
    for (const tile of borderTiles) {
      const x = tile.index % 1000;
      const y = Math.floor(tile.index / 1000);
      
      // Skip if inside any active Mega Emblem zone
      if (this.isInsideMegaEmblem(x, y)) continue;

      for (const border of tile.borders) {
        newFlags.push({
          x, y, schoolId, borderType: border, color: schoolColor
        });
      }
    }

    // Merge or update existing flags
    for (const flag of newFlags) {
      const existingIdx = this.activeFlags.findIndex(f => f.x === flag.x && f.y === flag.y && f.borderType === flag.borderType);
      if (existingIdx !== -1) {
        this.activeFlags[existingIdx] = flag;
      } else {
        this.activeFlags.push(flag);
      }
    }

    this.updateInstancedMesh();
  }

  public removeBorderFlags(schoolId: string) {
    this.activeFlags = this.activeFlags.filter(f => f.schoolId !== schoolId);
    this.updateInstancedMesh();
  }

  public registerMegaEmblemZone(minX: number, minY: number, maxX: number, maxY: number) {
    this.megaEmblemZones.push({ minX, minY, maxX, maxY });
    // Cleanup flags inside this zone
    this.activeFlags = this.activeFlags.filter(f => !this.isInsideZone(f.x, f.y, minX, minY, maxX, maxY));
    this.updateInstancedMesh();
  }

  public removeMegaEmblemZone(minX: number, minY: number, maxX: number, maxY: number) {
    this.megaEmblemZones = this.megaEmblemZones.filter(z => 
      z.minX !== minX || z.minY !== minY || z.maxX !== maxX || z.maxY !== maxY
    );
  }

  private isInsideMegaEmblem(x: number, y: number): boolean {
    for (const zone of this.megaEmblemZones) {
      if (this.isInsideZone(x, y, zone.minX, zone.minY, zone.maxX, zone.maxY)) {
        return true;
      }
    }
    return false;
  }

  private isInsideZone(x: number, y: number, minX: number, minY: number, maxX: number, maxY: number): boolean {
    return x >= minX && x <= maxX && y >= minY && y <= maxY;
  }

  private updateInstancedMesh() {
    if (!this.instancedMesh) return;

    if (this.activeFlags.length > this.maxFlags) {
      this.activeFlags = this.activeFlags.slice(-this.maxFlags);
    }

    const count = this.activeFlags.length;
    this.instancedMesh.count = count;

    const dummy = new THREE.Object3D();
    const halfTile = 0.5;

    for (let i = 0; i < count; i++) {
      const flag = this.activeFlags[i];
      
      let posX = flag.x;
      let posZ = flag.y;
      let rotationY = 0;
      
      switch (flag.borderType) {
        case 'top': 
          posZ -= halfTile;
          rotationY = Math.PI;
          break;
        case 'bottom': 
          posZ += halfTile;
          rotationY = 0;
          break;
        case 'left': 
          posX -= halfTile;
          rotationY = -Math.PI / 2;
          break;
        case 'right': 
          posX += halfTile;
          rotationY = Math.PI / 2;
          break;
      }

      const baseHeight = getTerrainHeight(flag.x, flag.y);
      dummy.position.set(posX, baseHeight, posZ);
      dummy.rotation.set(0, rotationY, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();

      this.instancedMesh.setMatrixAt(i, dummy.matrix);
      this.instancedMesh.setColorAt(i, flag.color);
    }

    this.instancedMesh.instanceMatrix.needsUpdate = true;
    if (this.instancedMesh.instanceColor) {
      this.instancedMesh.instanceColor.needsUpdate = true;
    }
  }
}
