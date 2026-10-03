import * as THREE from "three";
import { getTerrainHeight } from "./terrainNoise";
import { UNISTOP_CONFIGS, CHEST_CONFIGS, UniStopTier, ChestTier } from "../../../shared/constants/unistops";
import { applyFogOfWar } from "./fogOfWarShader";
import type { FogOfWarManager } from "./fogOfWarManager";

export interface UniStopData {
  id: string;
  name: string;
  tier: UniStopTier;
  x: number;
  z: number;
  cooldownUntil?: number;
}

export interface ChestData {
  id: string;
  tier: ChestTier;
  x: number;
  z: number;
  isOpened: boolean;
  openedBySchoolId?: string;
}

interface UniStopMeshEntry {
  data: UniStopData;
  group: THREE.Group;
  rotatingParts: THREE.Object3D[];
  light?: THREE.PointLight;
  skyBeam?: THREE.Mesh;
  particles?: { mesh: THREE.Mesh; speed: number; orbitRadius: number; angle: number; y: number }[];
  baseY: number;
}

interface ChestMeshEntry {
  data: ChestData;
  group: THREE.Group;
  lidGroup: THREE.Group;
  materials: THREE.Material[];
  light?: THREE.PointLight;
  baseY: number;
  initialY: number;
  floatOffset: number;
}

export class SupplyDropManager {
  public group = new THREE.Group();

  private unistops = new Map<string, UniStopMeshEntry>();
  private chests = new Map<string, ChestMeshEntry>();
  private elapsedTime = 0;
  private fogOfWar: FogOfWarManager | null = null;

  // Cached reusable materials & geometries
  private sharedMaterials: THREE.Material[] = [];
  private sharedGeometries: THREE.BufferGeometry[] = [];

  constructor() {
    this.group.name = "SupplyDropsGroup";
  }

