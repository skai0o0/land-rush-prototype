import * as THREE from "three";

export const FOW_MAP_SIZE = 1000;
export const FOW_CANVAS_SIZE = 512;
export const HQ_REVEAL_RADIUS = 18;
export const LANDMARK_REVEAL_RADIUS = 14;
export const CLAIMED_BORDER_RADIUS = 2;

export interface ExplorationStats {
  revealedCount: number;
  totalTiles: number;
  percentage: number;
}

interface BeaconPulse {
  mesh: THREE.Group;
  ring: THREE.Mesh;
  beam?: THREE.Mesh;
  ringMat: THREE.MeshBasicMaterial;
  beamMat?: THREE.MeshBasicMaterial;
  x: number;
  z: number;
  startTime: number;
  duration: number;
  maxRadius: number;
  active: boolean;
}

export class FogOfWarManager {
  public group: THREE.Group = new THREE.Group();

  // Dense binary vision state: 1 = revealed, 0 = unexplored
  private revealedState: Uint8Array = new Uint8Array(FOW_MAP_SIZE * FOW_MAP_SIZE);
  private revealedCount: number = 0;

  // Dynamic 2D canvas mask for 3D shader and MiniMap overlay
  public fogCanvas: HTMLCanvasElement;
  private fogCtx: CanvasRenderingContext2D;
  public fogCanvasTexture: THREE.CanvasTexture;

  // 3D Cyber Mist Mesh & Shader
  private fogPlane: THREE.Mesh;
  private fogShaderMaterial: THREE.ShaderMaterial;

  // Dirty flags & throttle for GPU texture upload
  private textureNeedsUpdate: boolean = false;
  private lastTextureUpdateTime: number = 0;

  // Beacon Light Pulse Pool
  private pulsePool: BeaconPulse[] = [];
  private readonly MAX_ACTIVE_PULSES = 30;

  // Callbacks
  public onExplorationChanged?: (stats: ExplorationStats) => void;
  public onTilesRevealed?: (tiles: { x: number; y: number }[]) => void;

