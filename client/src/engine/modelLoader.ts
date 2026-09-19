import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { LANDMARK_ROSTER } from "../../../shared/constants/landmarks";
import { SCHOOL_ROSTER } from "../../../shared/constants/schools";
import { getTerrainHeight } from "./terrainNoise";

export class ModelLoader {
  private loader = new GLTFLoader();
  public group = new THREE.Group();

  // Model cache to avoid re-fetching
  private modelCache: Map<string, THREE.Group> = new Map();
  private spawnedModels: Map<string, THREE.Group> = new Map();
  private rotatingObjects: THREE.Object3D[] = [];

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

    return new Promise((resolve, reject) => {
      this.loader.load(
        url,
        (gltf) => {
          const scene = gltf.scene;
          this.modelCache.set(url, scene);
          resolve(scene.clone());
        },
        undefined,
        (err) => {
          console.warn(`[ModelLoader] Failed to load ${url}:`, err);
          reject(err);
        }
      );
    });
  }

  // Fallback: Procedural Voxel Plinth with Floating Rotating Banner
  public createFallbackHQ(schoolId: string, x: number, y: number): THREE.Group {
    const school = SCHOOL_ROSTER[schoolId];
    const group = new THREE.Group();
    group.name = `HQ_Fallback_${schoolId}`;
    const h = getTerrainHeight(x, y);
    group.position.set(x, h, y);

    const primaryColor = school ? new THREE.Color(school.colorHex) : new THREE.Color(0x0055a5);
    const accentColor = school ? new THREE.Color(school.accentHex) : new THREE.Color(0xffffff);

    // 1. Base Stepped Stone Plinth (3x3 footprint)
    const baseMat = new THREE.MeshLambertMaterial({ color: 0x3d4852 });
    const baseGeom = new THREE.BoxGeometry(2.8, 0.45, 2.8);
    const baseMesh = new THREE.Mesh(baseGeom, baseMat);
    baseMesh.position.y = 0.22;
    baseMesh.castShadow = true;
    baseMesh.receiveShadow = true;
    group.add(baseMesh);

    // 2. Second Tier Plinth
    const tier2Geom = new THREE.BoxGeometry(2.0, 0.4, 2.0);
    const tier2Mesh = new THREE.Mesh(tier2Geom, baseMat);
    tier2Mesh.position.y = 0.62;
    tier2Mesh.castShadow = true;
    tier2Mesh.receiveShadow = true;
    group.add(tier2Mesh);

    // 3. Main School Monolith Column
    const columnMat = new THREE.MeshLambertMaterial({ color: primaryColor });
    const columnGeom = new THREE.BoxGeometry(1.2, 2.4, 1.2);
    const columnMesh = new THREE.Mesh(columnGeom, columnMat);
    columnMesh.position.y = 1.8;
    columnMesh.castShadow = true;
    columnMesh.receiveShadow = true;
    group.add(columnMesh);

    // 4. Accent trim ring
    const trimMat = new THREE.MeshLambertMaterial({ color: accentColor });
    const trimGeom = new THREE.BoxGeometry(1.35, 0.25, 1.35);
    const trimMesh = new THREE.Mesh(trimGeom, trimMat);
    trimMesh.position.y = 2.95;
    trimMesh.castShadow = true;
    group.add(trimMesh);

    // 5. Floating Rotating School Banner / Crest Diamond
    const bannerGroup = new THREE.Group();
    bannerGroup.position.y = 4.0;

    const diamondGeom = new THREE.OctahedronGeometry(0.65, 0);
    const diamondMat = new THREE.MeshLambertMaterial({
      color: primaryColor,
      emissive: primaryColor,
      emissiveIntensity: 0.4
    });
    const diamondMesh = new THREE.Mesh(diamondGeom, diamondMat);
    diamondMesh.scale.set(0.8, 1.3, 0.8);
    diamondMesh.castShadow = true;
    bannerGroup.add(diamondMesh);

    // Side fluttering flag ribbons
    const flagMat = new THREE.MeshLambertMaterial({ color: accentColor });
    const flagGeom = new THREE.BoxGeometry(1.0, 0.35, 0.06);
    const flagMesh = new THREE.Mesh(flagGeom, flagMat);
    flagMesh.position.set(0.5, 0, 0);
    bannerGroup.add(flagMesh);

    group.add(bannerGroup);
    this.rotatingObjects.push(bannerGroup);

    group.userData = { isHQ: true, schoolId, x, y, isFallback: true };
    this.group.add(group);
    this.spawnedModels.set(`hq_${schoolId}`, group);
    return group;
  }

  // Fallback: Procedural Landmark Monolith
  public createFallbackLandmark(landmarkId: string, x: number, y: number): THREE.Group {
    const config = LANDMARK_ROSTER[landmarkId];
    const group = new THREE.Group();
    group.name = `Landmark_Fallback_${landmarkId}`;
    const h = getTerrainHeight(x, y);
    const cx = x + (config?.footprint.width || 6) * 0.5;
    const cy = y + (config?.footprint.height || 6) * 0.5;
    group.position.set(cx, h, cy);

    // Tiered Grand Monument
    const stoneMat = new THREE.MeshLambertMaterial({ color: 0x5a6570 });
    const baseGeom = new THREE.BoxGeometry(4.0, 0.5, 4.0);
    const baseMesh = new THREE.Mesh(baseGeom, stoneMat);
    baseMesh.position.y = 0.25;
    baseMesh.castShadow = true;
    baseMesh.receiveShadow = true;
    group.add(baseMesh);

    // 4 Corner Pillars
    const pillarMat = new THREE.MeshLambertMaterial({ color: 0x8a9ba8 });
    const pGeom = new THREE.BoxGeometry(0.5, 2.2, 0.5);
    const offsets = [
      [-1.3, -1.3], [1.3, -1.3],
      [-1.3, 1.3], [1.3, 1.3]
    ];
    for (const [ox, oz] of offsets) {
      const p = new THREE.Mesh(pGeom, pillarMat);
      p.position.set(ox, 1.5, oz);
      p.castShadow = true;
      p.receiveShadow = true;
      group.add(p);
    }

    // Top Roof Slab
    const roofGeom = new THREE.BoxGeometry(3.6, 0.45, 3.6);
    const roofMesh = new THREE.Mesh(roofGeom, stoneMat);
    roofMesh.position.y = 2.8;
    roofMesh.castShadow = true;
    group.add(roofMesh);

    // Golden Floating Orb / Beacon
    const goldMat = new THREE.MeshLambertMaterial({
      color: 0xffd166,
      emissive: 0xffb703,
      emissiveIntensity: 0.5
    });
    const orbGeom = new THREE.IcosahedronGeometry(0.75, 0);
    const orb = new THREE.Mesh(orbGeom, goldMat);
    orb.position.y = 3.9;
    orb.castShadow = true;
    group.add(orb);
    this.rotatingObjects.push(orb);

    group.userData = { isLandmark: true, landmarkId, x, y, config, isFallback: true };
    this.group.add(group);
    this.spawnedModels.set(`lm_${landmarkId}`, group);
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

      // Blender units: 1 tile = 8m -> scale by 1/8 to fit 1 tile = 1 Three.js unit
      model.scale.set(0.125, 0.125, 0.125);
      model.position.set(x, h + 0.1, y);

      // Apply FactionAccent color & shadows
      const factionColor = school ? new THREE.Color(school.colorHex) : new THREE.Color(0x1488d8);
      model.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          mesh.castShadow = true;
          mesh.receiveShadow = true;

          if (Array.isArray(mesh.material)) {
            mesh.material = mesh.material.map((mat) => {
              const m = mat.clone();
              if ((m.name.toLowerCase().includes("accent") || m.name.toLowerCase().includes("faction")) && "color" in m) {
                (m as any).color.copy(factionColor);
              }
              return m;
            });
          } else if (mesh.material) {
            const m = mesh.material.clone();
            if ((m.name.toLowerCase().includes("accent") || m.name.toLowerCase().includes("faction")) && "color" in m) {
              (m as any).color.copy(factionColor);
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
      const h = getTerrainHeight(x, y);

      model.scale.set(0.125, 0.125, 0.125);
      const cx = x + (config?.footprint.width || 6) * 0.5;
      const cy = y + (config?.footprint.height || 6) * 0.5;
      model.position.set(cx, h + 0.1, cy);

      const factionColor = ownerSchoolId && SCHOOL_ROSTER[ownerSchoolId]
        ? new THREE.Color(SCHOOL_ROSTER[ownerSchoolId].colorHex)
        : new THREE.Color(0x1488d8);

      model.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          mesh.castShadow = true;
          mesh.receiveShadow = true;

          if (Array.isArray(mesh.material)) {
            mesh.material = mesh.material.map((mat) => {
              const m = mat.clone();
              if ((m.name.toLowerCase().includes("accent") || m.name.toLowerCase().includes("faction")) && "color" in m) {
                (m as any).color.copy(factionColor);
              }
              return m;
            });
          } else if (mesh.material) {
            const m = mesh.material.clone();
            if ((m.name.toLowerCase().includes("accent") || m.name.toLowerCase().includes("faction")) && "color" in m) {
              (m as any).color.copy(factionColor);
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

  // Animate rotating fallback banners & diamonds
  public update(delta: number) {
    for (const obj of this.rotatingObjects) {
      obj.rotation.y += 1.8 * delta;
    }
  }

  public clear() {
    this.group.clear();
    this.spawnedModels.clear();
    this.rotatingObjects = [];
  }
}
