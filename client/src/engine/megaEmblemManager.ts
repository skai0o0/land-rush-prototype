import * as THREE from 'three';
import { SCHOOL_ROSTER } from '../../../shared/constants/schools';
import { getTerrainHeight } from './terrainNoise';

export class MegaEmblemManager {
  public group = new THREE.Group();
  private activeEmblems: Map<string, THREE.Mesh> = new Map();
  private textures: Map<string, THREE.Texture> = new Map();

  constructor() {
    this.group.name = 'MegaEmblemsGroup';
  }

  private generateEmblemTexture(schoolId: string): THREE.Texture {
    if (this.textures.has(schoolId)) {
      return this.textures.get(schoolId)!;
    }

    const config = SCHOOL_ROSTER[schoolId] || { shortName: schoolId, colorHex: '#888888', accentHex: '#ffffff' };
    
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;

    const cx = 256;
    const cy = 256;
    const r = 240;

    // Outer glow / border
    ctx.shadowColor = config.accentHex;
    ctx.shadowBlur = 20;
    
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, 2 * Math.PI);
    ctx.fillStyle = config.colorHex;
    ctx.fill();

    ctx.lineWidth = 15;
    ctx.strokeStyle = config.accentHex;
    ctx.stroke();

    // Inner pattern / crest shape
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(cx, cy, r - 30, 0, 2 * Math.PI);
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = 0.1;
    ctx.fill();
    ctx.globalAlpha = 1.0;

    // Text
    ctx.font = 'bold 120px Arial';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(config.shortName, cx, cy);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearMipMapLinearFilter;
    texture.anisotropy = 16;
    
    this.textures.set(schoolId, texture);
    return texture;
  }

  public addMegaEmblem(schoolId: string, minX: number, minY: number, maxX: number, maxY: number) {
    const key = `${schoolId}_${minX}_${minY}_${maxX}_${maxY}`;
    if (this.activeEmblems.has(key)) return;

    const texture = this.generateEmblemTexture(schoolId);
    
    const width = maxX - minX;
    const height = maxY - minY;
    
    const geometry = new THREE.PlaneGeometry(width, height);
    geometry.rotateX(-Math.PI / 2);

    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
      blending: THREE.NormalBlending
    });

    const mesh = new THREE.Mesh(geometry, material);
    
    const centerX = minX + width / 2;
    const centerZ = minY + height / 2;
    
    // Average height in center area, or just a safe high value 
    const baseHeight = getTerrainHeight(Math.floor(centerX), Math.floor(centerZ));
    
    mesh.position.set(centerX, baseHeight + 0.6, centerZ);
    
    this.group.add(mesh);
    this.activeEmblems.set(key, mesh);
  }

  public removeMegaEmblem(schoolId: string) {
    const keysToRemove: string[] = [];
    this.activeEmblems.forEach((mesh, key) => {
      if (key.startsWith(`${schoolId}_`)) {
        this.group.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
        keysToRemove.push(key);
      }
    });
    keysToRemove.forEach(k => this.activeEmblems.delete(k));
  }
}
