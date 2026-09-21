import * as THREE from "three";
import { ChunkGridManager } from "./chunkGridManager";

export interface TileClickEvent {
  x: number;
  y: number;
  button: number;
}

export class SceneManager {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;

  private targetPosition = new THREE.Vector3(500, 0, 500);
  private cameraOffset = new THREE.Vector3(0, 70, 70);
  private zoomLevel = 1.0;
  private minZoom = 0.2;
  private maxZoom = 4.0;

  private isDragging = false;
  private isRotating = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private dragDistance = 0;
  private rotationAngle = 0;

  private keysDown: Set<string> = new Set();
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();

  public beaconGroup: THREE.Group = new THREE.Group();
  private beaconMaterial?: THREE.MeshBasicMaterial;
  private beaconCoreMaterial?: THREE.MeshBasicMaterial;
  private beaconRing?: THREE.Mesh;

  // Callbacks
  public onTileHover?: (x: number, y: number, screenX: number, screenY: number) => void;
  public onTileLeave?: () => void;
  public onTileClick?: (event: TileClickEvent) => void;
  public onCameraMove?: (targetX: number, targetZ: number, frustumSize: number) => void;
  public onFpsUpdate?: (fps: number) => void;
  public onFlyToHQRequested?: () => void;
  public onFrameUpdate?: (delta: number) => void;

  private lastClientX = 0;
  private lastClientY = 0;

  private lastTime = performance.now();
  private frameCount = 0;
  private fpsTimer = 0;

