import React, {useMemo} from "react";
import * as THREE from "three";
import {useCurrentFrame, useVideoConfig} from "remotion";
import {H, TAN, type V3} from "./space";

/**
 * Endless space around a moving camera, continuous across the whole film:
 *   sky   — a camera-centred shell of tiny sharp stars (infinitely far: no parallax);
 *   field — stars hashed into 3D cells around the camera (real parallax);
 *   dust  — big soft bokeh hashed into small cells right next to the lens.
 * Every star is a pure function of its cell coordinates, so any camera path
 * yields the same sky at the same place.
 */

const VS = /* glsl */ `
  attribute float aSize;
  attribute float aBright;
  attribute float aPhase;
  attribute vec3 aColor;
  uniform float uTime;
  uniform float uScale;
  uniform float uAttenuate;
  uniform vec3 uCam;
  uniform float uFadeNear;
  uniform float uFadeFar;
  uniform float uGain;
  varying float vBright;
  varying vec3 vColor;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vec4 mv = viewMatrix * wp;
    gl_Position = projectionMatrix * mv;
    float dist = -mv.z;
    float s = mix(aSize, aSize * uScale / max(0.1, dist), uAttenuate);
    gl_PointSize = clamp(s, 1.0, 380.0);
    float tw = 0.8 + 0.2 * sin(uTime * (0.6 + fract(aPhase * 7.13) * 1.7) + aPhase * 6.283);
    // Fade cells in and out at the edges of the generated volume, and never pop at the lens.
    float d = distance(wp.xyz, uCam);
    float edge = 1.0 - smoothstep(uFadeFar * 0.75, uFadeFar, d);
    float nearFade = smoothstep(uFadeNear, uFadeNear * 2.5, dist);
    vBright = aBright * tw * edge * nearFade * min(1.0, s) * uGain;
    vColor = aColor;
  }
`;

const FS = /* glsl */ `
  uniform float uSoft;
  varying float vBright;
  varying vec3 vColor;
  void main() {
    if (vBright < 0.002) discard;
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c) * 2.0;
    if (d > 1.0) discard;
    float star = exp(-d * d * 5.0);
    float disc = smoothstep(1.0, 0.55, d) * (0.8 + 0.2 * smoothstep(0.4, 0.85, d));
    float a = mix(star, disc, uSoft);
    gl_FragColor = vec4(vColor * vBright * a, 1.0);
  }
`;

const hash = (x: number, y: number, z: number, k: number) => {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647 + k * 1274126177) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};

const COOL = new THREE.Color("#DCE6FF");
const WHITE = new THREE.Color("#FFFFFF");
const WARM = new THREE.Color("#FFD9A0");

type Field = {cell: number; radius: number; perCell: number; size: [number, number]; bright: [number, number]; warm: number; soft: number; attenuate: number; fadeNear: number; seed: number; renderOrder: number};

const makeMaterial = (f: Field) =>
  new THREE.ShaderMaterial({
    vertexShader: VS,
    fragmentShader: FS,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: {value: 0},
      uScale: {value: H / 2 / TAN},
      uAttenuate: {value: f.attenuate},
      uSoft: {value: f.soft},
      uCam: {value: new THREE.Vector3()},
      uFadeNear: {value: f.fadeNear},
      uFadeFar: {value: f.radius * f.cell},
      uGain: {value: 1},
    },
  });

