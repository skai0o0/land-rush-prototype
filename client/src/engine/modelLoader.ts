import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { LANDMARK_ROSTER } from "../../../shared/constants/landmarks";
import { SCHOOL_ROSTER } from "../../../shared/constants/schools";
import { getTerrainHeight } from "./terrainNoise";
import { applyFogOfWar } from "./fogOfWarShader";
import type { FogOfWarManager } from "./fogOfWarManager";

export class ModelLoader {
  private loader = new GLTFLoader();
  public group = new THREE.Group();

  // Model cache to avoid re-fetching
  private modelCache: Map<string, THREE.Group> = new Map();
  private spawnedModels: Map<string, THREE.Group> = new Map();
  private rotatingObjects: THREE.Object3D[] = [];
  private beaconLights: Map<string, BeaconLight> = new Map();
  private get bonfireFlames(): Map<string, BeaconLight> { return this.beaconLights; }
  private landmarkLitSchools: Map<string, string> = new Map();
  private fogOfWar: FogOfWarManager | null = null;

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

  constructor() {
    this.group.name = "ModelsGroup";

    // Setup DRACOLoader for compressed GLB meshes
    try {
      const dracoLoader = new DRACOLoader();
      dracoLoader.setDecoderPath("/draco/gltf/");
      dracoLoader.setDecoderConfig({ type: "js" });
      this.loader.setDRACOLoader(dracoLoader);
    } catch (e) {
      console.warn("[ModelLoader] Could not initialize local DRACOLoader, trying CDN...", e);
      try {
        const dracoLoader = new DRACOLoader();
        dracoLoader.setDecoderPath("https://www.gstatic.com/draco/versioned/decoders/1.5.7/");
        this.loader.setDRACOLoader(dracoLoader);
      } catch (err) {
        console.error("[ModelLoader] DRACOLoader failed:", err);
      }
    }
  }

  // Preload a GLB model
  private async loadGLB(url: string): Promise<THREE.Group> {
    if (this.modelCache.has(url)) {
      return this.modelCache.get(url)!.clone();
    }

    try {
      const response = await fetch(url, { method: "HEAD" });
      if (response.ok) {
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("text/html")) {
          throw new Error(`Model not found, fallback to HTML`);
        }
      } else {
        throw new Error(`Model not found (HTTP ${response.status})`);
      }
    } catch (e) {
      // Cleanly reject before GLTFLoader attempts to parse HTML
      throw e;
    }

