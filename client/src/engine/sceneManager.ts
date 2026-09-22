import * as THREE from "three";
import { ChunkGridManager } from "./chunkGridManager";
import { getTerrainHeight } from "./terrainNoise";

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
  public selectionMarkerGroup: THREE.Group = new THREE.Group();
  private beaconMaterial?: THREE.MeshBasicMaterial;
  private beaconCoreMaterial?: THREE.MeshBasicMaterial;
  private beaconRing?: THREE.Mesh;

  // Camera motion: unified tween (position + zoom + parabolic altitude arc)
  private desiredZoom = 1.0;
  private flightAltitude = 0;
  private motion: {
    t: number;
    duration: number;
    fromPos: THREE.Vector3;
    toPos: THREE.Vector3;
    fromZoom: number;
    toZoom: number;
    arcHeight: number;
    zoomLift: number;
    ease: (t: number) => number;
  } | null = null;

  // Zoom velocity & momentum physics
  private zoomVelocity = 0;
  private readonly zoomFriction = 7.5;

  // Pan inertia & momentum physics
  private panVelocity = new THREE.Vector2(0, 0);
  private readonly panFriction = 7.5;
  private lastDragTimestamp = 0;
  private keyboardVelocity = new THREE.Vector3(0, 0, 0);
  private readonly keyboardFriction = 9.0;

  // Rotation inertia & velocity physics
  private rotationVelocity = 0;
  private readonly rotationFriction = 7.0;
  private lastRotateTimestamp = 0;

  // Touch controls state
  private isTouching = false;
  private isPinching = false;
  private touchStartX = 0;
  private touchStartY = 0;
  private touchDistanceMoved = 0;
  private lastTouchTimestamp = 0;
  private lastPinchDistance = 0;
  private lastPinchAngle = 0;

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

    this.handleResize();
    this.scene.add(this.beaconGroup);
    this.scene.add(this.selectionMarkerGroup);
    this.setupLighting();
    this.setupInputEvents();
    this.startRenderLoop();
  }

  public handleResize(): void {
    if (!this.container) return;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w === 0 || h === 0) return;

    const aspect = w / h;
    this.camera.aspect = aspect;

    // Mobile Portrait Adaptive FOV:
    // PerspectiveCamera uses vertical FOV. On portrait screens (aspect < 1.0),
    // a standard 45 deg FOV causes the horizontal view to narrow significantly.
    // Dynamically broaden FOV when aspect < 1.0 so the campus map remains wide.
    if (aspect < 1.0) {
      this.camera.fov = THREE.MathUtils.clamp(45 / Math.pow(aspect, 0.42), 45, 62);
    } else {
      this.camera.fov = 45;
    }

    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  public setPlayerHQBeacon(x: number, y: number, colorHex: string) {
    this.beaconGroup.clear();

    const h = getTerrainHeight(x, y);
    const color = new THREE.Color(colorHex);

    // Slender cylinder (radius 0.9, height 60.0) with additive blending
    const outerGeom = new THREE.CylinderGeometry(0.9, 0.9, 60.0, 24, 1, true);
    this.beaconMaterial = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const outerMesh = new THREE.Mesh(outerGeom, this.beaconMaterial);
    outerMesh.position.set(x, h + 30.0, y);
    this.beaconGroup.add(outerMesh);

    // Inner bright core beam (radius 0.25, height 65.0)
    const coreGeom = new THREE.CylinderGeometry(0.25, 0.25, 65.0, 16, 1, true);
    this.beaconCoreMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const coreMesh = new THREE.Mesh(coreGeom, this.beaconCoreMaterial);
    coreMesh.position.set(x, h + 32.5, y);
    this.beaconGroup.add(coreMesh);

    // Pulsing ground target ring encircling 20-tile diameter HQ base
    const ringGeom = new THREE.RingGeometry(10.2, 11.8, 48);
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

  private selectionMarkerMaterial?: THREE.MeshBasicMaterial;
  private selectionMarkerInnerMat?: THREE.MeshBasicMaterial;

  public setSelectedTileMarker(x: number, y: number, colorHex = "#38bdf8") {
    this.selectionMarkerGroup.clear();
    const h = getTerrainHeight(x, y);

    // Glowing rectangular frame matching the 0.96 x 0.96 voxel tile
    const s = 0.49; // Outer boundary
    const t = 0.40; // Inner cutout
    const shape = new THREE.Shape();
    shape.moveTo(-s, -s);
    shape.lineTo(s, -s);
    shape.lineTo(s, s);
    shape.lineTo(-s, s);
    shape.closePath();

    const hole = new THREE.Path();
    hole.moveTo(-t, -t);
    hole.lineTo(-t, t);
    hole.lineTo(t, t);
    hole.lineTo(t, -t);
    hole.closePath();
    shape.holes.push(hole);

    const squareGeom = new THREE.ShapeGeometry(shape);
    const color = new THREE.Color(colorHex);

    this.selectionMarkerMaterial = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false
    });

    const frameMesh = new THREE.Mesh(squareGeom, this.selectionMarkerMaterial);
    frameMesh.rotation.x = -Math.PI / 2;
    frameMesh.position.set(x, h + 0.17, y);
    this.selectionMarkerGroup.add(frameMesh);

    // Subtle inner holographic tint
    const innerGeom = new THREE.PlaneGeometry(0.80, 0.80);
    this.selectionMarkerInnerMat = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.22,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const innerMesh = new THREE.Mesh(innerGeom, this.selectionMarkerInnerMat);
    innerMesh.rotation.x = -Math.PI / 2;
    innerMesh.position.set(x, h + 0.165, y);
    this.selectionMarkerGroup.add(innerMesh);

    // 4 Corner Accent Brackets for tactical sci-fi aesthetics
    const cornerLen = 0.14;
    const linePositions: number[] = [
      // Top-left
      -s, 0, -s,  -s + cornerLen, 0, -s,
      -s, 0, -s,  -s, 0, -s + cornerLen,
      // Top-right
       s, 0, -s,   s - cornerLen, 0, -s,
       s, 0, -s,   s, 0, -s + cornerLen,
      // Bottom-right
       s, 0,  s,   s - cornerLen, 0,  s,
       s, 0,  s,   s, 0,  s - cornerLen,
      // Bottom-left
      -s, 0,  s,  -s + cornerLen, 0,  s,
      -s, 0,  s,  -s, 0,  s - cornerLen
    ];
    const cornerGeom = new THREE.BufferGeometry();
    cornerGeom.setAttribute("position", new THREE.Float32BufferAttribute(linePositions, 3));

    const cornerMat = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const cornerLines = new THREE.LineSegments(cornerGeom, cornerMat);
    cornerLines.position.set(x, h + 0.18, y);
    this.selectionMarkerGroup.add(cornerLines);
  }

  public clearSelectedTileMarker() {
    this.selectionMarkerGroup.clear();
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
    this.camera.position.y += this.flightAltitude;
    this.camera.lookAt(this.targetPosition);
    this.camera.updateMatrixWorld();

    if (this.onCameraMove) {
      this.onCameraMove(this.targetPosition.x, this.targetPosition.z, 70 * this.zoomLevel);
    }
  }

  private static easeInOutQuint(t: number): number {
    return t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2;
  }

  private static easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - t, 3);
  }

  private cancelPanAnim() {
    if (this.motion) {
      this.flightAltitude = 0;
      this.motion = null;
    }
  }

  private setDesiredZoom(zoom: number) {
    this.desiredZoom = THREE.MathUtils.clamp(zoom, this.minZoom, this.maxZoom);
    if (this.motion) {
      // Rebase zoom segment so retargeting mid-tween never snaps the camera
      const e = this.motion.ease(this.motion.t);
      const target = this.desiredZoom;
      if (e >= 0.999) {
        this.zoomLevel = target;
        this.motion.fromZoom = target;
        this.motion.toZoom = target;
      } else {
        this.motion.fromZoom = (this.zoomLevel - target * e) / (1 - e);
        this.motion.toZoom = target;
      }
    }
  }

  private startMotion(opts: {
    toPos?: THREE.Vector3;
    toZoom?: number;
    duration: number;
    arcHeight?: number;
    zoomLift?: number;
    ease: (t: number) => number;
  }) {
    const toPos = opts.toPos?.clone() ?? this.targetPosition.clone();
    const toZoom = THREE.MathUtils.clamp(
      opts.toZoom ?? this.desiredZoom,
      this.minZoom,
      this.maxZoom
    );
    this.desiredZoom = toZoom;
    this.zoomVelocity = 0;
    this.panVelocity.set(0, 0);
    this.keyboardVelocity.set(0, 0, 0);
    this.motion = {
      t: 0,
      duration: Math.max(0.05, opts.duration),
      fromPos: this.targetPosition.clone(),
      toPos,
      fromZoom: this.zoomLevel,
      toZoom,
      arcHeight: opts.arcHeight ?? 0,
      zoomLift: opts.zoomLift ?? 0,
      ease: opts.ease
    };
  }

  /**
   * Smooth pan/fly to a map position.
   * Features a cinematic 3D parabolic altitude arc (swoop & dive) and mid-flight panoramic
   * zoom lift for long-distance flights (such as flying to HQ).
   */
  public panTo(
    x: number,
    y: number,
    opts?: {
      duration?: number;
      zoom?: number;
      arc?: boolean;
      arcHeight?: number;
      zoomLift?: number;
    }
  ) {
    const toX = THREE.MathUtils.clamp(x, 20, 980);
    const toZ = THREE.MathUtils.clamp(y, 20, 980);
    const toPos = new THREE.Vector3(toX, 0, toZ);

    const dist = Math.hypot(toPos.x - this.targetPosition.x, toPos.z - this.targetPosition.z);
    const targetZoom = typeof opts?.zoom === "number" ? opts.zoom : this.desiredZoom;
    const zoomDelta = Math.abs(this.zoomLevel - targetZoom);

    // Auto-enable altitude arc if distance is significant (> 25 tiles) unless explicitly disabled
    const useArc = opts?.arc ?? (dist > 25);
    const arcHeight = useArc
      ? (opts?.arcHeight ?? Math.min(85, Math.max(18, dist * 0.12)))
      : 0;
    const zoomLift = useArc
      ? (opts?.zoomLift ?? Math.min(0.28, Math.max(0.06, dist * 0.00035)))
      : 0;

    // Fluid duration based on distance and flight curve
    const duration =
      opts?.duration ??
      THREE.MathUtils.clamp(0.65 + dist * 0.0014 + zoomDelta * 0.3, 0.65, 1.65);

    this.startMotion({
      toPos,
      toZoom: targetZoom,
      duration,
      arcHeight,
      zoomLift,
      ease: SceneManager.easeInOutQuint
    });
  }

  /**
   * Direct live target position setting for real-time minimap dragging / pan
   */
  public setTargetPosition(x: number, z: number): void {
    this.cancelPanAnim();
    this.panVelocity.set(0, 0);
    this.targetPosition.x = THREE.MathUtils.clamp(x, 20, 980);
    this.targetPosition.z = THREE.MathUtils.clamp(z, 20, 980);
    this.updateCameraPosition();
  }

  /** Zoom in with physical velocity impulse */
  public zoomIn(impulse = 0.38) {
    this.cancelPanAnim();
    // Negative velocity zooms in towards ground (smaller zoomLevel)
    this.zoomVelocity -= impulse * (this.zoomLevel * 0.9);
  }

  /** Zoom out with physical velocity impulse */
  public zoomOut(impulse = 0.38) {
    this.cancelPanAnim();
    // Positive velocity zooms out (broader view, larger zoomLevel)
    this.zoomVelocity += impulse * (this.zoomLevel * 0.9);
  }

  /** Eased zoom step for exact numeric target */
  private animateZoomTo(zoom: number) {
    const target = THREE.MathUtils.clamp(zoom, this.minZoom, this.maxZoom);
    if (this.motion) {
      this.setDesiredZoom(target);
      return;
    }
    if (Math.abs(target - this.zoomLevel) < 0.0008) return;
    this.startMotion({
      toZoom: target,
      duration: 0.32,
      ease: SceneManager.easeOutCubic
    });
  }

  private updateCameraMotion(delta: number) {
    let needsUpdate = false;

    // 1. Programmatic Flight / Pan Motion (Fly to HQ or Pan to target)
    if (this.motion) {
      const a = this.motion;
      a.t = Math.min(1, a.t + delta / a.duration);
      const e = a.ease(a.t);

      // Horizontal ground lerp
      this.targetPosition.lerpVectors(a.fromPos, a.toPos, e);

      // Parabolic altitude arc: smooth sine curve peaking at mid-flight (t = 0.5)
      const arcFactor = Math.sin(Math.PI * a.t);
      this.flightAltitude = a.arcHeight * arcFactor;

      // Base zoom lerp + mid-flight panoramic lift
      const baseZoom = THREE.MathUtils.lerp(a.fromZoom, a.toZoom, e);
      this.zoomLevel = THREE.MathUtils.clamp(
        baseZoom + a.zoomLift * arcFactor,
        this.minZoom,
        this.maxZoom
      );
      this.desiredZoom = a.toZoom;

      if (a.t >= 1) {
        this.targetPosition.copy(a.toPos);
        this.zoomLevel = a.toZoom;
        this.flightAltitude = 0;
        this.motion = null;
      }
      needsUpdate = true;
    } else {
      if (this.flightAltitude !== 0) {
        this.flightAltitude = 0;
        needsUpdate = true;
      }
    }

    // 2. Velocity-based Zoom (Wheel & Zoom Buttons)
    if (Math.abs(this.zoomVelocity) > 0.0001) {
      this.zoomLevel += this.zoomVelocity * delta * 5.0;

      // Elastic boundary cushioning / clamping
      if (this.zoomLevel < this.minZoom) {
        this.zoomLevel = this.minZoom;
        this.zoomVelocity = 0;
      } else if (this.zoomLevel > this.maxZoom) {
        this.zoomLevel = this.maxZoom;
        this.zoomVelocity = 0;
      }

      // Smooth exponential velocity decay
      this.zoomVelocity *= Math.exp(-this.zoomFriction * delta);
      this.desiredZoom = this.zoomLevel;
      needsUpdate = true;
    }

    // 3. Pan Drag Momentum (after releasing mouse drag)
    if (!this.isDragging && !this.motion && this.panVelocity.lengthSq() > 0.1) {
      this.targetPosition.x += this.panVelocity.x * delta;
      this.targetPosition.z += this.panVelocity.y * delta;
      this.targetPosition.x = THREE.MathUtils.clamp(this.targetPosition.x, 20, 980);
      this.targetPosition.z = THREE.MathUtils.clamp(this.targetPosition.z, 20, 980);

      this.panVelocity.multiplyScalar(Math.exp(-this.panFriction * delta));
      needsUpdate = true;
    }

    // 4. Rotation Momentum (after releasing right click or via Q/E keys)
    if (!this.isRotating && Math.abs(this.rotationVelocity) > 0.0005) {
      this.rotationAngle += this.rotationVelocity * delta;
      this.rotationVelocity *= Math.exp(-this.rotationFriction * delta);
      needsUpdate = true;
    }

    if (needsUpdate) {
      this.updateCameraPosition();
    }
  }

  private setupInputEvents() {
    window.addEventListener("resize", () => this.handleResize());
    window.addEventListener("orientationchange", () => {
      setTimeout(() => this.handleResize(), 50);
    });

    const dom = this.renderer.domElement;

    // ============================================================
    // MOBILE MULTI-TOUCH GESTURES (1-Finger Pan & Tap, 2-Finger Pinch-Zoom & Twist-Rotate)
    // ============================================================
    dom.addEventListener("touchstart", (e: TouchEvent) => {
      e.preventDefault();
      this.cancelPanAnim();

      if (e.touches.length === 1) {
        // Single finger: Pan or Tap
        this.isTouching = true;
        this.isPinching = false;
        const touch = e.touches[0];
        this.touchStartX = touch.clientX;
        this.touchStartY = touch.clientY;
        this.lastClientX = touch.clientX;
        this.lastClientY = touch.clientY;
        this.touchDistanceMoved = 0;
        this.lastTouchTimestamp = performance.now();
        this.panVelocity.set(0, 0);
      } else if (e.touches.length >= 2) {
        // Two fingers: Pinch zoom & twist rotate
        this.isPinching = true;
        this.isTouching = false;
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const dx = t2.clientX - t1.clientX;
        const dy = t2.clientY - t1.clientY;
        this.lastPinchDistance = Math.hypot(dx, dy);
        this.lastPinchAngle = Math.atan2(dy, dx);
        this.zoomVelocity = 0;
        this.rotationVelocity = 0;
        this.lastRotateTimestamp = performance.now();
      }
    }, { passive: false });

    window.addEventListener("touchmove", (e: TouchEvent) => {
      if (this.isPinching && e.touches.length >= 2) {
        e.preventDefault();
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const dx = t2.clientX - t1.clientX;
        const dy = t2.clientY - t1.clientY;
        const currentDistance = Math.hypot(dx, dy);
        const currentAngle = Math.atan2(dy, dx);

        // 1. Pinch-to-Zoom with smooth sensitivity
        if (this.lastPinchDistance > 0) {
          const distDelta = currentDistance - this.lastPinchDistance;
          // Moving apart zooms in (decreases zoomLevel)
          const zoomDelta = -distDelta * 0.0035 * this.zoomLevel;
          this.zoomLevel = THREE.MathUtils.clamp(
            this.zoomLevel + zoomDelta,
            this.minZoom,
            this.maxZoom
          );
          this.desiredZoom = this.zoomLevel;
        }
        this.lastPinchDistance = currentDistance;

        // 2. Twist-to-Rotate with angular momentum
        let angleDelta = currentAngle - this.lastPinchAngle;
        while (angleDelta > Math.PI) angleDelta -= Math.PI * 2;
        while (angleDelta < -Math.PI) angleDelta += Math.PI * 2;

        const now = performance.now();
        const dt = Math.max(0.001, (now - this.lastRotateTimestamp) / 1000);
        this.lastRotateTimestamp = now;

        this.rotationAngle += angleDelta;
        const instRotVel = THREE.MathUtils.clamp(angleDelta / dt, -10, 10);
        this.rotationVelocity = this.rotationVelocity * 0.35 + instRotVel * 0.65;
        this.lastPinchAngle = currentAngle;

        this.updateCameraPosition();
      } else if (this.isTouching && e.touches.length === 1) {
        e.preventDefault();
        const touch = e.touches[0];
        const dx = touch.clientX - this.touchStartX;
        const dy = touch.clientY - this.touchStartY;
        const moveDist = Math.hypot(dx, dy);
        this.touchDistanceMoved += moveDist;

        this.lastClientX = touch.clientX;
        this.lastClientY = touch.clientY;

        const now = performance.now();
        const dt = Math.max(0.001, (now - this.lastTouchTimestamp) / 1000);
        this.lastTouchTimestamp = now;

        // Pan displacement aligned with current camera rotation
        const panFactor = 0.15 * this.zoomLevel;
        const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.rotationAngle);
        const right = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.rotationAngle);

        const deltaPos = new THREE.Vector3();
        deltaPos.addScaledVector(right, -dx * panFactor);
        deltaPos.addScaledVector(forward, dy * panFactor);

        this.targetPosition.add(deltaPos);
        this.targetPosition.x = THREE.MathUtils.clamp(this.targetPosition.x, 20, 980);
        this.targetPosition.z = THREE.MathUtils.clamp(this.targetPosition.z, 20, 980);

        // Momentum velocity calculation for flick release
        const vx = THREE.MathUtils.clamp(deltaPos.x / dt, -450, 450);
        const vz = THREE.MathUtils.clamp(deltaPos.z / dt, -450, 450);
        this.panVelocity.x = this.panVelocity.x * 0.35 + vx * 0.65;
        this.panVelocity.y = this.panVelocity.y * 0.35 + vz * 0.65;

        this.touchStartX = touch.clientX;
        this.touchStartY = touch.clientY;
        this.updateCameraPosition();
      }
    }, { passive: false });

    const handleTouchEnd = (e: TouchEvent) => {
      if (this.isPinching) {
        if (e.touches.length < 2) {
          this.isPinching = false;
          if (e.touches.length === 1) {
            // Seamlessly fall back to single-finger pan
            this.isTouching = true;
            this.touchStartX = e.touches[0].clientX;
            this.touchStartY = e.touches[0].clientY;
            this.touchDistanceMoved = 50; // Prevent tap trigger
            this.lastTouchTimestamp = performance.now();
            this.panVelocity.set(0, 0);
          }
        }
      }

      if (this.isTouching && e.touches.length === 0) {
        this.isTouching = false;
        const timeSinceMove = (performance.now() - this.lastTouchTimestamp) / 1000;
        if (timeSinceMove > 0.08) {
          this.panVelocity.set(0, 0);
        }

        // Tap Raycast Trigger (if finger moved less than 10px, it is a deliberate tap)
        if (this.touchDistanceMoved < 10) {
          const rect = dom.getBoundingClientRect();
          this.mouse.x = ((this.lastClientX - rect.left) / rect.width) * 2 - 1;
          this.mouse.y = -((this.lastClientY - rect.top) / rect.height) * 2 + 1;
          this.performRaycast(true, 0);
        }
      }
    };

    window.addEventListener("touchend", handleTouchEnd);
    window.addEventListener("touchcancel", handleTouchEnd);

    dom.addEventListener("mousedown", (e) => {
      this.dragStartX = e.clientX;
      this.dragStartY = e.clientY;
      this.dragDistance = 0;

      if (e.button === 0) {
        this.isDragging = true;
        this.panVelocity.set(0, 0);
        this.lastDragTimestamp = performance.now();
        this.cancelPanAnim();
      } else if (e.button === 2) {
        this.isRotating = true;
        this.rotationVelocity = 0;
        this.lastRotateTimestamp = performance.now();
        this.cancelPanAnim();
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

        const now = performance.now();
        const dt = Math.max(0.001, (now - this.lastDragTimestamp) / 1000);
        this.lastDragTimestamp = now;

        // Pan speed scaled by zoom level
        const panFactor = 0.15 * this.zoomLevel;
        const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.rotationAngle);
        const right = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.rotationAngle);

        const deltaPos = new THREE.Vector3();
        deltaPos.addScaledVector(right, -dx * panFactor);
        deltaPos.addScaledVector(forward, dy * panFactor);

        this.targetPosition.add(deltaPos);
        this.targetPosition.x = THREE.MathUtils.clamp(this.targetPosition.x, 20, 980);
        this.targetPosition.z = THREE.MathUtils.clamp(this.targetPosition.z, 20, 980);

        // Compute velocity for inertia release (clamped to prevent runaway flick)
        const vx = THREE.MathUtils.clamp(deltaPos.x / dt, -400, 400);
        const vz = THREE.MathUtils.clamp(deltaPos.z / dt, -400, 400);
        this.panVelocity.x = this.panVelocity.x * 0.35 + vx * 0.65;
        this.panVelocity.y = this.panVelocity.y * 0.35 + vz * 0.65;

        this.dragStartX = e.clientX;
        this.dragStartY = e.clientY;
        this.cancelPanAnim();
        this.updateCameraPosition();
      } else if (this.isRotating) {
        const dx = e.clientX - this.dragStartX;
        const deltaAngle = -dx * 0.006;
        this.rotationAngle += deltaAngle;

        const now = performance.now();
        const dt = Math.max(0.001, (now - this.lastRotateTimestamp) / 1000);
        this.lastRotateTimestamp = now;

        // Compute angular velocity for inertia release (clamped to prevent runaway spin)
        const instantAngVel = THREE.MathUtils.clamp(deltaAngle / dt, -12, 12);
        this.rotationVelocity = this.rotationVelocity * 0.35 + instantAngVel * 0.65;

        this.dragStartX = e.clientX;
        this.dragStartY = e.clientY;
        this.cancelPanAnim();
        this.updateCameraPosition();
      } else {
        // Tile hover raycast
        this.performRaycast(false);
      }
    });

    window.addEventListener("mouseup", (e) => {
      if (e.button === 0) {
        this.isDragging = false;
        // If mouse was held stationary before release, stop momentum
        const timeSinceMove = (performance.now() - this.lastDragTimestamp) / 1000;
        if (timeSinceMove > 0.08) {
          this.panVelocity.set(0, 0);
        }
        // If minimal drag distance, count as click
        if (this.dragDistance < 5) {
          this.performRaycast(true, e.button);
        }
      } else if (e.button === 2) {
        this.isRotating = false;
        // If mouse was held stationary before release, stop momentum
        const timeSinceRotate = (performance.now() - this.lastRotateTimestamp) / 1000;
        if (timeSinceRotate > 0.08) {
          this.rotationVelocity = 0;
        }
      }
    });

    // Prevent context menu on right click
    dom.addEventListener("contextmenu", (e) => e.preventDefault());

    // Mouse wheel zoom with physical velocity & momentum
    dom.addEventListener("wheel", (e) => {
      e.preventDefault();
      if (this.motion) {
        this.cancelPanAnim();
      }

      const rawDelta = e.deltaY;
      const sign = Math.sign(rawDelta);
      // Normalize wheel delta across touchpads and mechanical wheels
      const magnitude = Math.min(Math.abs(rawDelta) * 0.002, 0.32);
      const impulse = sign * magnitude * (this.zoomLevel * 1.05);

      this.zoomVelocity += impulse;
      // Clamp velocity to prevent wild runaway zoom
      this.zoomVelocity = THREE.MathUtils.clamp(
        this.zoomVelocity,
        -1.8 * this.zoomLevel,
        1.8 * this.zoomLevel
      );
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
    if (this.keysDown.size === 0 && this.keyboardVelocity.lengthSq() < 0.05) {
      this.keyboardVelocity.set(0, 0, 0);
      return;
    }

    const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.rotationAngle);
    const right = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.rotationAngle);
    const inputDir = new THREE.Vector3(0, 0, 0);

    if (this.keysDown.has("w") || this.keysDown.has("arrowup")) inputDir.add(forward);
    if (this.keysDown.has("s") || this.keysDown.has("arrowdown")) inputDir.sub(forward);
    if (this.keysDown.has("a") || this.keysDown.has("arrowleft")) inputDir.sub(right);
    if (this.keysDown.has("d") || this.keysDown.has("arrowright")) inputDir.add(right);

    // Keyboard rotation with Q / E keys
    if (this.keysDown.has("q")) {
      this.cancelPanAnim();
      this.rotationVelocity = THREE.MathUtils.clamp(
        this.rotationVelocity + 14.0 * delta,
        -3.5,
        3.5
      );
    }
    if (this.keysDown.has("e")) {
      this.cancelPanAnim();
      this.rotationVelocity = THREE.MathUtils.clamp(
        this.rotationVelocity - 14.0 * delta,
        -3.5,
        3.5
      );
    }

    if (inputDir.lengthSq() > 0) {
      inputDir.normalize();
      this.cancelPanAnim();
      this.panVelocity.set(0, 0);
      const targetSpeed = 75 * this.zoomLevel;
      // Exponential approach to targetSpeed
      this.keyboardVelocity.lerp(inputDir.multiplyScalar(targetSpeed), 1 - Math.exp(-12 * delta));
    } else {
      // Smooth deceleration
      this.keyboardVelocity.multiplyScalar(Math.exp(-this.keyboardFriction * delta));
    }

    if (this.keyboardVelocity.lengthSq() > 0.05) {
      this.targetPosition.addScaledVector(this.keyboardVelocity, delta);
      this.targetPosition.x = THREE.MathUtils.clamp(this.targetPosition.x, 20, 980);
      this.targetPosition.z = THREE.MathUtils.clamp(this.targetPosition.z, 20, 980);
      this.updateCameraPosition();
    }
  }

  private startRenderLoop() {
    const loop = (timestamp: number) => {
      requestAnimationFrame(loop);

      const delta = (timestamp - this.lastTime) / 1000;
      this.lastTime = timestamp;

      this.updateKeyboardMovement(delta);
      this.updateCameraMotion(delta);

      // Animate Beacon and Rotating props
      if (this.beaconGroup.children.length > 0) {
        if (this.beaconRing) {
          const pulse = 1.0 + 0.18 * Math.sin(timestamp * 0.005);
          this.beaconRing.scale.set(pulse, pulse, 1);
        }
      }

      // Animate Selection Square Marker (breathing neon glow & subtle floating hover)
      if (this.selectionMarkerGroup.children.length > 0) {
        const pulse = 0.55 + 0.45 * Math.sin(timestamp * 0.007);
        const floatBob = 0.02 * Math.sin(timestamp * 0.005);
        this.selectionMarkerGroup.position.y = floatBob;
        if (this.selectionMarkerMaterial) {
          this.selectionMarkerMaterial.opacity = 0.65 + 0.35 * pulse;
        }
        if (this.selectionMarkerInnerMat) {
          this.selectionMarkerInnerMat.opacity = 0.15 + 0.12 * pulse;
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
