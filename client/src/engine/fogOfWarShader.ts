import * as THREE from "three";
import type { FogOfWarManager } from "./fogOfWarManager";

/**
 * World-space Fog of War shader injection helper.
 * Injects custom GLSL chunks into materials so they sample the Fog of War DataTexture
 * based on their true world-space XZ coordinates, completely eliminating parallax errors
 * and clipping artifacts caused by planar mesh overlays.
 */
export function applyFogOfWar(material: THREE.Material | THREE.Material[], fowManager: FogOfWarManager): void {
  if (Array.isArray(material)) {
    material.forEach((mat) => applyFogOfWar(mat, fowManager));
    return;
  }
  if (!material) return;

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uFogMask = { value: fowManager.fogDataTexture };
    shader.uniforms.uRevealTimeMask = { value: fowManager.revealTimeTexture };
    shader.uniforms.uFogColor = fowManager.fogColorUniform;
    shader.uniforms.uMaxAlpha = fowManager.maxAlphaUniform;
    shader.uniforms.uFowTime = fowManager.timeUniform;
    shader.uniforms.uEdgeSoftness = fowManager.edgeSoftnessUniform;
    shader.uniforms.uMeltDuration = fowManager.meltDurationUniform;

    shader.vertexShader = `varying vec3 vFowWorld;\n` + shader.vertexShader;

    const worldPosInjection = `#include <worldpos_vertex>
#ifdef USE_INSTANCING
  vFowWorld = (instanceMatrix * vec4(position, 1.0)).xyz;
#else
  vFowWorld = (modelMatrix * vec4(position, 1.0)).xyz;
#endif`;

    if (shader.vertexShader.includes("#include <worldpos_vertex>")) {
      shader.vertexShader = shader.vertexShader.replace("#include <worldpos_vertex>", worldPosInjection);
    } else if (shader.vertexShader.includes("#include <project_vertex>")) {
      shader.vertexShader = shader.vertexShader.replace("#include <project_vertex>", `${worldPosInjection}\n#include <project_vertex>`);
    }

    shader.fragmentShader = `varying vec3 vFowWorld;
uniform sampler2D uFogMask;
uniform sampler2D uRevealTimeMask;
uniform vec3 uFogColor;
uniform float uMaxAlpha;
uniform float uFowTime;
uniform float uEdgeSoftness;
uniform float uMeltDuration;
` + shader.fragmentShader;

    const fogFragInjection = `#include <fog_fragment>
vec2 fowUv = (vFowWorld.xz + 0.5) / 1000.0;

// Mép sương mềm: Multi-sampling + smoothstep (bán kính tối đa 2 ô, mặc định 1.5 ô)
float mRaw = 0.0;
if (uEdgeSoftness <= 0.01) {
  mRaw = texture2D(uFogMask, fowUv).r;
} else {
  float stepUv = uEdgeSoftness * 0.001;
  mRaw += texture2D(uFogMask, fowUv).r * 0.24;
  mRaw += texture2D(uFogMask, fowUv + vec2( stepUv, 0.0)).r * 0.12;
  mRaw += texture2D(uFogMask, fowUv + vec2(-stepUv, 0.0)).r * 0.12;
  mRaw += texture2D(uFogMask, fowUv + vec2(0.0,  stepUv)).r * 0.12;
  mRaw += texture2D(uFogMask, fowUv + vec2(0.0, -stepUv)).r * 0.12;
  float diagUv = stepUv * 0.7071;
  mRaw += texture2D(uFogMask, fowUv + vec2( diagUv,  diagUv)).r * 0.07;
  mRaw += texture2D(uFogMask, fowUv + vec2(-diagUv,  diagUv)).r * 0.07;
  mRaw += texture2D(uFogMask, fowUv + vec2( diagUv, -diagUv)).r * 0.07;
  mRaw += texture2D(uFogMask, fowUv + vec2(-diagUv, -diagUv)).r * 0.07;
}
float m = smoothstep(0.05, 0.95, mRaw);

// Hiệu ứng tan sương kiểu B: Tan theo vân sương trên GPU (Việc 3)
float revealTime = texture2D(uRevealTimeMask, fowUv).r;
if (revealTime > 0.0001) {
  float elapsed = uFowTime - revealTime;
  if (elapsed < uMeltDuration) {
    float meltProgress = clamp(elapsed / max(uMeltDuration, 0.001), 0.0, 1.0);
    float veinPattern = 0.5 + 0.25 * sin(fowUv.x * 240.0 + fowUv.y * 180.0 + uFowTime * 0.5)
                            + 0.25 * cos(fowUv.x * 120.0 - fowUv.y * 300.0);
    float dissolve = smoothstep(veinPattern * 0.4, veinPattern * 0.4 + 0.6, meltProgress);
    m *= dissolve;
  }
}

float mistNoise = 0.88 + 0.12 * sin(fowUv.x * 50.0 + uFowTime * 0.4) * cos(fowUv.y * 50.0 + uFowTime * 0.3);
float fog = (1.0 - m) * uMaxAlpha * mistNoise;
gl_FragColor.rgb = mix(gl_FragColor.rgb, uFogColor, clamp(fog, 0.0, 1.0));`;

    if (shader.fragmentShader.includes("#include <fog_fragment>")) {
      shader.fragmentShader = shader.fragmentShader.replace("#include <fog_fragment>", fogFragInjection);
    } else if (shader.fragmentShader.includes("#include <dithering_fragment>")) {
      shader.fragmentShader = shader.fragmentShader.replace("#include <dithering_fragment>", `#include <dithering_fragment>\n${fogFragInjection}`);
    }
  };

  material.customProgramCacheKey = () => "fow_world_v2";
}