  constructor(private container: HTMLElement, private chunkManager: ChunkGridManager) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xd7e9f7); // Clean sky blue
    this.scene.fog = new THREE.FogExp2(0xd7e9f7, 0.002);

    const aspect = container.clientWidth / container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(45, aspect, 1, 2000);
    this.updateCameraPosition();

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    container.appendChild(this.renderer.domElement);

    this.scene.add(this.beaconGroup);
    this.setupLighting();
    this.setupInputEvents();
    this.startRenderLoop();
  }

  public setPlayerHQBeacon(x: number, y: number, colorHex: string) {
    this.beaconGroup.clear();

    const h = 0.2;
    const color = new THREE.Color(colorHex);

    // Slender cylinder (radius 0.8, height 40.0) with additive blending
    const outerGeom = new THREE.CylinderGeometry(0.8, 0.8, 40.0, 24, 1, true);
    this.beaconMaterial = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const outerMesh = new THREE.Mesh(outerGeom, this.beaconMaterial);
    outerMesh.position.set(x, h + 20.0, y);
    this.beaconGroup.add(outerMesh);

    // Inner bright core beam (radius 0.22, height 45.0)
    const coreGeom = new THREE.CylinderGeometry(0.22, 0.22, 45.0, 16, 1, true);
    this.beaconCoreMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const coreMesh = new THREE.Mesh(coreGeom, this.beaconCoreMaterial);
    coreMesh.position.set(x, h + 22.5, y);
    this.beaconGroup.add(coreMesh);

    // Pulsing ground target ring
    const ringGeom = new THREE.RingGeometry(0.8, 2.8, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    this.beaconRing = new THREE.Mesh(ringGeom, ringMat);
    this.beaconRing.rotation.x = -Math.PI / 2;
    this.beaconRing.position.set(x, h + 0.15, y);
    this.beaconGroup.add(this.beaconRing);
  }

  private setupLighting() {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
    this.scene.add(ambientLight);

    const hemiLight = new THREE.HemisphereLight(0xe8f4f8, 0x5a4d41, 0.5);
    hemiLight.position.set(0, 200, 0);
    this.scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xfff7e6, 1.2);
    dirLight.position.set(300, 500, 300);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 50;
    dirLight.shadow.camera.far = 1200;
    dirLight.shadow.camera.left = -300;
    dirLight.shadow.camera.right = 300;
    dirLight.shadow.camera.top = 300;
    dirLight.shadow.camera.bottom = -300;
    dirLight.shadow.bias = -0.0005;
    this.scene.add(dirLight);
  }

  private updateCameraPosition() {
    const rotatedOffset = this.cameraOffset.clone();
    rotatedOffset.multiplyScalar(this.zoomLevel);
    rotatedOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.rotationAngle);

    this.camera.position.copy(this.targetPosition).add(rotatedOffset);
    this.camera.lookAt(this.targetPosition);

    if (this.onCameraMove) {
      this.onCameraMove(this.targetPosition.x, this.targetPosition.z, 70 * this.zoomLevel);
    }
  }

  public panTo(x: number, y: number) {
    this.targetPosition.x = THREE.MathUtils.clamp(x, 20, 980);
    this.targetPosition.z = THREE.MathUtils.clamp(y, 20, 980);
    this.updateCameraPosition();
  }

  public zoomIn() {
    this.zoomLevel = THREE.MathUtils.clamp(this.zoomLevel * 0.85, this.minZoom, this.maxZoom);
    this.updateCameraPosition();
  }

  public zoomOut() {
    this.zoomLevel = THREE.MathUtils.clamp(this.zoomLevel * 1.15, this.minZoom, this.maxZoom);
    this.updateCameraPosition();
  }

  private setupInputEvents() {
    window.addEventListener("resize", () => {
      if (!this.container) return;
      const w = this.container.clientWidth;
      const h = this.container.clientHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    });

    const dom = this.renderer.domElement;

    dom.addEventListener("mousedown", (e) => {
      this.dragStartX = e.clientX;
      this.dragStartY = e.clientY;
      this.dragDistance = 0;

      if (e.button === 0) {
        this.isDragging = true;
      } else if (e.button === 2) {
        this.isRotating = true;
      }
    });

    window.addEventListener("mousemove", (e) => {
      this.lastClientX = e.clientX;
      this.lastClientY = e.clientY;

      // Calculate normalized mouse coords
      const rect = dom.getBoundingClientRect();
      this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      if (this.isDragging) {
        const dx = e.clientX - this.dragStartX;
        const dy = e.clientY - this.dragStartY;
        this.dragDistance += Math.hypot(dx, dy);

        // Pan speed scaled by zoom level
        const panFactor = 0.15 * this.zoomLevel;
        const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.rotationAngle);
        const right = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.rotationAngle);

        this.targetPosition.addScaledVector(right, -dx * panFactor);
        this.targetPosition.addScaledVector(forward, dy * panFactor);

        this.targetPosition.x = THREE.MathUtils.clamp(this.targetPosition.x, 20, 980);
        this.targetPosition.z = THREE.MathUtils.clamp(this.targetPosition.z, 20, 980);

        this.dragStartX = e.clientX;
        this.dragStartY = e.clientY;
        this.updateCameraPosition();
      } else if (this.isRotating) {
        const dx = e.clientX - this.dragStartX;
        this.rotationAngle -= dx * 0.006;
        this.dragStartX = e.clientX;
        this.dragStartY = e.clientY;
        this.updateCameraPosition();
      } else {
        // Tile hover raycast
        this.performRaycast(false);
      }
    });

    window.addEventListener("mouseup", (e) => {
      if (e.button === 0) {
        this.isDragging = false;
        // If minimal drag distance, count as click
        if (this.dragDistance < 5) {
          this.performRaycast(true, e.button);
        }
      } else if (e.button === 2) {
        this.isRotating = false;
      }
    });

    // Prevent context menu on right click
    dom.addEventListener("contextmenu", (e) => e.preventDefault());

    // Mouse wheel zoom
    dom.addEventListener("wheel", (e) => {
      e.preventDefault();
      const zoomDelta = e.deltaY > 0 ? 1.15 : 0.85;
      this.zoomLevel = THREE.MathUtils.clamp(this.zoomLevel * zoomDelta, this.minZoom, this.maxZoom);
      this.updateCameraPosition();
    }, { passive: false });

    // Keyboard navigation WASD & Fly to HQ hotkeys
    window.addEventListener("keydown", (e) => {
      const activeTag = (document.activeElement?.tagName || "").toLowerCase();
      if (activeTag === "input" || activeTag === "select" || activeTag === "textarea") return;

      if (e.key.toLowerCase() === "h" || e.code === "Space") {
        e.preventDefault();
        if (this.onFlyToHQRequested) {
          this.onFlyToHQRequested();
        }
        return;
      }

      this.keysDown.add(e.key.toLowerCase());
    });

    window.addEventListener("keyup", (e) => {
      this.keysDown.delete(e.key.toLowerCase());
    });
  }

  private performRaycast(isClick: boolean, button = 0) {
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.chunkManager.group.children);

    if (intersects.length > 0) {
      const hit = intersects[0];
      const mesh = hit.object as THREE.InstancedMesh;
      if (mesh.isInstancedMesh && hit.instanceId !== undefined) {
        const coords = this.chunkManager.getTileCoords(mesh, hit.instanceId);
        if (coords) {
          if (isClick && this.onTileClick) {
            this.onTileClick({ x: coords.x, y: coords.y, button });
          } else if (!isClick && this.onTileHover) {
            this.onTileHover(coords.x, coords.y, this.lastClientX, this.lastClientY);
          }
          return;
        }
      }
    }

    if (!isClick && this.onTileLeave) {
      this.onTileLeave();
    }
  }

  private updateKeyboardMovement(delta: number) {
    if (this.keysDown.size === 0) return;

    const moveSpeed = 60 * this.zoomLevel * delta;
    const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.rotationAngle);
    const right = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.rotationAngle);

    if (this.keysDown.has("w") || this.keysDown.has("arrowup")) {
      this.targetPosition.addScaledVector(forward, moveSpeed);
    }
    if (this.keysDown.has("s") || this.keysDown.has("arrowdown")) {
      this.targetPosition.addScaledVector(forward, -moveSpeed);
    }
    if (this.keysDown.has("a") || this.keysDown.has("arrowleft")) {
      this.targetPosition.addScaledVector(right, -moveSpeed);
    }
    if (this.keysDown.has("d") || this.keysDown.has("arrowright")) {
      this.targetPosition.addScaledVector(right, moveSpeed);
    }

    this.targetPosition.x = THREE.MathUtils.clamp(this.targetPosition.x, 20, 980);
    this.targetPosition.z = THREE.MathUtils.clamp(this.targetPosition.z, 20, 980);
    this.updateCameraPosition();
  }

  private startRenderLoop() {
    const loop = (timestamp: number) => {
      requestAnimationFrame(loop);

      const delta = (timestamp - this.lastTime) / 1000;
      this.lastTime = timestamp;

      this.updateKeyboardMovement(delta);

      // Animate Beacon and Rotating props
      if (this.beaconGroup.children.length > 0) {
        if (this.beaconRing) {
          const pulse = 1.0 + 0.18 * Math.sin(timestamp * 0.005);
          this.beaconRing.scale.set(pulse, pulse, 1);
        }
      }

      if (this.onFrameUpdate) {
        this.onFrameUpdate(delta);
      }

      // FPS calculation
      this.frameCount++;
      this.fpsTimer += delta;
      if (this.fpsTimer >= 0.5) {
        const fps = Math.round(this.frameCount / this.fpsTimer);
        if (this.onFpsUpdate) this.onFpsUpdate(fps);
        this.frameCount = 0;
        this.fpsTimer = 0;
      }

      this.renderer.render(this.scene, this.camera);
    };

    requestAnimationFrame(loop);
  }
}
