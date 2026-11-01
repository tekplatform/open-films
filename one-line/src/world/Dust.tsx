import React, {useMemo} from "react";
import * as THREE from "three";
import {useThree} from "@react-three/fiber";
import type {TextTex} from "./Type";

/**
 * Text that turns to dust and settles into other text.
 *
 * Every text plane gets an erosion field E(u, v) in 0..1: a left-to-right
 * sweep broken up by two octaves of value noise. Ink leaves where E is below
 * a level that rises with time (the plane's `erode.out`), and new ink arrives
 * where E is below `erode.in`. The particles are the same ink in flight: one
 * per sampled ink texel, leaving at the moment the front passes its texel and
 * landing at the moment the other front reaches its destination texel. Both
 * sides read E from the same data, so the hand-off is exact.
 *
 * Everything is a pure function of time (the shader evaluates each path).
 */

// ------------------------------------------------------------------ the field

const hash = (x: number, y: number, seed: number) => {
  // Integer hash (no sine), identical everywhere.
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
};
const smooth = (x: number) => x * x * (3 - 2 * x);
const vnoise = (x: number, y: number, seed: number) => {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = smooth(x - xi);
  const fy = smooth(y - yi);
  const a = hash(xi, yi, seed);
  const b = hash(xi + 1, yi, seed);
  const c = hash(xi, yi + 1, seed);
  const d = hash(xi + 1, yi + 1, seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
};

export type Field = {tex: THREE.Texture; w: number; h: number; data: Float32Array};

/** E over the texture's px grid: u across the ink (pad to pad), plus noise. */
export const erosionField = (tt: TextTex, seed = 1): Field => {
  const w = tt.wPx;
  const h = tt.hPx;
  const data = new Float32Array(w * h);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  const img = g.createImageData(w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const u = Math.min(1, Math.max(0, (x - tt.padPx) / (w - 2 * tt.padPx)));
      const n = 0.65 * vnoise(x / 22, y / 22, seed) + 0.35 * vnoise(x / 7, y / 7, seed + 17);
      const e = Math.min(1, Math.max(0, u * 0.8 + n * 0.2));
      data[y * w + x] = e;
      const v = Math.round(e * 255);
      const i = (y * w + x) * 4;
      img.data[i] = v;
      img.data[i + 1] = v;
      img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  // Sampled values must match the data the particles were timed from.
  for (let i = 0; i < data.length; i++) data[i] = Math.round(data[i] * 255) / 255;
  return {tex, w, h, data};
};

// ------------------------------------------------------------------ ink samples

export type InkPoint = {pos: THREE.Vector3; e: number};

/** World-placed text plane (centre, world width/height) → ink samples every `step` texture px. */
export const inkPoints = (tt: TextTex, field: Field, centre: THREE.Vector3, w: number, h: number, step = 1.5): InkPoint[] => {
  const g = tt.canvas.getContext("2d")!;
  const cw = tt.canvas.width;
  const chh = tt.canvas.height;
  const d = g.getImageData(0, 0, cw, chh).data;
  const out: InkPoint[] = [];
  const st = step * tt.ss;
  for (let yy = st / 2; yy < chh; yy += st)
    for (let xx = st / 2; xx < cw; xx += st) {
      const a = d[(Math.floor(yy) * cw + Math.floor(xx)) * 4 + 3];
      if (a < 110) continue;
      const u = xx / cw;
      const v = yy / chh;
      const fx = Math.min(field.w - 1, Math.floor(u * field.w));
      const fy = Math.min(field.h - 1, Math.floor(v * field.h));
      out.push({pos: new THREE.Vector3(centre.x + (u - 0.5) * w, centre.y + (0.5 - v) * h, centre.z), e: field.data[fy * field.w + fx]});
    }
  return out;
};

// ------------------------------------------------------------------ flights

export type Flight = {geom: THREE.BufferGeometry; count: number; t0: number; t1: number};

const rand = (i: number, k: number) => hash(i, k, 911);

/**
 * Ink of A leaves as A's front passes (A0 + e·sweep) and lands on B as B's
 * front arrives (B0 + e·sweep). Particles are paired by rank of E on both
 * sides, so departure order and arrival order agree.
 */
export const flightBetween = (src: InkPoint[], dst: InkPoint[], A0: number, B0: number, sweep: number): Flight => {
  const S = [...src].sort((a, b) => a.e - b.e);
  const D = [...dst].sort((a, b) => a.e - b.e);
  const n = Math.max(S.length, D.length);
  const pairs = new Array(n).fill(0).map((_, i) => {
    const s = S[Math.min(S.length - 1, Math.floor((i * S.length) / n))];
    const d = D[Math.min(D.length - 1, Math.floor((i * D.length) / n))];
    const td = A0 + s.e * sweep;
    const ta = Math.max(td + 0.35, B0 + d.e * sweep);
    return {s: s.pos, d: d.pos, td, ta};
  });
  return build(pairs);
};

/** Ink of A leaves with A's front and is drawn into one point, arriving over [F0, F1]. */
export const flightInto = (src: InkPoint[], point: THREE.Vector3, A0: number, sweep: number, F0: number, F1: number): Flight => {
  const S = [...src].sort((a, b) => a.e - b.e);
  const pairs = S.map((s, i) => {
    const td = A0 + s.e * sweep;
    const ta = Math.max(td + 0.5, F0 + (i / S.length) * (F1 - F0) + (rand(i, 7) - 0.5) * 0.12);
    const j = new THREE.Vector3(rand(i, 8) - 0.5, rand(i, 9) - 0.5, rand(i, 10) - 0.5).multiplyScalar(0.05);
    return {s: s.pos, d: point.clone().add(j), td, ta};
  });
  return build(pairs);
};

const build = (pairs: Array<{s: THREE.Vector3; d: THREE.Vector3; td: number; ta: number}>): Flight => {
  const n = pairs.length;
  const src = new Float32Array(n * 3);
  const dst = new Float32Array(n * 3);
  const time = new Float32Array(n * 2);
  const seed = new Float32Array(n * 4);
  let t0 = Infinity;
  let t1 = -Infinity;
  pairs.forEach((p, i) => {
    src.set([p.s.x, p.s.y, p.s.z], i * 3);
    dst.set([p.d.x, p.d.y, p.d.z], i * 3);
    time.set([p.td, p.ta], i * 2);
    seed.set([rand(i, 1), rand(i, 2), rand(i, 3), rand(i, 4)], i * 4);
    t0 = Math.min(t0, p.td);
    t1 = Math.max(t1, p.ta);
  });
  const geom = new THREE.BufferGeometry();
  // `position` is the source (three needs it for bounds); the shader moves it.
  geom.setAttribute("position", new THREE.BufferAttribute(src, 3));
  geom.setAttribute("aDst", new THREE.BufferAttribute(dst, 3));
  geom.setAttribute("aTime", new THREE.BufferAttribute(time, 2));
  geom.setAttribute("aSeed", new THREE.BufferAttribute(seed, 4));
  return {geom, count: n, t0, t1};
};

// ------------------------------------------------------------------ the dust

const VS = /* glsl */ `
  attribute vec3 aDst;
  attribute vec2 aTime;
  attribute vec4 aSeed;
  uniform float uTime;
  uniform float uScale;
  uniform float uFocus;
  uniform float uDof;
  uniform float uSize;
  uniform float uMode;
  uniform vec3 uPivot;
  uniform float uSpin;
  varying float vHeat;
  varying float vA;

  vec3 bez(vec3 a, vec3 b, vec3 c, vec3 d, float s) {
    float r = 1.0 - s;
    return r*r*r*a + 3.0*r*r*s*b + 3.0*r*s*s*c + s*s*s*d;
  }

  void main() {
    float s = (uTime - aTime.x) / max(1e-3, aTime.y - aTime.x);
    if (s <= 0.0 || s >= 1.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vA = 0.0; vHeat = 0.0; return; }
    // Leave gently, glide, settle (smootherstep).
    float w = s * s * s * (s * (s * 6.0 - 15.0) + 10.0);
    float arc = sin(3.14159265 * s);
    vec3 p;
    if (uMode < 0.5) {
      // Lift off up-right and toward the lens, then rain down onto the target.
      vec3 c1 = position + vec3(-0.35 + 1.2 * aSeed.x, 0.25 + 1.3 * aSeed.y, -0.6 + 2.4 * aSeed.z);
      vec3 c2 = aDst + vec3(-0.6 + 1.2 * aSeed.w, 0.45 + 1.4 * fract(aSeed.x * 7.3), -0.4 + 1.6 * fract(aSeed.y * 5.1));
      p = bez(position, c1, c2, aDst, w);
    } else {
      // A vortex: round the pivot, closing in, lifted toward the lens mid-way.
      vec3 r0 = position - uPivot;
      float ang = uSpin * pow(w, 1.25) * (0.85 + 0.3 * aSeed.x);
      float ca = cos(ang);
      float sa = sin(ang);
      vec3 r = vec3(r0.x * ca - r0.y * sa, r0.x * sa + r0.y * ca, r0.z);
      p = mix(uPivot + r * (1.0 - w), aDst, w * w);
      p += vec3(0.0, 0.35 + 0.4 * aSeed.y, 0.5 + 1.2 * aSeed.z) * arc * (1.0 - w);
    }
    // Air: a slow wobble that dies at both ends.
    p += vec3(sin(s * 7.0 + aSeed.x * 6.283) * 0.22, cos(s * 5.0 + aSeed.y * 6.283) * 0.16, sin(s * 4.0 + aSeed.z * 6.283) * 0.35) * arc;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float depth = -mv.z;
    float coc = abs(depth - uFocus) * uDof;
    float size = uSize * uScale / depth + coc;
    gl_PointSize = size;
    // Energy conserved as the point spreads; fade in/out at the hand-offs.
    float base = uSize * uScale / depth;
    vA = (0.55 + 0.45 * aSeed.w) * min(1.0, (base * base) / (size * size)) * smoothstep(0.0, 0.08, s) * (1.0 - smoothstep(0.9, 1.0, s));
    vHeat = pow(arc, 0.6);
  }
`;

const FS = /* glsl */ `
  uniform vec3 uCool;
  uniform vec3 uHot;
  uniform float uIntensity;
  varying float vHeat;
  varying float vA;
  void main() {
    vec2 q = gl_PointCoord - 0.5;
    float r = length(q);
    float disk = smoothstep(0.5, 0.18, r);
    float a = disk * vA * uIntensity;
    if (a < 0.002) discard;
    gl_FragColor = vec4(mix(uCool, uHot, vHeat) * a, 1.0);
  }
`;

export const Dust: React.FC<{
  flight: Flight;
  t: number;
  /** Point size in world units at the focal depth. */
  size?: number;
  focus?: number;
  dof?: number;
  intensity?: number;
  vortex?: {pivot: THREE.Vector3; spin: number};
  renderOrder?: number;
}> = ({flight, t, size = 0.016, focus = 14, dof = 1.4, intensity = 0.8, vortex, renderOrder = 58}) => {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VS,
        fragmentShader: FS,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
        uniforms: {
          uTime: {value: 0},
          uScale: {value: 1},
          uFocus: {value: 14},
          uDof: {value: 1.4},
          uSize: {value: 0.016},
          uMode: {value: 0},
          uPivot: {value: new THREE.Vector3()},
          uSpin: {value: 0},
          uCool: {value: new THREE.Color(0.86, 0.8, 0.7)},
          uHot: {value: new THREE.Color(2.3, 1.4, 0.55)},
          uIntensity: {value: 0.8},
        },
      }),
    [],
  );
  if (t <= flight.t0 || t >= flight.t1) return null;
  const u = mat.uniforms;
  u.uTime.value = t;
  // px per world unit at depth 1 (drawing-buffer lines over the lens).
  const lines = gl.getDrawingBufferSize(new THREE.Vector2()).y;
  u.uScale.value = lines / (2 * Math.tan(((camera.fov ?? 40) / 2) * (Math.PI / 180)));
  u.uFocus.value = focus;
  u.uDof.value = dof;
  u.uSize.value = size;
  u.uMode.value = vortex ? 1 : 0;
  if (vortex) {
    u.uPivot.value.copy(vortex.pivot);
    u.uSpin.value = vortex.spin;
  }
  u.uIntensity.value = intensity;
  return <points geometry={flight.geom} material={mat} frustumCulled={false} renderOrder={renderOrder} />;
};