  public setFogOfWar(fog: FogOfWarManager): void {
    this.fogOfWar = fog;
    this.group.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const m = (child as THREE.Mesh).material;
        if (m) {
          applyFogOfWar(m, fog);
          if (Array.isArray(m)) m.forEach((mat) => (mat.needsUpdate = true));
          else m.needsUpdate = true;
        }
      }
    });
  }

  // =========================================================================
  // UNISTOPS 3D PROCEDURAL RENDERING
  // =========================================================================

  public addUniStop(data: UniStopData): void {
    if (this.unistops.has(data.id)) {
      this.updateUniStop(data.id, data);
      return;
    }

    const tier = (data.tier || "aspire") as UniStopTier;
    const h = getTerrainHeight(data.x, data.z);
    const unistopGroup = new THREE.Group();
    unistopGroup.name = `UniStop_${data.id}`;
    unistopGroup.position.set(data.x, h, data.z);

    const rotatingParts: THREE.Object3D[] = [];
    let light: THREE.PointLight | undefined;
    let skyBeam: THREE.Mesh | undefined;
    let particles: { mesh: THREE.Mesh; speed: number; orbitRadius: number; angle: number; y: number }[] | undefined;

    // Color definitions per tier
    // Aspire: Bạc ánh kim (#cbd5e1 / #94a3b8)
    // Nitro: Đỏ cam thể thao (#ff4500 / #f97316)
    // Predator: Carbon đen (#0b0e14) & Neon Cyan (#00ffe8)
    let primaryColorHex = 0xcbd5e1;
    let accentColorHex = 0x94a3b8;
    let lightColorHex = 0xe2e8f0;
    let lightIntensity = 2.0;

    if (tier === "nitro") {
      primaryColorHex = 0xff4500;
      accentColorHex = 0xf97316;
      lightColorHex = 0xff6b35;
      lightIntensity = 2.8;
    } else if (tier === "predator") {
      primaryColorHex = 0x00ffe8;
      accentColorHex = 0x00d2ff;
      lightColorHex = 0x00ffe8;
      lightIntensity = 3.8;
    }

    // 1. Octagonal Pedestal Base (Plinth)
    const baseMat = new THREE.MeshStandardMaterial({
      color: tier === "predator" ? 0x0d121c : 0x1e293b,
      metalness: 0.85,
      roughness: 0.3
    });
    const baseGeom = new THREE.CylinderGeometry(1.6, 1.8, 0.45, 8);
    const baseMesh = new THREE.Mesh(baseGeom, baseMat);
    baseMesh.position.y = 0.225;
    baseMesh.castShadow = true;
    baseMesh.receiveShadow = true;
    unistopGroup.add(baseMesh);

    // 2. Base Neon Accent Ring
    const accentMat = new THREE.MeshBasicMaterial({
      color: primaryColorHex,
      transparent: true,
      opacity: 0.85
    });
    const ringGeom = new THREE.RingGeometry(1.45, 1.62, 24);
    const ringMesh = new THREE.Mesh(ringGeom, accentMat);
    ringMesh.rotation.x = -Math.PI / 2;
    ringMesh.position.y = 0.46;
    unistopGroup.add(ringMesh);

    // 3. Central Hi-Tech Pillar Column
    const pillarMat = new THREE.MeshStandardMaterial({
      color: tier === "predator" ? 0x0b0e14 : 0x334155,
      metalness: 0.9,
      roughness: 0.2
    });
    const pillarGeom = new THREE.CylinderGeometry(0.55, 0.75, 2.6, 8);
    const pillarMesh = new THREE.Mesh(pillarGeom, pillarMat);
    pillarMesh.position.y = 1.65;
    pillarMesh.castShadow = true;
    pillarMesh.receiveShadow = true;
    unistopGroup.add(pillarMesh);

    // 4. Floating Holographic Energy Rings
    const torusGeom = new THREE.TorusGeometry(0.95, 0.05, 8, 24);
    const torusMat = new THREE.MeshBasicMaterial({
      color: primaryColorHex,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending
    });
    const ring1 = new THREE.Mesh(torusGeom, torusMat);
    ring1.position.y = 2.0;
    ring1.rotation.x = Math.PI / 3;
    unistopGroup.add(ring1);
    rotatingParts.push(ring1);

    const ring2 = new THREE.Mesh(torusGeom, torusMat);
    ring2.position.y = 2.0;
    ring2.rotation.x = -Math.PI / 3;
    unistopGroup.add(ring2);
    rotatingParts.push(ring2);

    // 5. Crown Energy Crystal / Diamond Top
    const crystalMat = new THREE.MeshStandardMaterial({
      color: primaryColorHex,
      emissive: primaryColorHex,
      emissiveIntensity: 0.7,
      metalness: 0.5,
      roughness: 0.1,
      transparent: true,
      opacity: 0.92
    });
    const crystalGeom = new THREE.OctahedronGeometry(0.55, 0);
    const crystalMesh = new THREE.Mesh(crystalGeom, crystalMat);
    crystalMesh.position.y = 3.35;
    unistopGroup.add(crystalMesh);
    rotatingParts.push(crystalMesh);

    // 6. PointLight for ambient luminescence
    light = new THREE.PointLight(lightColorHex, lightIntensity, 16, 1.2);
    light.position.set(0, 2.5, 0);
    unistopGroup.add(light);

    // 7. PREDATOR TIER EXCLUSIVE: SKY BEAM & PHOTON PARTICLES
    if (tier === "predator") {
      // Celestial Sky Beam (Cột ánh sáng chiếu thẳng lên trời 75m)
      const beamGeom = new THREE.CylinderGeometry(0.7, 0.7, 75.0, 16, 1, true);
      const beamMat = new THREE.MeshBasicMaterial({
        color: 0x00ffe8,
        transparent: true,
        opacity: 0.42,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false
      });
      skyBeam = new THREE.Mesh(beamGeom, beamMat);
      skyBeam.position.set(0, 37.5, 0);
      unistopGroup.add(skyBeam);

      // Core Inner Sky Beam (Lõi trắng sáng)
      const coreBeamGeom = new THREE.CylinderGeometry(0.18, 0.18, 78.0, 12, 1, true);
      const coreBeamMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.75,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false
      });
      const coreBeamMesh = new THREE.Mesh(coreBeamGeom, coreBeamMat);
      coreBeamMesh.position.set(0, 39.0, 0);
      unistopGroup.add(coreBeamMesh);

      // Spiral Photon Particles rising upwards
      particles = [];
      const pGeom = new THREE.OctahedronGeometry(0.12, 0);
      const pMat = new THREE.MeshBasicMaterial({
        color: 0x00ffe8,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending
      });
      for (let i = 0; i < 18; i++) {
        const pMesh = new THREE.Mesh(pGeom, pMat);
        const angle = Math.random() * Math.PI * 2;
        const radius = 0.5 + Math.random() * 1.2;
        const speed = 2.0 + Math.random() * 2.5;
        const startY = Math.random() * 18.0;
        pMesh.position.set(Math.cos(angle) * radius, startY, Math.sin(angle) * radius);
        unistopGroup.add(pMesh);
        particles.push({
          mesh: pMesh,
          speed,
          orbitRadius: radius,
          angle,
          y: startY
        });
      }
    }

    if (this.fogOfWar) {
      unistopGroup.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const m = (child as THREE.Mesh).material;
          if (m) applyFogOfWar(m, this.fogOfWar!);
        }
      });
    }

    this.group.add(unistopGroup);
    this.unistops.set(data.id, {
      data,
      group: unistopGroup,
      rotatingParts,
      light,
      skyBeam,
      particles,
      baseY: h
    });
  }

  public updateUniStop(id: string, partial: Partial<UniStopData>): void {
    const entry = this.unistops.get(id);
    if (!entry) return;

    Object.assign(entry.data, partial);

    if (partial.x !== undefined || partial.z !== undefined) {
      const h = getTerrainHeight(entry.data.x, entry.data.z);
      entry.baseY = h;
      entry.group.position.set(entry.data.x, h, entry.data.z);
    }
  }

  public removeUniStop(id: string): void {
    const entry = this.unistops.get(id);
    if (!entry) return;

    this.group.remove(entry.group);
    this.unistops.delete(id);
  }

  // =========================================================================
  // CHESTS 3D PROCEDURAL RENDERING
  // =========================================================================

  public addChest(data: ChestData): void {
    if (this.chests.has(data.id)) {
      this.updateChest(data.id, data);
      return;
    }

    const tier = (data.tier || "aspire") as ChestTier;
    const h = getTerrainHeight(data.x, data.z);
    const chestGroup = new THREE.Group();
    chestGroup.name = `Chest_${data.id}`;
    const initialY = h + 0.65;
    chestGroup.position.set(data.x, initialY, data.z);

    const materials: THREE.Material[] = [];

    // Colors per Tier
    // Aspire (silver/cyan): Sleek slate #334155, silver trim #cbd5e1, cyan glow #00ffe8
    // Nitro (vibrant orange/amber): Bronze copper #7c2d12, vibrant orange trim #f97316, amber glow #fbbf24
    // Predator (cyber black/neon cyan): Stealth black #0b0e14, neon cyan trim #00ffe8, cyan pulse #00ffe8
    let mainColor = 0x334155;
    let trimColor = 0xcbd5e1;
    let glowColor = 0x00ffe8;
    let lightColor = 0x67e8f9;

    if (tier === "nitro" || (tier as any) === "gold") {
      mainColor = 0x7c2d12;
      trimColor = 0xf97316;
      glowColor = 0xfbbf24;
      lightColor = 0xff6b35;
    } else if (tier === "predator" || (tier as any) === "platinum") {
      mainColor = 0x0b0e14;
      trimColor = 0x00ffe8;
      glowColor = 0x00ffe8;
      lightColor = 0x00ffe8;
    }

    // Chest Body Material
    const bodyMat = new THREE.MeshStandardMaterial({
      color: mainColor,
      metalness: 0.85,
      roughness: 0.25,
      transparent: true,
      opacity: data.isOpened ? 0.35 : 1.0
    });
    materials.push(bodyMat);

    // Chest Trim & Edge Material
    const trimMat = new THREE.MeshStandardMaterial({
      color: trimColor,
      metalness: 0.95,
      roughness: 0.15,
      emissive: glowColor,
      emissiveIntensity: data.isOpened ? 0.1 : 0.45,
      transparent: true,
      opacity: data.isOpened ? 0.35 : 1.0
    });
    materials.push(trimMat);

    // 1. Lower Box Body (W: 1.1, H: 0.55, D: 0.75)
    const bodyGeom = new THREE.BoxGeometry(1.1, 0.55, 0.75);
    const bodyMesh = new THREE.Mesh(bodyGeom, bodyMat);
    bodyMesh.position.y = 0.275;
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = true;
    chestGroup.add(bodyMesh);

    // Metal Trim Edges
    const trimGeom = new THREE.BoxGeometry(1.14, 0.12, 0.79);
    const trimMesh = new THREE.Mesh(trimGeom, trimMat);
    trimMesh.position.y = 0.5;
    chestGroup.add(trimMesh);

    // 2. Chest Lid with Hinged Pivot at Back (-Z)
    const lidGroup = new THREE.Group();
    lidGroup.position.set(0, 0.55, -0.375); // Pivot at back edge

    const lidGeom = new THREE.BoxGeometry(1.14, 0.3, 0.79);
    const lidMesh = new THREE.Mesh(lidGeom, bodyMat);
    lidMesh.position.set(0, 0.15, 0.375); // Centered relative to pivot
    lidMesh.castShadow = true;
    lidMesh.receiveShadow = true;
    lidGroup.add(lidMesh);

    // Lid Trim
    const lidTrimGeom = new THREE.BoxGeometry(1.18, 0.08, 0.83);
    const lidTrimMesh = new THREE.Mesh(lidTrimGeom, trimMat);
    lidTrimMesh.position.set(0, 0.25, 0.375);
    lidGroup.add(lidTrimMesh);

    // Lock Core / Cyber Emblem
    const lockMat = new THREE.MeshBasicMaterial({
      color: glowColor,
      transparent: true,
      opacity: data.isOpened ? 0.2 : 0.95
    });
    materials.push(lockMat);
    const lockGeom = new THREE.BoxGeometry(0.22, 0.22, 0.06);
    const lockMesh = new THREE.Mesh(lockGeom, lockMat);
    lockMesh.position.set(0, 0.0, 0.78);
    lidGroup.add(lockMesh);

    chestGroup.add(lidGroup);

    // If opened: rotate lid open by ~65 degrees
    if (data.isOpened) {
      lidGroup.rotation.x = -1.15;
    }

    // 3. Ground Halo Ring & PointLight
    const haloGeom = new THREE.RingGeometry(0.5, 0.85, 24);
    const haloMat = new THREE.MeshBasicMaterial({
      color: glowColor,
      transparent: true,
      opacity: data.isOpened ? 0.1 : 0.45,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });
    materials.push(haloMat);
    const haloMesh = new THREE.Mesh(haloGeom, haloMat);
    haloMesh.rotation.x = -Math.PI / 2;
    haloMesh.position.y = -0.55;
    chestGroup.add(haloMesh);

    const light = new THREE.PointLight(lightColor, data.isOpened ? 0.4 : 2.2, 10, 1.4);
    light.position.set(0, 0.3, 0);
    chestGroup.add(light);

    if (this.fogOfWar) {
      chestGroup.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const m = (child as THREE.Mesh).material;
          if (m) applyFogOfWar(m, this.fogOfWar!);
        }
      });
    }

    this.group.add(chestGroup);
    this.chests.set(data.id, {
      data,
      group: chestGroup,
      lidGroup,
      materials,
      light,
      baseY: h,
      initialY,
      floatOffset: Math.random() * Math.PI * 2
    });
  }

  public updateChest(id: string, partial: Partial<ChestData>): void {
    const entry = this.chests.get(id);
    if (!entry) return;

    Object.assign(entry.data, partial);

    if (partial.x !== undefined || partial.z !== undefined) {
      const h = getTerrainHeight(entry.data.x, entry.data.z);
      entry.baseY = h;
      entry.initialY = h + 0.65;
      entry.group.position.set(entry.data.x, entry.initialY, entry.data.z);
    }

    if (partial.isOpened !== undefined) {
      if (entry.data.isOpened) {
        // Open lid and fade
        entry.lidGroup.rotation.x = -1.15;
        for (const mat of entry.materials) {
          mat.transparent = true;
          mat.opacity = 0.35;
          if ('emissiveIntensity' in mat) {
            (mat as any).emissiveIntensity = 0.1;
          }
        }
        if (entry.light) {
          entry.light.intensity = 0.3;
        }
      } else {
        // Closed and vibrant
        entry.lidGroup.rotation.x = 0;
        for (const mat of entry.materials) {
          mat.opacity = 1.0;
        }
        if (entry.light) {
          entry.light.intensity = 2.2;
        }
      }
    }
  }

  public removeChest(id: string): void {
    const entry = this.chests.get(id);
    if (!entry) return;

    this.group.remove(entry.group);
    this.chests.delete(id);
  }

  // =========================================================================
  // ANIMATION & FRAME UPDATE
  // =========================================================================

  public update(delta: number): void {
    this.elapsedTime += delta;
    const t = this.elapsedTime;

    // 1. Animate UniStops
    this.unistops.forEach((entry) => {
      // Rotate kinetic hologram rings & top diamond
      let rotSpeed = 1.0;
      for (let i = 0; i < entry.rotatingParts.length; i++) {
        const part = entry.rotatingParts[i];
        const dir = (i % 2 === 0) ? 1 : -1;
        part.rotation.y += delta * rotSpeed * dir;
        part.rotation.z += delta * 0.4 * dir;
      }

      // Predator sky beam & spiral particles
      if (entry.skyBeam) {
        entry.skyBeam.rotation.y += delta * 0.45;
        const beamMat = entry.skyBeam.material as THREE.MeshBasicMaterial;
        beamMat.opacity = 0.35 + 0.15 * Math.sin(t * 3.5);
      }

      if (entry.particles) {
        for (const p of entry.particles) {
          p.y += p.speed * delta;
          p.angle += 1.8 * delta;
          if (p.y > 22.0) {
            p.y = 0.3 + Math.random() * 0.5;
            p.angle = Math.random() * Math.PI * 2;
          }
          const r = p.orbitRadius * (1.0 + p.y * 0.08);
          p.mesh.position.set(Math.cos(p.angle) * r, p.y, Math.sin(p.angle) * r);
          const fade = Math.max(0, 1.0 - (p.y / 22.0));
          p.mesh.scale.setScalar(fade * 0.8 + 0.2);
        }
      }

      // PointLight breathing pulse
      if (entry.light) {
        entry.light.intensity = 2.4 + 0.6 * Math.sin(t * 4.0);
      }
    });

    // 2. Animate Chests: Gentle Hover Bobbing & Rotation
    this.chests.forEach((entry) => {
      // Rotation Y
      entry.group.rotation.y += delta * 0.65;

      // Bobbing floating motion
      const bob = Math.sin(t * 2.2 + entry.floatOffset) * 0.12;
      entry.group.position.y = entry.initialY + bob;

      // Subtle light pulse if unopened
      if (entry.light && !entry.data.isOpened) {
        entry.light.intensity = 2.0 + 0.5 * Math.sin(t * 3.2 + entry.floatOffset);
      }
    });
  }

  // =========================================================================
  // SPATIAL RAYCAST QUERIES & GETTERS
  // =========================================================================

  public findUniStopAt(x: number, z: number, maxDist = 2.6): UniStopData | null {
    let nearest: UniStopData | null = null;
    let minDist = maxDist;

    for (const entry of this.unistops.values()) {
      const dist = Math.hypot(x - entry.data.x, z - entry.data.z);
      if (dist <= minDist) {
        minDist = dist;
        nearest = entry.data;
      }
    }

    return nearest;
  }

  public findChestAt(x: number, z: number, maxDist = 2.6): ChestData | null {
    let nearest: ChestData | null = null;
    let minDist = maxDist;

    for (const entry of this.chests.values()) {
      const dist = Math.hypot(x - entry.data.x, z - entry.data.z);
      if (dist <= minDist) {
        minDist = dist;
        nearest = entry.data;
      }
    }

    return nearest;
  }

  public getAllUniStops(): UniStopData[] {
    return Array.from(this.unistops.values()).map(e => ({ ...e.data }));
  }

  public getAllChests(): ChestData[] {
    return Array.from(this.chests.values()).map(e => ({ ...e.data }));
  }

  public setUniStopPosition(id: string, x: number, z: number): void {
    this.updateUniStop(id, { x, z });
  }

  public setChestPosition(id: string, x: number, z: number): void {
    this.updateChest(id, { x, z });
  }

  public dispose(): void {
    this.unistops.clear();
    this.chests.clear();
    this.group.clear();
  }
}
