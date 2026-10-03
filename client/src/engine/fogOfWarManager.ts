import * as THREE from "three";
import { expandRect, getHQRect, getLandmarkRect } from "../../../shared/constants/footprint";

export const FOW_MAP_SIZE = 1000;

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
  public static instance: FogOfWarManager | null = null;
  public group: THREE.Group = new THREE.Group();

  // Dense binary vision state: 255 = revealed, 0 = unexplored
  private revealedState: Uint8Array = new Uint8Array(FOW_MAP_SIZE * FOW_MAP_SIZE);
  private revealedCount: number = 0;

  // Reveal time state (seconds) for GPU vein melt animation
  private revealTimeState: Float32Array = new Float32Array(FOW_MAP_SIZE * FOW_MAP_SIZE);
  public revealTimeTexture: THREE.DataTexture;
  private revealTimeNeedsUpdate: boolean = false;

  // GPU Data Texture
  public fogDataTexture: THREE.DataTexture;

  // MiniMap Canvas
  public fogCanvas: HTMLCanvasElement;
  private fogCtx: CanvasRenderingContext2D;
  private lastMiniMapUpdateTime: number = 0;

  // 3D Cyber Mist Mesh & Shader
  private fogPlane: THREE.Mesh;
  private fogShaderMaterial: THREE.ShaderMaterial;

  // World-space Fog of War Shader Uniforms
  public fogColorUniform = { value: new THREE.Color("#cfd8e3") };
  public maxAlphaUniform = { value: 0.6 };
  public timeUniform = { value: 0 };
  public edgeSoftnessUniform = { value: 1.5 }; // Default 1.5 tiles, max 2.0 tiles
  public meltDurationUniform = { value: 1.0 }; // Default 1.0 second
  private isFogVisible: boolean = true;
  private currentAlpha: number = 0.6;

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
    FogOfWarManager.instance = this;
    this.group.name = "FogOfWarManagerGroup";

    // 1. Setup Data Texture for 3D Shader
    this.fogDataTexture = new THREE.DataTexture(this.revealedState as any, FOW_MAP_SIZE, FOW_MAP_SIZE, THREE.RedFormat, THREE.UnsignedByteType);
    this.fogDataTexture.minFilter = THREE.LinearFilter;
    this.fogDataTexture.magFilter = THREE.LinearFilter;
    this.fogDataTexture.flipY = false;

    // 1b. Setup Float Data Texture for GPU Vein Melt (Reveal Time in seconds)
    this.revealTimeTexture = new THREE.DataTexture(
      this.revealTimeState as any,
      FOW_MAP_SIZE,
      FOW_MAP_SIZE,
      THREE.RedFormat,
      THREE.FloatType
    );
    this.revealTimeTexture.minFilter = THREE.NearestFilter;
    this.revealTimeTexture.magFilter = THREE.NearestFilter;
    this.revealTimeTexture.generateMipmaps = false;
    this.revealTimeTexture.flipY = false;

    // 2. Setup Canvas for MiniMap
    this.fogCanvas = document.createElement("canvas");
    this.fogCanvas.width = 256;
    this.fogCanvas.height = 256;
    this.fogCtx = this.fogCanvas.getContext("2d", { willReadFrequently: false })!;
    this.fogCtx.fillStyle = "#d1d5db";
    this.fogCtx.fillRect(0, 0, 256, 256);

    // 3. Create Custom Shader Material
    const vertexShader = `
      varying vec2 vUv;
      varying vec3 vWorldPosition;
      uniform float uTime;

      void main() {
        vUv = uv;
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        worldPos.y += sin(worldPos.x * 0.04 + uTime * 0.7) * cos(worldPos.z * 0.04 + uTime * 0.5) * 0.15;
        vWorldPosition = worldPos.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `;

    const fragmentShader = `
      uniform sampler2D uFogMask;
      uniform float uTime;
      uniform vec3 uFogColor;
      uniform float uMaxAlpha;
      varying vec2 vUv;
      varying vec3 vWorldPosition;

      void main() {
        // Red channel contains the revealed state: 0.0 = fog, 1.0 = revealed
        float revealed = texture2D(uFogMask, vUv).r;
        
        // maskAlpha is inverse of revealed
        float maskAlpha = 1.0 - revealed;

        if (maskAlpha <= 0.10) {
          discard;
        }

        vec2 mistUV1 = vUv * 36.0 + vec2(uTime * 0.008, uTime * 0.006);
        vec2 mistUV2 = vUv * 64.0 - vec2(uTime * 0.010, uTime * 0.007);

        float wave1 = sin(mistUV1.x + sin(mistUV1.y * 1.3));
        float wave2 = cos(mistUV2.x * 1.25 - cos(mistUV2.y * 0.9));
        float mistNoise = (wave1 + wave2) * 0.25 + 0.5;

        // Simplify colors based on uniform uFogColor
        vec3 mistColor = mix(uFogColor * 0.8, uFogColor, mistNoise);

        float edgeFrontier = smoothstep(0.02, 0.35, maskAlpha) * (1.0 - smoothstep(0.35, 0.85, maskAlpha));
        mistColor += vec3(1.0) * edgeFrontier * 0.3;

        float finalAlpha = maskAlpha * uMaxAlpha;

        gl_FragColor = vec4(mistColor, finalAlpha);
      }
    `;

    this.fogShaderMaterial = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uFogMask: { value: this.fogDataTexture },
        uTime: this.timeUniform,
        uFogColor: this.fogColorUniform,
        uMaxAlpha: this.maxAlphaUniform
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide
    });

    const planeGeo = new THREE.PlaneGeometry(FOW_MAP_SIZE, FOW_MAP_SIZE, 32, 32);
    this.fogPlane = new THREE.Mesh(planeGeo, this.fogShaderMaterial);
    this.fogPlane.position.set(500, 9.5, 500);
    this.fogPlane.rotation.x = -Math.PI / 2;
    this.fogPlane.name = "SeaOfCloudsPlane";
    this.fogPlane.visible = false; // Hide legacy fog plane to remove parallax error
    this.group.add(this.fogPlane);

    this.initPulsePool();
  }

  // ============================================================
  // BEACON LIGHT PULSE EFFECT
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
        color: 0xfef08a,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      pulseGroup.add(ringMesh);

      const beamMat = new THREE.MeshBasicMaterial({
        color: 0xfffbe8,
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

  public spawnBeaconPulse(x: number, z: number, colorHex: number | string = 0xfef08a): void {
    let pulse = this.pulsePool.find((p) => !p.active);
    if (!pulse) {
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
    return this.revealedState[z * FOW_MAP_SIZE + x] === 255;
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

  public revealRect(minX: number, minY: number, maxX: number, maxY: number, triggerPulse: boolean = false, isLive: boolean = false): { x: number; y: number }[] {
    const newlyRevealed: { x: number; y: number }[] = [];
    minX = Math.max(0, Math.floor(minX));
    maxX = Math.min(FOW_MAP_SIZE - 1, Math.ceil(maxX));
    minY = Math.max(0, Math.floor(minY));
    maxY = Math.min(FOW_MAP_SIZE - 1, Math.ceil(maxY));
    const nowSec = isLive ? performance.now() * 0.001 : 0;

    for (let y = minY; y <= maxY; y++) {
      const rowOffset = y * FOW_MAP_SIZE;
      for (let x = minX; x <= maxX; x++) {
        const idx = rowOffset + x;
        if (this.revealedState[idx] === 0) {
          this.revealedState[idx] = 255;
          if (isLive) {
            this.revealTimeState[idx] = nowSec;
            this.revealTimeNeedsUpdate = true;
          }
          this.revealedCount++;
          newlyRevealed.push({ x, y });
        }
      }
    }

    if (newlyRevealed.length > 0) {
      this.textureNeedsUpdate = true;
      this.onExplorationChanged?.(this.getExplorationStats());
      this.onTilesRevealed?.(newlyRevealed);
    }

    if (triggerPulse) {
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      this.spawnBeaconPulse(cx, cy);
    }

    return newlyRevealed;
  }

  public revealHQs(hqs: { schoolId?: string; x: number; y: number }[]): void {
    for (const hq of hqs) {
      const bounds = expandRect(getHQRect(hq.x, hq.y));
      this.revealRect(bounds.minX, bounds.minY, bounds.maxX, bounds.maxY, false);
    }
  }

  public revealLandmarks(
    landmarks: { x: number; y: number; width?: number; height?: number }[]
  ): void {
    for (const lm of landmarks) {
      const w = lm.width || 14;
      const h = lm.height || 12;
      const bounds = expandRect(getLandmarkRect(lm.x, lm.y, w, h));
      this.revealRect(bounds.minX, bounds.minY, bounds.maxX, bounds.maxY, false);
    }
  }

  public revealClaimedTile(x: number, y: number, triggerPulse: boolean = true): { x: number; y: number }[] {
    return this.revealRect(x - 2, y - 2, x + 2, y + 2, triggerPulse, true);
  }

  public revealCircle(cx: number, cy: number, radius: number = 7): { x: number; y: number }[] {
    return this.revealRect(cx - radius, cy - radius, cx + radius, cy + radius, true, true);
  }

  public syncAllClaimedTiles(ownerBytes: Uint8Array): { x: number; y: number }[] {
    if (!ownerBytes || ownerBytes.length !== FOW_MAP_SIZE * FOW_MAP_SIZE) return [];

    const newlyRevealed: { x: number; y: number }[] = [];

    for (let y = 0; y < FOW_MAP_SIZE; y++) {
      const rowOffset = y * FOW_MAP_SIZE;
      for (let x = 0; x < FOW_MAP_SIZE; x++) {
        if (ownerBytes[rowOffset + x] > 0) {
          // Set kernel 5x5 directly
          const minX = Math.max(0, x - 2);
          const maxX = Math.min(FOW_MAP_SIZE - 1, x + 2);
          const minY = Math.max(0, y - 2);
          const maxY = Math.min(FOW_MAP_SIZE - 1, y + 2);

          for (let cy = minY; cy <= maxY; cy++) {
            const crow = cy * FOW_MAP_SIZE;
            for (let cx = minX; cx <= maxX; cx++) {
              const idx = crow + cx;
              if (this.revealedState[idx] === 0) {
                this.revealedState[idx] = 255;
                this.revealedCount++;
                newlyRevealed.push({ x: cx, y: cy });
              }
            }
          }
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

  private updateMiniMapCanvas(): void {
    const scale = FOW_MAP_SIZE / 256;
    const imgData = this.fogCtx.createImageData(256, 256);
    
    for (let cy = 0; cy < 256; cy++) {
      for (let cx = 0; cx < 256; cx++) {
        const mx = Math.floor(cx * scale);
        const my = Math.floor(cy * scale);
        const isRevealed = this.revealedState[my * FOW_MAP_SIZE + mx] === 255;
        
        const i = (cy * 256 + cx) * 4;
        if (isRevealed) {
          imgData.data[i] = 255;
          imgData.data[i+1] = 255;
          imgData.data[i+2] = 255;
          imgData.data[i+3] = 0; // Transparent
        } else {
          imgData.data[i] = 209; // #d1d5db light grey
          imgData.data[i+1] = 213;
          imgData.data[i+2] = 219;
          imgData.data[i+3] = 255; // Solid fog
        }
      }
    }
    this.fogCtx.putImageData(imgData, 0, 0);
  }

  // ============================================================
  // FRAME UPDATE LOOP
  // ============================================================

  public update(delta: number, now: number): void {
    this.timeUniform.value = now * 0.001;
    this.fogShaderMaterial.uniforms.uTime.value += delta;

    if (this.textureNeedsUpdate && now - this.lastTextureUpdateTime > 40) {
      this.fogDataTexture.needsUpdate = true;
      this.textureNeedsUpdate = false;
      this.lastTextureUpdateTime = now;
    }

    if (this.revealTimeNeedsUpdate) {
      this.revealTimeTexture.needsUpdate = true;
      this.revealTimeNeedsUpdate = false;
    }

    if (now - this.lastMiniMapUpdateTime > 250) {
      this.updateMiniMapCanvas();
      this.lastMiniMapUpdateTime = now;
    }

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

  public setEdgeSoftness(softness: number): void {
    this.edgeSoftnessUniform.value = Math.max(0, Math.min(2.0, softness));
  }

  public setMeltDuration(duration: number): void {
    this.meltDurationUniform.value = Math.max(0, duration);
  }

  public setFogAlpha(alpha: number): void {
    this.currentAlpha = alpha;
    if (this.isFogVisible) {
      this.maxAlphaUniform.value = alpha;
    }
  }

  public setFogColor(colorHex: string): void {
    this.fogColorUniform.value.set(colorHex);
  }

  public setMistVisible(visible: boolean): void {
    this.isFogVisible = visible;
    this.maxAlphaUniform.value = visible ? this.currentAlpha : 0;
    this.fogPlane.visible = false;
  }
}