  constructor() {
    this.group.name = "FogOfWarManagerGroup";

    // 1. Initialize Offscreen 2D Fog Canvas
    this.fogCanvas = document.createElement("canvas");
    this.fogCanvas.width = FOW_CANVAS_SIZE;
    this.fogCanvas.height = FOW_CANVAS_SIZE;
    this.fogCtx = this.fogCanvas.getContext("2d", { willReadFrequently: false })!;

    // Initial state: Completely covered in dense dark cyber mist (#070b14)
    this.fogCtx.fillStyle = "#070b14";
    this.fogCtx.fillRect(0, 0, FOW_CANVAS_SIZE, FOW_CANVAS_SIZE);

    // 2. Create Canvas Texture for 3D Shader
    this.fogCanvasTexture = new THREE.CanvasTexture(this.fogCanvas);
    this.fogCanvasTexture.minFilter = THREE.LinearFilter;
    this.fogCanvasTexture.magFilter = THREE.LinearFilter;
    this.fogCanvasTexture.generateMipmaps = false;
    // Align texture coordinate 1:1 with world XZ plane (0..1000)
    this.fogCanvasTexture.flipY = false;

    // 3. Create Predator Cyber Mist Custom Shader Material
    const vertexShader = `
      varying vec2 vUv;
      varying vec3 vWorldPosition;
      uniform float uTime;

      void main() {
        vUv = uv;
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        // Subtle organic undulating height motion (y = 1.2 +/- 0.15)
        worldPos.y += sin(worldPos.x * 0.04 + uTime * 0.7) * cos(worldPos.z * 0.04 + uTime * 0.5) * 0.15;
        vWorldPosition = worldPos.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `;

    const fragmentShader = `
      uniform sampler2D uFogMask;
      uniform float uTime;
      uniform vec3 uFogBaseColor;
      uniform vec3 uFogDeepColor;
      uniform vec3 uEdgeGlowColor;
      uniform float uOpacity;
      varying vec2 vUv;
      varying vec3 vWorldPosition;

      void main() {
        // Sample Fog Canvas alpha / luminance
        // On our canvas:
        // Fully unexplored areas have alpha = 1.0 (#070b14)
        // Fully revealed areas have alpha = 0.0 (carved out via destination-out)
        vec4 maskSample = texture2D(uFogMask, vUv);
        float maskAlpha = maskSample.a;

        // Discard fragments in fully revealed areas to save GPU fillrate
        if (maskAlpha <= 0.015) {
          discard;
        }

        // Predator Cyber Mist 2-tier scrolling UV coordinates
        vec2 mistUV1 = vUv * 42.0 + vec2(uTime * 0.012, uTime * 0.009);
        vec2 mistUV2 = vUv * 75.0 - vec2(uTime * 0.016, uTime * 0.011);

        // Procedural continuous mist clouds using coupled sine waves
        float wave1 = sin(mistUV1.x + sin(mistUV1.y * 1.3));
        float wave2 = cos(mistUV2.x * 1.25 - cos(mistUV2.y * 0.9));
        float cloudNoise = (wave1 + wave2) * 0.25 + 0.5; // Normalized to [0.0, 1.0]

        // Base metallic carbon cyber mist color
        vec3 mistColor = mix(uFogDeepColor, uFogBaseColor, cloudNoise);

        // Edge Glow: High-tech Predator Neon Cyan border along the vision frontier
        // Frontier is where maskAlpha transitions between 0.03 and 0.55
        float edgeFrontier = smoothstep(0.02, 0.35, maskAlpha) * (1.0 - smoothstep(0.35, 0.85, maskAlpha));
        mistColor += uEdgeGlowColor * edgeFrontier * 0.8;

        // Alpha calculation with soft cloud density
        float finalAlpha = maskAlpha * uOpacity * (0.82 + 0.18 * cloudNoise);

        gl_FragColor = vec4(mistColor, finalAlpha);
      }
    `;

    this.fogShaderMaterial = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uFogMask: { value: this.fogCanvasTexture },
        uTime: { value: 0 },
        uFogBaseColor: { value: new THREE.Color("#0b1220") }, // Predator Deep Cyber Metallic
        uFogDeepColor: { value: new THREE.Color("#050811") }, // Dark Carbon Mist
        uEdgeGlowColor: { value: new THREE.Color("#00ffe8") }, // Predator Neon Cyan Glow
        uOpacity: { value: 0.92 }
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide
    });

    // 4. Create 3D Mesh Plane hovering at altitude y = 1.2
    // Plane is 1000x1000, centered at (500, 1.2, 500)
    const planeGeo = new THREE.PlaneGeometry(FOW_MAP_SIZE, FOW_MAP_SIZE, 32, 32);
    this.fogPlane = new THREE.Mesh(planeGeo, this.fogShaderMaterial);
    this.fogPlane.position.set(500, 1.2, 500);
    this.fogPlane.rotation.x = -Math.PI / 2;
    this.fogPlane.name = "PredatorCyberMistPlane";
    this.group.add(this.fogPlane);

    // 5. Initialize Beacon Light Pulse Pool
    this.initPulsePool();
  }

  // ============================================================
  // BEACON LIGHT PULSE EFFECT (Xua tan sương mù)
  // ============================================================

  private initPulsePool(): void {
    const ringGeo = new THREE.RingGeometry(0.3, 0.75, 24);
    ringGeo.rotateX(-Math.PI / 2);

    const beamGeo = new THREE.CylinderGeometry(0.12, 0.38, 14, 16);
    beamGeo.translate(0, 7, 0);

    for (let i = 0; i < this.MAX_ACTIVE_PULSES; i++) {
      const pulseGroup = new THREE.Group();
      pulseGroup.visible = false;

      const ringMat = new THREE.MeshBasicMaterial({
        color: 0x00ffe8,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      pulseGroup.add(ringMesh);

      const beamMat = new THREE.MeshBasicMaterial({
        color: 0x00e5ff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      const beamMesh = new THREE.Mesh(beamGeo, beamMat);
      pulseGroup.add(beamMesh);

      this.group.add(pulseGroup);

      this.pulsePool.push({
        mesh: pulseGroup,
        ring: ringMesh,
        beam: beamMesh,
        ringMat,
        beamMat,
        x: 0,
        z: 0,
        startTime: 0,
        duration: 900,
        maxRadius: 4.5,
        active: false
      });
    }
  }

  public spawnBeaconPulse(x: number, z: number, colorHex: number | string = 0x00ffe8): void {
    let pulse = this.pulsePool.find((p) => !p.active);
    if (!pulse) {
      // Re-use oldest pulse if pool exhausted
      pulse = this.pulsePool[0];
    }

    pulse.active = true;
    pulse.x = x;
    pulse.z = z;
    pulse.startTime = performance.now();
    pulse.duration = 850;
    pulse.maxRadius = 4.2;

    const col = new THREE.Color(colorHex);
    pulse.ringMat.color.copy(col);
    if (pulse.beamMat) pulse.beamMat.color.copy(col);

    pulse.mesh.position.set(x, 0.3, z);
    pulse.mesh.visible = true;
    pulse.ring.scale.set(0.2, 0.2, 0.2);
    pulse.ringMat.opacity = 0.95;
    if (pulse.beamMat) pulse.beamMat.opacity = 0.8;
  }

  // ============================================================
  // VISION & EXPLORATION MANAGEMENT
  // ============================================================

  public isRevealed(x: number, z: number): boolean {
    if (x < 0 || x >= FOW_MAP_SIZE || z < 0 || z >= FOW_MAP_SIZE) {
      return false;
    }
    return this.revealedState[z * FOW_MAP_SIZE + x] === 1;
  }

  public getExplorationStats(): ExplorationStats {
    const totalTiles = FOW_MAP_SIZE * FOW_MAP_SIZE;
    const percentage = parseFloat(((this.revealedCount / totalTiles) * 100).toFixed(2));
    return {
      revealedCount: this.revealedCount,
      totalTiles,
      percentage
    };
  }

  /**
   * Reveal a circular zone on the map (Euclidean distance)
   */
  public revealCircle(
    centerX: number,
    centerY: number,
    radius: number,
    triggerPulse: boolean = false
  ): { x: number; y: number }[] {
    const newlyRevealed: { x: number; y: number }[] = [];
    const minX = Math.max(0, Math.floor(centerX - radius));
    const maxX = Math.min(FOW_MAP_SIZE - 1, Math.ceil(centerX + radius));
    const minY = Math.max(0, Math.floor(centerY - radius));
    const maxY = Math.min(FOW_MAP_SIZE - 1, Math.ceil(centerY + radius));
    const rSq = radius * radius;

    for (let y = minY; y <= maxY; y++) {
      const dy = y - centerY;
      const rowOffset = y * FOW_MAP_SIZE;
      for (let x = minX; x <= maxX; x++) {
        const dx = x - centerX;
        if (dx * dx + dy * dy <= rSq) {
          const idx = rowOffset + x;
          if (this.revealedState[idx] === 0) {
            this.revealedState[idx] = 1;
            this.revealedCount++;
            newlyRevealed.push({ x, y });
          }
        }
      }
    }

    if (newlyRevealed.length > 0) {
      this.carveHoleOnCanvas(centerX, centerY, radius);
      this.textureNeedsUpdate = true;

      if (triggerPulse) {
        this.spawnBeaconPulse(centerX, centerY);
      }

      this.onExplorationChanged?.(this.getExplorationStats());
      this.onTilesRevealed?.(newlyRevealed);
    }

    return newlyRevealed;
  }

  /**
   * Carve vision hole onto offscreen 2D canvas with soft radial gradient
   */
  private carveHoleOnCanvas(centerX: number, centerY: number, radius: number): void {
    const scale = FOW_CANVAS_SIZE / FOW_MAP_SIZE;
    const cx = centerX * scale;
    const cy = centerY * scale;
    const r = radius * scale;

    this.fogCtx.save();
    this.fogCtx.globalCompositeOperation = "destination-out";

    // Radial gradient: complete cutout in center, smooth mist feathering at edge
    const grad = this.fogCtx.createRadialGradient(cx, cy, Math.max(0, r * 0.5), cx, cy, r);
    grad.addColorStop(0, "rgba(0, 0, 0, 1.0)");
    grad.addColorStop(0.72, "rgba(0, 0, 0, 0.85)");
    grad.addColorStop(1, "rgba(0, 0, 0, 0.0)");

    this.fogCtx.fillStyle = grad;
    this.fogCtx.beginPath();
    this.fogCtx.arc(cx, cy, r, 0, Math.PI * 2);
    this.fogCtx.fill();
    this.fogCtx.restore();
  }

  /**
   * Reveal 5 Headquarters (Radius ~18 tiles)
   */
  public revealHQs(hqs: { schoolId?: string; x: number; y: number }[]): void {
    for (const hq of hqs) {
      this.revealCircle(hq.x, hq.y, HQ_REVEAL_RADIUS, false);
    }
  }

  /**
   * Reveal 10 Landmarks (Radius ~14 tiles from center/footprint)
   */
  public revealLandmarks(
    landmarks: { x: number; y: number; width?: number; height?: number }[]
  ): void {
    for (const lm of landmarks) {
      const w = lm.width || 14;
      const h = lm.height || 12;
      const cx = lm.x + Math.floor(w / 2);
      const cy = lm.y + Math.floor(h / 2);
      const radius = LANDMARK_REVEAL_RADIUS + Math.max(w, h) / 2;
      this.revealCircle(cx, cy, radius, false);
    }
  }

  /**
   * Reveal a claimed Knowledge Zone tile (+2 tiles border vision)
   */
  public revealClaimedTile(x: number, y: number, triggerPulse: boolean = true): { x: number; y: number }[] {
    const newly = this.revealCircle(x, y, CLAIMED_BORDER_RADIUS + 0.6, triggerPulse);
    return newly;
  }

  /**
   * Full dense snapshot sync from LandState owner bytes
   */
  public syncAllClaimedTiles(ownerBytes: Uint8Array): { x: number; y: number }[] {
    if (!ownerBytes || ownerBytes.length !== FOW_MAP_SIZE * FOW_MAP_SIZE) return [];

    const newlyRevealed: { x: number; y: number }[] = [];
    const r = CLAIMED_BORDER_RADIUS;

    for (let y = 0; y < FOW_MAP_SIZE; y++) {
      const rowOffset = y * FOW_MAP_SIZE;
      for (let x = 0; x < FOW_MAP_SIZE; x++) {
        if (ownerBytes[rowOffset + x] > 0) {
          // Claimed tile: reveal radius 2
          const minX = Math.max(0, x - r);
          const maxX = Math.min(FOW_MAP_SIZE - 1, x + r);
          const minY = Math.max(0, y - r);
          const maxY = Math.min(FOW_MAP_SIZE - 1, y + r);

          for (let cy = minY; cy <= maxY; cy++) {
            const crow = cy * FOW_MAP_SIZE;
            for (let cx = minX; cx <= maxX; cx++) {
              const idx = crow + cx;
              if (this.revealedState[idx] === 0) {
                this.revealedState[idx] = 1;
                this.revealedCount++;
                newlyRevealed.push({ x: cx, y: cy });
              }
            }
          }

          // Carve on canvas
          this.carveHoleOnCanvas(x, y, r + 0.5);
        }
      }
    }

    if (newlyRevealed.length > 0) {
      this.textureNeedsUpdate = true;
      this.onExplorationChanged?.(this.getExplorationStats());
      this.onTilesRevealed?.(newlyRevealed);
    }

    return newlyRevealed;
  }

  // ============================================================
  // FRAME UPDATE LOOP
  // ============================================================

  public update(delta: number, now: number): void {
    // 1. Update Cyber Mist Shader Time uniform for dynamic rolling waves
    this.fogShaderMaterial.uniforms.uTime.value += delta;

    // 2. Throttle GPU CanvasTexture upload to keep stable 60 FPS
    if (this.textureNeedsUpdate && now - this.lastTextureUpdateTime > 40) {
      this.fogCanvasTexture.needsUpdate = true;
      this.textureNeedsUpdate = false;
      this.lastTextureUpdateTime = now;
    }

    // 3. Animate Beacon Light Pulses
    for (let i = 0; i < this.pulsePool.length; i++) {
      const pulse = this.pulsePool[i];
      if (!pulse.active) continue;

      const elapsed = now - pulse.startTime;
      const progress = Math.min(1.0, elapsed / pulse.duration);

      if (progress >= 1.0) {
        pulse.active = false;
        pulse.mesh.visible = false;
        continue;
      }

      // Ease out cubic
      const ease = 1 - Math.pow(1 - progress, 3);
      const currentRadius = 0.3 + pulse.maxRadius * ease;

      pulse.ring.scale.set(currentRadius, currentRadius, 1);
      pulse.ringMat.opacity = Math.max(0, 0.95 * (1.0 - progress));

      if (pulse.beam && pulse.beamMat) {
        pulse.beam.scale.set(1.0 - progress * 0.6, 1.0 + progress * 0.8, 1.0 - progress * 0.6);
        pulse.beamMat.opacity = Math.max(0, 0.8 * Math.pow(1.0 - progress, 2));
      }
    }
  }

  public setMistVisible(visible: boolean): void {
    this.fogPlane.visible = visible;
  }
}