/** Stars for all cells within `radius` cells of the camera. */
const buildField = (f: Field, cam: V3) => {
  const cx = Math.floor(cam[0] / f.cell);
  const cy = Math.floor(cam[1] / f.cell);
  const cz = Math.floor(cam[2] / f.cell);
  const R = f.radius;
  const pos: number[] = [];
  const size: number[] = [];
  const bright: number[] = [];
  const phase: number[] = [];
  const color: number[] = [];
  for (let i = -R; i <= R; i++)
    for (let j = -R; j <= R; j++)
      for (let k = -R; k <= R; k++) {
        if (i * i + j * j + k * k > (R + 0.5) * (R + 0.5)) continue;
        const X = cx + i;
        const Y = cy + j;
        const Z = cz + k;
        for (let n = 0; n < f.perCell; n++) {
          const h = (m: number) => hash(X, Y, Z, f.seed * 131 + n * 17 + m);
          pos.push((X + h(1)) * f.cell, (Y + h(2)) * f.cell, (Z + h(3)) * f.cell);
          size.push(f.size[0] + (f.size[1] - f.size[0]) * Math.pow(h(4), 2.2));
          let b = f.bright[0] + (f.bright[1] - f.bright[0]) * Math.pow(h(5), 1.8);
          if (h(6) < 0.015) b *= 2.4;
          bright.push(b);
          phase.push(h(7));
          const t = h(8);
          const c = t < f.warm ? WARM : t < f.warm + 0.45 ? WHITE : COOL;
          color.push(c.r, c.g, c.b);
        }
      }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("aSize", new THREE.Float32BufferAttribute(size, 1));
  g.setAttribute("aBright", new THREE.Float32BufferAttribute(bright, 1));
  g.setAttribute("aPhase", new THREE.Float32BufferAttribute(phase, 1));
  g.setAttribute("aColor", new THREE.Float32BufferAttribute(color, 3));
  return g;
};

const FieldLayer: React.FC<{f: Field; cam: V3; opacity: number; gain?: number}> = ({f, cam, opacity, gain = 1}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const key = `${Math.floor(cam[0] / f.cell)},${Math.floor(cam[1] / f.cell)},${Math.floor(cam[2] / f.cell)}`;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const geom = useMemo(() => buildField(f, cam), [f, key]);
  const mat = useMemo(() => makeMaterial(f), [f]);
  mat.uniforms.uTime.value = frame / fps;
  mat.uniforms.uCam.value.set(cam[0], cam[1], cam[2]);
  mat.uniforms.uSoft.value = f.soft;
  mat.uniforms.uGain.value = gain;
  return <points geometry={geom} material={mat} frustumCulled={false} renderOrder={f.renderOrder} scale={1} visible={opacity > 0} />;
};

