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
    group.position.set(x, h + 0.11, y);

    const primaryColor = school ? new THREE.Color(school.colorHex) : new THREE.Color(0x0055a5);
    const accentColor = school ? new THREE.Color(school.accentHex) : new THREE.Color(0xffffff);

    // 1. Base Stepped Stone Plinth (~20 tiles hexagonal footprint)
    const baseMat = new THREE.MeshLambertMaterial({ color: 0x3d4852 });
    const baseGeom = new THREE.CylinderGeometry(9.6, 9.6, 0.6, 6);
    const baseMesh = new THREE.Mesh(baseGeom, baseMat);
    baseMesh.position.y = 0.3;
    baseMesh.castShadow = true;
    baseMesh.receiveShadow = true;
    group.add(baseMesh);

    // 2. Second Tier Plinth
    const tier2Geom = new THREE.CylinderGeometry(8.2, 8.2, 0.5, 6);
    const tier2Mesh = new THREE.Mesh(tier2Geom, baseMat);
    tier2Mesh.position.y = 0.85;
    tier2Mesh.castShadow = true;
    tier2Mesh.receiveShadow = true;
    group.add(tier2Mesh);

    // 3. Main School Monolith Column
    const columnMat = new THREE.MeshLambertMaterial({ color: primaryColor });
    const columnGeom = new THREE.BoxGeometry(3.6, 6.0, 3.6);
    const columnMesh = new THREE.Mesh(columnGeom, columnMat);
    columnMesh.position.y = 4.0;
    columnMesh.castShadow = true;
    columnMesh.receiveShadow = true;
    group.add(columnMesh);

    // 4. Accent trim ring
    const trimMat = new THREE.MeshLambertMaterial({ color: accentColor });
    const trimGeom = new THREE.BoxGeometry(4.2, 0.6, 4.2);
    const trimMesh = new THREE.Mesh(trimGeom, trimMat);
    trimMesh.position.y = 7.2;
    trimMesh.castShadow = true;
    group.add(trimMesh);

    // 5. Floating Rotating School Banner / Crest Diamond
    const bannerGroup = new THREE.Group();
    bannerGroup.position.y = 9.5;

    const diamondGeom = new THREE.OctahedronGeometry(1.6, 0);
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
    const flagGeom = new THREE.BoxGeometry(2.4, 0.8, 0.12);
    const flagMesh = new THREE.Mesh(flagGeom, flagMat);
    flagMesh.position.set(1.2, 0, 0);
    bannerGroup.add(flagMesh);

    group.add(bannerGroup);
    this.rotatingObjects.push(bannerGroup);

    group.userData = { isHQ: true, schoolId, x, y, isFallback: true };
    this.group.add(group);
    this.spawnedModels.set(`hq_${schoolId}`, group);
    return group;
  }

  // Fallback: Procedural Landmark Monolith scaled to enlarged footprint
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

    // Tiered Grand Monument scaled to footprint
    const stoneMat = new THREE.MeshLambertMaterial({ color: 0x5a6570 });
    const baseGeom = new THREE.BoxGeometry(fw * 0.85, 0.8, fh * 0.85);
    const baseMesh = new THREE.Mesh(baseGeom, stoneMat);
    baseMesh.position.y = 0.4;
    baseMesh.castShadow = true;
    baseMesh.receiveShadow = true;
    group.add(baseMesh);

    // 4 Corner Pillars
    const pillarMat = new THREE.MeshLambertMaterial({ color: 0x8a9ba8 });
    const pGeom = new THREE.BoxGeometry(1.2, 4.5, 1.2);
    const ox = fw * 0.35;
    const oz = fh * 0.35;
    const offsets = [
      [-ox, -oz], [ox, -oz],
      [-ox, oz], [ox, oz]
    ];
    for (const [px, pz] of offsets) {
      const p = new THREE.Mesh(pGeom, pillarMat);
      p.position.set(px, 2.6, pz);
      p.castShadow = true;
      p.receiveShadow = true;
      group.add(p);
    }

    // Top Roof Slab
    const roofGeom = new THREE.BoxGeometry(fw * 0.75, 0.8, fh * 0.75);
    const roofMesh = new THREE.Mesh(roofGeom, stoneMat);
    roofMesh.position.y = 5.2;
    roofMesh.castShadow = true;
    group.add(roofMesh);

    // Golden Floating Orb / Beacon
    const goldMat = new THREE.MeshLambertMaterial({
      color: 0xffd166,
      emissive: 0xffb703,
      emissiveIntensity: 0.6
    });
    const orbGeom = new THREE.IcosahedronGeometry(2.0, 0);
    const orb = new THREE.Mesh(orbGeom, goldMat);
    orb.position.y = 7.2;
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
              return m;
            });
          } else if (mesh.material) {
            const m = mesh.material.clone();
            if (shouldTintAccent(m.name) && "color" in m) {
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
              return m;
            });
          } else if (mesh.material) {
            const m = mesh.material.clone();
            if (shouldTintAccent(m.name) && "color" in m) {
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
