import React, {useMemo} from "react";
import * as THREE from "three";
import {Easing} from "remotion";

/**
 * The blade of light that swaps one picture for the next: struck top-down, swept across, drawn back up.
 */

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const prog = (f: number, a: number, b: number) => clamp01((f - a) / (b - a));
const mix = (a: number, b: number, k: number) => a + (b - a) * k;
const outE = Easing.bezier(0.16, 1, 0.3, 1);
const inE = Easing.bezier(0.7, 0, 0.84, 0);
const sweepE = Easing.bezier(0.6, 0, 0.3, 1);

const BLADE_FS = /* glsl */ `
  uniform float uTime;
  uniform float uWidth;
  uniform float uLength;
  uniform float uTo;
  uniform float uK;
  uniform float uIntensity;
  uniform vec3 uCore;
  uniform vec3 uHalo;
  varying vec2 vUv;
  float hash(float n) { return fract(sin(n * 12.9898) * 43758.5453); }
  float vnoise(float x) { float i = floor(x); float f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(hash(i), hash(i + 1.0), f); }
  void main() {
    float x = (vUv.x - 0.5) * uWidth;
    float s = 1.0 - vUv.y;
    float y = s * uLength;
    float vis = 1.0 - smoothstep(uTo - 0.02, uTo + 0.02, s);
    if (vis < 0.002) discard;
    // the core is a thread of light that crawls a little, never a bar
    float c = ((vnoise(y * 5.0 / uK + uTime * 9.0) - 0.5) * 0.02 + (vnoise(y * 19.0 / uK - uTime * 17.0) - 0.5) * 0.008) * uK;
    float d = (x - c) / uK;
    float core = exp(-d * d / 0.00005);
    float halo = exp(-d * d / 0.0022) * 0.22 + exp(-abs(d) / 0.12) * 0.05;
    float pulse = 0.88 + 0.12 * sin(y / uK * 6.0 - uTime * 22.0);
    vec3 col = uCore * core * pulse + uHalo * halo;
    gl_FragColor = vec4(col * vis * uIntensity, 0.0);
  }
`;

export const Blade: React.FC<{x: number; to?: number; height?: number; k?: number; time: number; intensity?: number; core?: THREE.Color; halo?: THREE.Color}> = ({x, to = 1, height = 12, k = 1, time, intensity = 1, core, halo}) => {
  const width = 1.4 * k;
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: BLADE_FS,
        transparent: true,
        premultipliedAlpha: true,
        depthWrite: false,
        depthTest: false,
        toneMapped: false,
        uniforms: {uTime: {value: 0}, uWidth: {value: 1}, uLength: {value: 1}, uTo: {value: 1}, uK: {value: 1}, uIntensity: {value: 1}, uCore: {value: new THREE.Color(1.3, 3.5, 1.6)}, uHalo: {value: new THREE.Color(0.06, 1.5, 0.2)}},
      }),
    [],
  );
  const u = mat.uniforms;
  u.uTime.value = time;
  u.uWidth.value = width;
  u.uLength.value = height;
  u.uTo.value = to;
  u.uK.value = k;
  u.uIntensity.value = intensity;
  if (core) u.uCore.value.copy(core);
  if (halo) u.uHalo.value.copy(halo);
  return (
    <mesh position={[x, 0, 0.1]} material={mat} renderOrder={70}>
      <planeGeometry args={[width, height]} />
    </mesh>
  );
};

const STRIKE = 8;
const RETRACT = 10;
const GLOW_OUT = 42;
/** A wipe: the blade is struck top-down, sweeps, is drawn back up; the light behind it dies slowly on the picture. */
export const wipeState = (f: number, at: number, len: number) => {
  const s0 = at + STRIKE;
  const s1 = s0 + len;
  const u = sweepE(prog(f, s0, s1));
  const to = f < s1 ? outE(prog(f, at, s0)) : 1 - inE(prog(f, s1, s1 + RETRACT));
  // past the far edge the wipe keeps running, so the afterglow fades instead of snapping off
  const wipe = f < s1 ? mix(-0.01, 1.01, u) : 1.01 + 9 * inE(prog(f, s1, s1 + GLOW_OUT));
  return {u, to, wipe, on: f >= at && f < s1 + RETRACT, shown: f >= s0, done: f >= s1 + GLOW_OUT};
};