    return new Promise((resolve, reject) => {
      this.loader.load(
        url,
        (gltf) => {
          const scene = gltf.scene;
          this.modelCache.set(url, scene);
          resolve(scene.clone());
        },
        undefined,
        (err) => reject(err) // Silently reject, handled by caller
      );
    });
  }

  // Fallback: Procedural Voxel Plinth with Minecraft Oak & Cobblestone
  public createFallbackHQ(schoolId: string, x: number, y: number): THREE.Group {
    const school = SCHOOL_ROSTER[schoolId];
    const group = new THREE.Group();
    group.name = `HQ_Fallback_${schoolId}`;
    const h = getTerrainHeight(x, y);
    group.position.set(x, h + 0.11, y);

    const primaryColor = school ? new THREE.Color(school.colorHex) : new THREE.Color(0x0055a5);
    const accentColor = school ? new THREE.Color(school.accentHex) : new THREE.Color(0xffffff);

    // 1. Base Stepped Cobblestone Platform (~20 tiles footprint)
    const cobbleMat = new THREE.MeshLambertMaterial({
      color: 0x737373, // Minecraft Cobblestone
      emissive: 0x000000
    });
    const baseGeom = new THREE.CylinderGeometry(9.6, 9.6, 0.6, 8);
    const baseMesh = new THREE.Mesh(baseGeom, cobbleMat);
    baseMesh.position.y = 0.3;
    baseMesh.castShadow = true;
    baseMesh.receiveShadow = true;
    group.add(baseMesh);

    // 2. Second Tier Platform (Oak Wood Planks & School Colors)
    const oakPlankMat = new THREE.MeshLambertMaterial({
      color: 0x6d4e33, // Minecraft Oak Wood
      emissive: 0x000000
    });
    const tier2Geom = new THREE.CylinderGeometry(8.2, 8.2, 0.5, 8);
    const tier2Mesh = new THREE.Mesh(tier2Geom, oakPlankMat);
    tier2Mesh.position.y = 0.85;
    tier2Mesh.castShadow = true;
    tier2Mesh.receiveShadow = true;
    group.add(tier2Mesh);

    // 3. Central Oak Pillar / Flagpole Base
    const pillarMat = new THREE.MeshLambertMaterial({
      color: 0x543d2b, // Dark Oak Trunk
      emissive: 0x000000
    });
    const pillarGeom = new THREE.BoxGeometry(1.6, 7.5, 1.6);
    const pillarMesh = new THREE.Mesh(pillarGeom, pillarMat);
    pillarMesh.position.y = 4.6;
    pillarMesh.castShadow = true;
    pillarMesh.receiveShadow = true;
    group.add(pillarMesh);

    // 4. Stone Brick Base Collar
    const stoneCollarGeom = new THREE.BoxGeometry(2.8, 1.2, 2.8);
    const stoneCollarMesh = new THREE.Mesh(stoneCollarGeom, cobbleMat);
    stoneCollarMesh.position.y = 1.7;
    stoneCollarMesh.castShadow = true;
    group.add(stoneCollarMesh);

    // 5. School Banner (Minecraft Wool Banner)
    const bannerGroup = new THREE.Group();
    bannerGroup.position.y = 7.5;

    // Main Wool Banner
    const bannerMat = new THREE.MeshLambertMaterial({
      color: primaryColor
    });
    const bannerGeom = new THREE.BoxGeometry(2.2, 3.4, 0.16);
    const bannerMesh = new THREE.Mesh(bannerGeom, bannerMat);
    bannerMesh.position.set(1.2, -0.6, 0);
    bannerMesh.castShadow = true;
    bannerGroup.add(bannerMesh);

    // Banner Top Rod & Trim
    const trimMat = new THREE.MeshLambertMaterial({ color: accentColor });
    const rodGeom = new THREE.BoxGeometry(2.6, 0.2, 0.25);
    const rodMesh = new THREE.Mesh(rodGeom, trimMat);
    rodMesh.position.set(1.2, 1.1, 0);
    bannerGroup.add(rodMesh);

    group.add(bannerGroup);
    this.rotatingObjects.push(bannerGroup);

    group.userData = { isHQ: true, schoolId, x, y, isFallback: true };
    if (this.fogOfWar) {
      group.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const m = (child as THREE.Mesh).material;
          if (m) applyFogOfWar(m, this.fogOfWar!);
        }
      });
    }
    this.group.add(group);
    this.spawnedModels.set(`hq_${schoolId}`, group);
    return group;
  }

  // Fallback: Procedural Landmark Monolith (Minecraft Cobblestone & Oak Wood)
  public createFallbackLandmark(landmarkId: string, x: number, y: number): THREE.Group {
    const config = LANDMARK_ROSTER[landmarkId];
    const group = new THREE.Group();
    group.name = `Landmark_Fallback_${landmarkId}`;
    const fw = config?.footprint.width || 14;
    const fh = config?.footprint.height || 12;
    const cx = x + fw * 0.5;
    const cy = y + fh * 0.5;
    const h = getTerrainHeight(cx, cy);
    group.position.set(cx, h + 0.11, cy);

    // Tiered Grand Monument (Minecraft Cobblestone & Stone Rock)
    const stoneMat = new THREE.MeshLambertMaterial({ color: 0x737373, emissive: 0x000000 });
    const baseGeom = new THREE.BoxGeometry(fw * 0.85, 0.8, fh * 0.85);
    const baseMesh = new THREE.Mesh(baseGeom, stoneMat);
    baseMesh.position.y = 0.4;
    baseMesh.castShadow = true;
    baseMesh.receiveShadow = true;
    group.add(baseMesh);

    // 4 Corner Oak Wood Log Pillars
    const oakWoodMat = new THREE.MeshLambertMaterial({ color: 0x6d4e33, emissive: 0x000000 });
    const pGeom = new THREE.BoxGeometry(1.2, 4.5, 1.2);
    const ox = fw * 0.35;
    const oz = fh * 0.35;
    const offsets = [
      [-ox, -oz], [ox, -oz],
      [-ox, oz], [ox, oz]
    ];
    for (const [px, pz] of offsets) {
      const p = new THREE.Mesh(pGeom, oakWoodMat);
      p.position.set(px, 2.6, pz);
      p.castShadow = true;
      p.receiveShadow = true;
      group.add(p);
    }

    // Top Roof Slab (Cobblestone / Stone Roof)
    const roofGeom = new THREE.BoxGeometry(fw * 0.75, 0.8, fh * 0.75);
    const roofMesh = new THREE.Mesh(roofGeom, stoneMat);
    roofMesh.position.y = 5.2;
    roofMesh.castShadow = true;
    group.add(roofMesh);

    // Minecraft Lantern / Fire Torch Beacon (Voxel Lantern)
    const lanternMat = new THREE.MeshLambertMaterial({
      color: 0xf59e0b,
      emissive: 0xd97706,
      emissiveIntensity: 0.5
    });
    const lanternGeom = new THREE.BoxGeometry(1.4, 1.8, 1.4);
    const lantern = new THREE.Mesh(lanternGeom, lanternMat);
    lantern.position.y = 6.6;
    lantern.castShadow = true;
    group.add(lantern);
    this.rotatingObjects.push(lantern);

    group.userData = { isLandmark: true, landmarkId, x, y, config, isFallback: true };
    if (this.fogOfWar) {
      group.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const m = (child as THREE.Mesh).material;
          if (m) applyFogOfWar(m, this.fogOfWar!);
        }
      });
    }
    this.group.add(group);
    this.spawnedModels.set(`lm_${landmarkId}`, group);
    if (this.landmarkLitSchools.has(landmarkId)) {
      this.setLandmarkBonfire(landmarkId, this.landmarkLitSchools.get(landmarkId)!);
    }
    return group;
  }

  // Spawn School HQ Model: Instantly displays procedural plinth, then replaces with GLB when loaded!
  public async spawnHQ(schoolId: string, x: number, y: number): Promise<THREE.Group> {
    // 1. Immediately create and add the fallback plinth so the base is NEVER empty
    const fallback = this.createFallbackHQ(schoolId, x, y);

    const school = SCHOOL_ROSTER[schoolId];
    const url = `/models/hqs/${schoolId}_hq.glb`;

    try {
      const model = await this.loadGLB(url);
      const h = getTerrainHeight(x, y);

      // HQ model scale: 1 unit in GLB = 1 unit in Three.js = 1 in-game tile (~20 tiles diameter)
      // Check bounding box diameter: if significantly deviates from target 20 tiles, auto-scale
      const box = new THREE.Box3().setFromObject(model);
      const size = new THREE.Vector3();
      box.getSize(size);
      const currentDiameter = Math.max(size.x, size.z);
      const targetDiameter = 20.0;
      let scaleFactor = 1.0;
      if (currentDiameter > 0 && Math.abs(currentDiameter - targetDiameter) > 4.0) {
        scaleFactor = targetDiameter / currentDiameter;
      }
      model.scale.set(scaleFactor, scaleFactor, scaleFactor);
      const yOffset = box.min.y < 0 ? -box.min.y * scaleFactor : 0;
      model.position.set(x, h + 0.11 + yOffset, y);

      // Apply FactionAccent color & shadows (preserve greenery/plants)
      const factionColor = school ? new THREE.Color(school.colorHex) : new THREE.Color(0x1488d8);
      const shouldTintAccent = (matName: string) => {
        const lower = matName.toLowerCase();
        if (lower.includes("tree") || lower.includes("green") || lower.includes("grass") || lower.includes("foliage") || lower.includes("leaf") || lower.includes("palm")) {
          return false; // preserve nature & plants
        }
        return lower.includes("faction") || (lower.includes("accent") && !lower.includes("glow"));
      };

      model.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          mesh.castShadow = true;
          mesh.receiveShadow = true;

          if (Array.isArray(mesh.material)) {
            mesh.material = mesh.material.map((mat) => {
              const m = mat.clone();
              if (shouldTintAccent(m.name) && "color" in m) {
                (m as any).color.copy(factionColor);
              }
              if (this.fogOfWar) {
                applyFogOfWar(m, this.fogOfWar);
              }
              return m;
            });
          } else if (mesh.material) {
            const m = mesh.material.clone();
            if (shouldTintAccent(m.name) && "color" in m) {
              (m as any).color.copy(factionColor);
            }
            if (this.fogOfWar) {
              applyFogOfWar(m, this.fogOfWar);
            }
            mesh.material = m;
          }
        }
      });

      // Once loaded, remove the fallback and attach the GLB model
      this.group.remove(fallback);
      this.rotatingObjects = this.rotatingObjects.filter((obj) => obj.parent !== fallback);

      model.name = `HQ_${schoolId}`;
      model.userData = { isHQ: true, schoolId, x, y };
      this.group.add(model);
      this.spawnedModels.set(`hq_${schoolId}`, model);
      console.log(`[ModelLoader] Swapped in GLB for HQ ${schoolId} at (${x}, ${y})`);
      return model;
    } catch (e) {
      console.warn(`[ModelLoader] Retaining procedural fallback for HQ ${schoolId}:`, e);
      return fallback;
    }
  }

  // Spawn Landmark Model: Instantly displays procedural monument, then replaces with GLB when loaded!
  public async spawnLandmark(
    landmarkId: string,
    x: number,
    y: number,
    ownerSchoolId = ""
  ): Promise<THREE.Group> {
    const fallback = this.createFallbackLandmark(landmarkId, x, y);

    const config = LANDMARK_ROSTER[landmarkId];
    const cleanId = landmarkId.replace(/^landmark_/, "");
    const fileName = config?.modelFileName || `${cleanId}.glb`;
    const url = `/models/landmarks/${fileName}`;

    try {
      const model = await this.loadGLB(url);
      const targetW = config?.footprint.width || 14;
      const targetH = config?.footprint.height || 12;
      const cx = x + targetW * 0.5;
      const cy = y + targetH * 0.5;
      const h = getTerrainHeight(cx, cy);

      // Scale landmark model to match enlarged footprint (~12 to 18.5 tiles)
      const box = new THREE.Box3().setFromObject(model);
      const size = new THREE.Vector3();
      box.getSize(size);
      const scaleX = size.x > 0 ? targetW / size.x : 0.3;
      const scaleZ = size.z > 0 ? targetH / size.z : 0.3;
      const scaleFactor = Math.min(scaleX, scaleZ) * 1.02;
      model.scale.set(scaleFactor, scaleFactor, scaleFactor);
      const yOffset = box.min.y < 0 ? -box.min.y * scaleFactor : 0;
      model.position.set(cx, h + 0.11 + yOffset, cy);

      const factionColor = ownerSchoolId && SCHOOL_ROSTER[ownerSchoolId]
        ? new THREE.Color(SCHOOL_ROSTER[ownerSchoolId].colorHex)
        : new THREE.Color(0x1488d8);

      const shouldTintAccent = (matName: string) => {
        const lower = matName.toLowerCase();
        if (lower.includes("tree") || lower.includes("green") || lower.includes("grass") || lower.includes("foliage") || lower.includes("leaf") || lower.includes("water") || lower.includes("lake") || lower.includes("palm")) {
          return false; // preserve environmental materials
        }
        return lower.includes("faction") || (lower.includes("accent") && !lower.includes("glow"));
      };

      model.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          mesh.castShadow = true;
          mesh.receiveShadow = true;

          if (Array.isArray(mesh.material)) {
            mesh.material = mesh.material.map((mat) => {
              const m = mat.clone();
              if (shouldTintAccent(m.name) && "color" in m) {
                (m as any).color.copy(factionColor);
              }
              if (this.fogOfWar) {
                applyFogOfWar(m, this.fogOfWar);
              }
              return m;
            });
          } else if (mesh.material) {
            const m = mesh.material.clone();
            if (shouldTintAccent(m.name) && "color" in m) {
              (m as any).color.copy(factionColor);
            }
            if (this.fogOfWar) {
              applyFogOfWar(m, this.fogOfWar);
            }
            mesh.material = m;
          }
        }
      });

      this.group.remove(fallback);
      this.rotatingObjects = this.rotatingObjects.filter((obj) => obj.parent !== fallback);

      model.name = `Landmark_${cleanId}`;
      model.userData = { isLandmark: true, landmarkId, x, y, config };
      this.group.add(model);
      this.spawnedModels.set(`lm_${landmarkId}`, model);
      if (this.landmarkLitSchools.has(landmarkId)) {
        this.setLandmarkBonfire(landmarkId, this.landmarkLitSchools.get(landmarkId)!);
      }
      console.log(`[ModelLoader] Swapped in GLB for Landmark ${landmarkId} at (${x}, ${y})`);
      return model;
    } catch (e) {
      console.warn(`[ModelLoader] Retaining procedural fallback for Landmark ${landmarkId}:`, e);
      return fallback;
    }
  }

  // Update Landmark color when captured
  public updateLandmarkOwner(landmarkId: string, schoolId: string) {
    const model = this.spawnedModels.get(`lm_${landmarkId}`);
    if (!model || !SCHOOL_ROSTER[schoolId]) return;

    const newColor = new THREE.Color(SCHOOL_ROSTER[schoolId].colorHex);
    model.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((m) => {
            if ((m.name.toLowerCase().includes("accent") || m.name.toLowerCase().includes("faction")) && "color" in m) {
              (m as any).color.copy(newColor);
            }
          });
        } else if (mesh.material) {
          const m = mesh.material;
          if ((m.name.toLowerCase().includes("accent") || m.name.toLowerCase().includes("faction")) && "color" in m) {
            (m as any).color.copy(newColor);
          }
        }
      }
    });
  }

  // Set or update 3D Beacon Light for a Landmark
  public setLandmarkBeacon(landmarkId: string, schoolId: string) {
    if (!schoolId || schoolId === "") {
      this.landmarkLitSchools.delete(landmarkId);
      const existing = this.beaconLights.get(landmarkId);
      if (existing) {
        this.group.remove(existing.root);
        existing.dispose();
        this.beaconLights.delete(landmarkId);
      }
      return;
    }

    this.landmarkLitSchools.set(landmarkId, schoolId);

    const model = this.spawnedModels.get(`lm_${landmarkId}`);
    if (!model) return;

    // Calculate top apex of model using bounding box
    const box = new THREE.Box3().setFromObject(model);
    const topY = box.max.y;
    const centerX = (box.min.x + box.max.x) / 2;
    const centerZ = (box.min.z + box.max.z) / 2;

    let beacon = this.beaconLights.get(landmarkId);
    if (beacon) {
      beacon.setColor(schoolId);
      beacon.root.position.set(centerX, topY + 0.2, centerZ);
    } else {
      beacon = new BeaconLight(schoolId);
      beacon.root.position.set(centerX, topY + 0.2, centerZ);
      this.group.add(beacon.root);
      this.beaconLights.set(landmarkId, beacon);
    }
  }

  public setLandmarkBonfire(landmarkId: string, schoolId: string) {
    return this.setLandmarkBeacon(landmarkId, schoolId);
  }

  public getLandmarkBeacon(landmarkId: string): BeaconLight | undefined {
    return this.beaconLights.get(landmarkId);
  }

  public getLandmarkBonfire(landmarkId: string): BeaconLight | undefined {
    return this.getLandmarkBeacon(landmarkId);
  }

  // Animate rotating fallback banners, diamonds, and glowing Beacon Lights
  public update(delta: number) {
    for (const obj of this.rotatingObjects) {
      obj.rotation.y += 1.8 * delta;
    }

    for (const beacon of this.beaconLights.values()) {
      beacon.update(delta);
    }
  }

  public clear() {
    for (const beacon of this.beaconLights.values()) {
      this.group.remove(beacon.root);
      beacon.dispose();
    }
    this.beaconLights.clear();
    this.landmarkLitSchools.clear();

    this.group.clear();
    this.spawnedModels.clear();
    this.rotatingObjects = [];
  }
}

