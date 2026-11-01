import React, {useMemo} from "react";
import * as THREE from "three";
import {ease, seg} from "../timing";

export type BladeWindow = {strike: number; sweep0: number; sweep1: number};
export const STRIKE = 0.14;
export const RETRACT = 0.16;
/** Blade state for a wipe window: how much of it shows (from the top) and whether it is on. */
export const blade = (t: number, w: BladeWindow) => ({
  to: t < w.sweep1 ? seg(t, w.strike, w.strike + STRIKE, ease.out) : 1 - seg(t, w.sweep1, w.sweep1 + RETRACT, ease.in),
  on: t >= w.strike && t < w.sweep1 + RETRACT,
});
/** Card wipe value: the blade's u while it sweeps, then moved past the edge so the afterglow fades smoothly. */
export const wipeAt = (t: number, w: {sweep1: number}, u: number) => (t < w.sweep1 ? u : 1 + 9 * seg(t, w.sweep1, w.sweep1 + 0.7, ease.in));

/**
 * The wipe's edge: a full-height blade of light, struck from the top down by
 * the pen, swept across a card, then drawn back up into the pen. A white-hot
 * core that crawls a little, a gold halo, and a few electric filaments that
 * arc round the core and crackle on and off (hashed per 1/24 s, so it reads
 * as electricity rather than noise). Additive light: the bloom does the rest.
 * Pure function of `time`.
 */

const VS = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

const FS = /* glsl */ `
  uniform float uTime;
  uniform float uWidth;
  uniform float uLength;
  uniform float uFrom;   // 0..1 of the length, measured from the top, where the blade starts
  uniform float uTo;     // … and where it ends
  uniform float uIntensity;
  uniform float uSeed;
  varying vec2 vUv;

  float hash(float n) { return fract(sin(n * 12.9898 + uSeed * 78.233) * 43758.5453); }
  float vnoise(float x) { float i = floor(x); float f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(hash(i), hash(i + 1.0), f); }

  void main() {
    float x = (vUv.x - 0.5) * uWidth;
    float s = 1.0 - vUv.y;                       // 0 at the top, 1 at the bottom
    float y = s * uLength;
    // Visible stretch, with soft ends.
    float vis = smoothstep(uFrom - 0.02, uFrom + 0.02, s) * (1.0 - smoothstep(uTo - 0.02, uTo + 0.02, s));
    if (vis < 0.002) discard;
    float tick = floor(uTime * 24.0);
    // The core crawls a little.
    float c = (vnoise(y * 5.0 + uTime * 9.0) - 0.5) * 0.02 + (vnoise(y * 19.0 - uTime * 17.0) - 0.5) * 0.008;
    float d = x - c;
    float core = exp(-d * d / 0.00005);
    float halo = exp(-d * d / 0.0022) * 0.22 + exp(-abs(d) / 0.12) * 0.05;
    // Electric filaments: arcs round the core, each crackling on and off.
    float fil = 0.0;
    for (int k = 0; k < 4; k++) {
      float fk = float(k);
      float on = step(0.5, hash(tick * 3.1 + fk * 17.0));
      float amp = 0.05 + 0.09 * hash(tick + fk * 5.0);
      // Two octaves: a wandering arc with sharp kinks, like a discharge.
      float a = ((vnoise(y * (6.0 + fk * 3.0) + tick * 1.7 + fk * 11.0) - 0.5) * 2.0
               + (vnoise(y * (23.0 + fk * 7.0) - tick * 2.3 + fk * 5.0) - 0.5) * 0.7) * amp;
      float e = x - c - a;
      // Each arc touches the core only along part of the blade.
      float span = smoothstep(0.0, 0.2, sin(y * (1.3 + fk * 0.7) + tick * 0.9 + fk * 2.0) + 0.2);
      fil += on * span * exp(-e * e / 0.000022) * (0.7 + 0.5 * hash(tick + fk));
    }
    // A slow pulse runs down the blade.
    float pulse = 0.85 + 0.15 * sin(y * 6.0 - uTime * 22.0);
    vec3 col = vec3(3.0, 2.8, 2.45) * core * pulse + vec3(2.2, 1.3, 0.45) * halo + vec3(2.6, 2.1, 1.4) * fil;
    gl_FragColor = vec4(col * vis * uIntensity, 1.0);
  }
`;

export const LightBlade: React.FC<{
  /** Top and bottom of the full blade (world). */
  top: THREE.Vector3;
  bottom: THREE.Vector3;
  time: number;
  /** Visible stretch, 0..1 from the top. */
  from?: number;
  to?: number;
  intensity?: number;
  width?: number;
  seed?: number;
}> = ({top, bottom, time, from = 0, to = 1, intensity = 1, width = 0.7, seed = 1}) => {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VS,
        fragmentShader: FS,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
        uniforms: {uTime: {value: 0}, uWidth: {value: 0.7}, uLength: {value: 1}, uFrom: {value: 0}, uTo: {value: 1}, uIntensity: {value: 1}, uSeed: {value: 1}},
      }),
    [],
  );
  if (intensity <= 0.001 || to <= from) return null;
  const len = top.distanceTo(bottom);
  const u = mat.uniforms;
  u.uTime.value = time;
  u.uWidth.value = width;
  u.uLength.value = len;
  u.uFrom.value = from;
  u.uTo.value = to;
  u.uIntensity.value = intensity;
  u.uSeed.value = seed;
  const mid = top.clone().add(bottom).multiplyScalar(0.5);
  return (
    <mesh position={mid} material={mat} renderOrder={57}>
      <planeGeometry args={[width, len]} />
    </mesh>
  );
};