/** The sky shell: a fixed star sphere that travels with the camera. */
const Sky: React.FC<{cam: V3; density: number; seed: number; gain?: number}> = ({cam, density, seed, gain = 1}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const geom = useMemo(() => {
    const n = Math.round(9000 * density);
    const pos: number[] = [];
    const size: number[] = [];
    const bright: number[] = [];
    const phase: number[] = [];
    const color: number[] = [];
    for (let i = 0; i < n; i++) {
      const h = (m: number) => hash(i, seed, 7, m);
      const u = h(1) * 2 - 1;
      const th = h(2) * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      pos.push(r * Math.cos(th) * 900, u * 900, r * Math.sin(th) * 900);
      size.push(1.0 + 1.5 * Math.pow(h(3), 2.6));
      let b = 0.04 + 0.5 * Math.pow(h(4), 2.2);
      if (h(5) < 0.01) b *= 2.6;
      bright.push(b);
      phase.push(h(6));
      const t = h(7);
      const c = t < 0.12 ? WARM : t < 0.55 ? WHITE : COOL;
      color.push(c.r, c.g, c.b);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("aSize", new THREE.Float32BufferAttribute(size, 1));
    g.setAttribute("aBright", new THREE.Float32BufferAttribute(bright, 1));
    g.setAttribute("aPhase", new THREE.Float32BufferAttribute(phase, 1));
    g.setAttribute("aColor", new THREE.Float32BufferAttribute(color, 3));
    return g;
  }, [density, seed]);
  const mat = useMemo(() => makeMaterial({cell: 1, radius: 10000, perCell: 0, size: [1, 1], bright: [0, 0], warm: 0, soft: 0, attenuate: 0, fadeNear: 0, seed, renderOrder: -200}), [seed]);
  mat.uniforms.uTime.value = frame / fps;
  mat.uniforms.uCam.value.set(cam[0], cam[1], cam[2]);
  mat.uniforms.uGain.value = gain;
  return <points geometry={geom} material={mat} frustumCulled={false} renderOrder={-200} position={cam} />;
};

/** One soft deep-field galaxy: an elliptical glow with a small bright core (drawn once, tinted per sprite). */
let GALAXY_TEX: THREE.CanvasTexture | null = null;
const galaxyTexture = () => {
  if (GALAXY_TEX) return GALAXY_TEX;
  const S = 128;
  const c = document.createElement("canvas");
  c.width = S;
  c.height = S;
  const g = c.getContext("2d")!;
  const img = g.createImageData(S, S);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const u = (x - S / 2) / (S / 2);
      const v = (y - S / 2) / (S / 2);
      const r2 = u * u + (v * 2.6) * (v * 2.6);
      const halo = Math.exp(-r2 * 5);
      const core = Math.exp(-r2 * 60);
      const a = Math.min(1, 0.55 * halo + core);
      const i = (y * S + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(a * 255);
    }
  g.putImageData(img, 0, 0);
  GALAXY_TEX = new THREE.CanvasTexture(c);
  return GALAXY_TEX;
};

/** A few faint, distant galaxies on the sky shell (infinitely far, like the shell's stars). */
const Galaxies: React.FC<{cam: V3; count: number; gain: number; seed: number}> = ({cam, count, gain, seed}) => {
  const items = useMemo(
    () =>
      new Array(count).fill(0).map((_, i) => {
        const h = (m: number) => hash(i, seed, 41, m);
        // Mostly ahead (the film looks down −z), some to the sides.
        const az = (h(1) - 0.5) * Math.PI * 1.4;
        const el = (h(2) - 0.5) * 0.9;
        const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
        const px = 9 + 18 * Math.pow(h(3), 1.6);
        const t = h(4);
        return {pos: dir.multiplyScalar(900), size: px * 0.606, rot: h(5) * Math.PI, bright: 0.18 + 0.32 * h(6), color: t < 0.4 ? WARM : t < 0.7 ? WHITE : COOL};
      }),
    [count, seed],
  );
  const tex = galaxyTexture();
  return (
    <group position={cam}>
      {items.map((g, i) => (
        <sprite key={i} position={g.pos} scale={[g.size, g.size, 1]} renderOrder={-190}>
          <spriteMaterial map={tex} rotation={g.rot} color={g.color.clone().multiplyScalar(g.bright * gain)} blending={THREE.AdditiveBlending} depthWrite={false} depthTest={false} transparent toneMapped={false} />
        </sprite>
      ))}
    </group>
  );
};

/** `sky` / `field` scale the far shell's and the parallax stars' brightness (1 = the film's look). */
export type SpaceProps = {cam: V3; dust?: number; density?: number; skyDensity?: number; seed?: number; sky?: number; field?: number; galaxies?: number};

export const Space: React.FC<SpaceProps> = ({cam, dust = 0.7, density = 1, skyDensity = density, seed = 3, sky = 1, field: fieldGain = 1, galaxies = 0}) => {
  const field = useMemo<Field>(
    () => ({cell: 22, radius: 4, perCell: Math.max(1, Math.round(5 * density)), size: [1.3, 3.0], bright: [0.08, 0.55], warm: 0.2, soft: 0.1, attenuate: 0, fadeNear: 1.5, seed: seed + 1, renderOrder: -150}),
    [density, seed],
  );
  const dustF = useMemo<Field>(
    () => ({cell: 7, radius: 2, perCell: 1, size: [0.45, 1.5], bright: [0.004 * dust, 0.017 * dust], warm: 1, soft: 1, attenuate: 1, fadeNear: 1.2, seed: seed + 2, renderOrder: 50}),
    [dust, seed],
  );
  return (
    <group>
      <Sky cam={cam} density={skyDensity} seed={seed} gain={sky} />
      {galaxies > 0 ? <Galaxies cam={cam} count={16} gain={galaxies} seed={seed} /> : null}
      <FieldLayer f={field} cam={cam} opacity={1} gain={fieldGain} />
      {dust > 0 ? <FieldLayer f={dustF} cam={cam} opacity={dust} /> : null}
    </group>
  );
};