/**
 * 3D Beacon Light & Cyber Crystal Energy Beacon for Lit Landmarks
 */
export class BeaconLight {
  public root = new THREE.Group();
  private crystalCore: THREE.Mesh;
  private crystalInnerCore: THREE.Mesh;
  private beaconBeam: THREE.Mesh;
  private innerBeam: THREE.Mesh;
  private haloRing1: THREE.Mesh;
  private haloRing2: THREE.Mesh;
  private light: THREE.PointLight;
  private particles: { mesh: THREE.Mesh; speed: number; orbitRadius: number; angle: number; y: number }[] = [];
  private materials: THREE.Material[] = [];
  private geometries: THREE.BufferGeometry[] = [];
  private elapsedTime = 0;

  constructor(schoolId: string) {
    this.root.name = `BeaconLight_${schoolId}`;
    const school = SCHOOL_ROSTER[schoolId];
    const colorHex = school ? school.colorHex : "#00ffe8";
    const accentHex = school ? school.accentHex : "#ffffff";
    const primaryColor = new THREE.Color(colorHex);
    const accentColor = new THREE.Color(accentHex);

    // 1. Vertical Cyber Laser Pillar (Outer & Inner Skyward Beam)
    const beamGeom = new THREE.CylinderGeometry(0.6, 2.8, 48.0, 16, 1, true);
    this.geometries.push(beamGeom);
    const beamMat = new THREE.MeshBasicMaterial({
      color: primaryColor,
      transparent: true,
      opacity: 0.38,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    this.materials.push(beamMat);
    this.beaconBeam = new THREE.Mesh(beamGeom, beamMat);
    this.beaconBeam.position.y = 24.0;
    this.root.add(this.beaconBeam);

    const innerBeamGeom = new THREE.CylinderGeometry(0.18, 0.35, 52.0, 12, 1, true);
    this.geometries.push(innerBeamGeom);
    const innerBeamMat = new THREE.MeshBasicMaterial({
      color: accentColor,
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    this.materials.push(innerBeamMat);
    this.innerBeam = new THREE.Mesh(innerBeamGeom, innerBeamMat);
    this.innerBeam.position.y = 26.0;
    this.root.add(this.innerBeam);

    // 2. Floating Octahedron Crystal Core on top
    const crystalGeom = new THREE.OctahedronGeometry(1.35, 0);
    this.geometries.push(crystalGeom);
    const crystalMat = new THREE.MeshStandardMaterial({
      color: primaryColor,
      emissive: primaryColor,
      emissiveIntensity: 0.85,
      metalness: 0.3,
      roughness: 0.1,
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending
    });
    this.materials.push(crystalMat);
    this.crystalCore = new THREE.Mesh(crystalGeom, crystalMat);
    this.crystalCore.position.y = 2.4;
    this.root.add(this.crystalCore);

    // Inner bright core
    const innerCrystalGeom = new THREE.OctahedronGeometry(0.72, 0);
    this.geometries.push(innerCrystalGeom);
    const innerCrystalMat = new THREE.MeshBasicMaterial({
      color: accentColor,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending
    });
    this.materials.push(innerCrystalMat);
    this.crystalInnerCore = new THREE.Mesh(innerCrystalGeom, innerCrystalMat);
    this.crystalInnerCore.position.y = 2.4;
    this.root.add(this.crystalInnerCore);

    // 3. Rotating Concentric Energy Rings
    const ring1Geom = new THREE.TorusGeometry(1.85, 0.08, 8, 32);
    this.geometries.push(ring1Geom);
    const ring1Mat = new THREE.MeshBasicMaterial({
      color: primaryColor,
      transparent: true,
      opacity: 0.82,
      blending: THREE.AdditiveBlending
    });
    this.materials.push(ring1Mat);
    this.haloRing1 = new THREE.Mesh(ring1Geom, ring1Mat);
    this.haloRing1.rotation.x = Math.PI / 3;
    this.haloRing1.position.y = 2.4;
    this.root.add(this.haloRing1);

    const ring2Geom = new THREE.TorusGeometry(2.5, 0.06, 8, 32);
    this.geometries.push(ring2Geom);
    const ring2Mat = new THREE.MeshBasicMaterial({
      color: accentColor,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending
    });
    this.materials.push(ring2Mat);
    this.haloRing2 = new THREE.Mesh(ring2Geom, ring2Mat);
    this.haloRing2.rotation.x = -Math.PI / 4;
    this.haloRing2.position.y = 2.4;
    this.root.add(this.haloRing2);

    // 4. Floating Crystal Photon Particles (Spiraling upwards)
    const particleGeom = new THREE.OctahedronGeometry(0.18, 0);
    this.geometries.push(particleGeom);
    const particleMat = new THREE.MeshBasicMaterial({
      color: primaryColor,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending
    });
    this.materials.push(particleMat);

    for (let i = 0; i < 24; i++) {
      const pMesh = new THREE.Mesh(particleGeom, particleMat);
      const angle = Math.random() * Math.PI * 2;
      const radius = 0.6 + Math.random() * 2.2;
      const speed = 1.8 + Math.random() * 3.0;
      const startY = Math.random() * 16.0;
      pMesh.position.set(Math.cos(angle) * radius, startY, Math.sin(angle) * radius);
      this.root.add(pMesh);
      this.particles.push({
        mesh: pMesh,
        speed,
        orbitRadius: radius,
        angle,
        y: startY
      });
    }

    // 5. Dynamic Cyber PointLight
    this.light = new THREE.PointLight(primaryColor, 3.5, 40, 1.2);
    this.light.position.y = 2.4;
    this.root.add(this.light);
  }

  public setColor(schoolId: string) {
    const school = SCHOOL_ROSTER[schoolId];
    const colorHex = school ? school.colorHex : "#00ffe8";
    const accentHex = school ? school.accentHex : "#ffffff";
    const primaryColor = new THREE.Color(colorHex);
    const accentColor = new THREE.Color(accentHex);

    (this.beaconBeam.material as THREE.MeshBasicMaterial).color.copy(primaryColor);
    (this.innerBeam.material as THREE.MeshBasicMaterial).color.copy(accentColor);
    (this.crystalCore.material as THREE.MeshStandardMaterial).color.copy(primaryColor);
    (this.crystalCore.material as THREE.MeshStandardMaterial).emissive.copy(primaryColor);
    (this.crystalInnerCore.material as THREE.MeshBasicMaterial).color.copy(accentColor);
    (this.haloRing1.material as THREE.MeshBasicMaterial).color.copy(primaryColor);
    (this.haloRing2.material as THREE.MeshBasicMaterial).color.copy(accentColor);
    this.light.color.copy(primaryColor);
  }

  public update(delta: number) {
    this.elapsedTime += delta;
    const t = this.elapsedTime;

    // Laser beam rotation & pulse
    this.beaconBeam.rotation.y += 0.45 * delta;
    (this.beaconBeam.material as THREE.MeshBasicMaterial).opacity = 0.35 + 0.15 * Math.sin(t * 3.2);

    this.innerBeam.rotation.y -= 0.6 * delta;
    (this.innerBeam.material as THREE.MeshBasicMaterial).opacity = 0.65 + 0.2 * Math.cos(t * 4.0);

    // Floating crystal core hovering & rotation
    const floatY = 2.4 + 0.28 * Math.sin(t * 2.2);
    this.crystalCore.position.y = floatY;
    this.crystalCore.rotation.y += 1.5 * delta;
    this.crystalCore.rotation.x = 0.2 * Math.sin(t * 1.8);
    this.crystalCore.rotation.z = 0.2 * Math.cos(t * 1.6);

    this.crystalInnerCore.position.y = floatY;
    this.crystalInnerCore.rotation.y -= 2.2 * delta;

    // Energy rings rotation
    this.haloRing1.rotation.z += 1.6 * delta;
    this.haloRing1.rotation.y += 0.8 * delta;
    this.haloRing1.position.y = floatY;

    this.haloRing2.rotation.z -= 1.2 * delta;
    this.haloRing2.rotation.x += 0.9 * delta;
    this.haloRing2.position.y = floatY;

    // PointLight cyber flicker
    this.light.intensity = 3.0 + 1.0 * Math.sin(t * 6.0) + 0.4 * Math.cos(t * 12.0);
    this.light.position.y = floatY;

    // Floating crystal photon particles
    for (const p of this.particles) {
      p.y += p.speed * delta;
      p.angle += 2.0 * delta;
      if (p.y > 18.0) {
        p.y = 0.4 + Math.random() * 0.8;
        p.angle = Math.random() * Math.PI * 2;
      }
      const r = p.orbitRadius * (1.0 + p.y * 0.12);
      p.mesh.position.set(Math.cos(p.angle) * r, p.y, Math.sin(p.angle) * r);
      p.mesh.rotation.y += 3.0 * delta;

      const fade = Math.max(0, 1.0 - (p.y / 18.0));
      p.mesh.scale.setScalar(fade * 0.95 + 0.05);
    }
  }

  public dispose() {
    for (const mat of this.materials) {
      mat.dispose();
    }
    for (const geom of this.geometries) {
      geom.dispose();
    }
    this.root.clear();
  }
}

// Backward-compatibility alias
export const BonfireFlame = BeaconLight;

