import React, {useMemo} from "react";
import * as THREE from "three";
import {fonts} from "../../fonts";
import {ease, seg} from "../../timing";
import {GoldLine} from "../../world/Line";
import {GOLD} from "../../world/space";
import {T} from "./common";
import {s1BaseCam} from "./camera";
import type {Cam} from "../../world/Stage";
import {project} from "../../world/track";

/**
 * C0 → C1: the attacking lines weave into two counter-rotating rings of model
 * names (outer: video, inner: image). They speed up
 * until the names smear into light, then collapse into the knot.
 */

const VIDEO = ["Gemini Omni", "Seedance 2.5", "Wan 3.0", "MiniMax H3", "Flux 3 Video", "Grok Imagine", "Veo 3.1", "Kling 3", "Vidu Q3", "Hailuo", "Muse Video", "LTX-2", "Runway Gen-4", "Pika"];
const IMAGE = ["GPT Image 2.5", "Nano Banana 2.1", "Grok Imagine Image 2", "MAI Image 2.6", "Reve 2.1", "Seedream 5", "Qwen Image 3", "Ideogram 4", "Flux 2", "Recraft 4", "Imagen 4", "Krea 2"];

export const RING_CENTRE = new THREE.Vector3(0, 0.2, 0);

type RingDef = {names: string[]; order: number[]; R: number; bandH: number; tilt: [number, number, number]; dir: 1 | -1; drawAt: number; batches: number[]};

const RINGS: RingDef[] = [
  {names: VIDEO, order: VIDEO.map((_, i) => i), R: 6.6, bandH: 0.62, tilt: [1.2, 0.05, 0.14], dir: 1, drawAt: T.ringsIn, batches: [T.ringsIn + 0.5, T.batch2, T.batch3]},
  {names: IMAGE, order: IMAGE.map((_, i) => i), R: 4.5, bandH: 0.5, tilt: [-1.0, 0.32, -0.22], dir: -1, drawAt: T.ringsIn + 0.3, batches: [T.ringsIn + 0.7, T.batch2 + 0.15, T.batch3 + 0.15]},
];

/** Spin angle: slow, then accelerating through "can anyone keep up". Integrated in closed steps. */
export const spin = (t: number) => {
  const t0 = T.ringsIn;
  if (t <= t0) return 0;
  const w = (x: number) => 0.32 + 0.6 * seg(x, T.batch3, T.honest, ease.inOut) + 3.4 * seg(x, T.honest, T.collapse + 0.6, ease.in);
  const n = 160;
  const dt = (t - t0) / n;
  let a = 0;
  for (let i = 0; i < n; i++) a += w(t0 + (i + 0.5) * dt) * dt;
  return a;
};

const strandPts = (R: number, phase: number, amp: number, k = 9) => {
  const pts: THREE.Vector3[] = [];
  const n = 360;
  for (let i = 0; i <= n; i++) {
    const th = (i / n) * Math.PI * 2;
    const q = k * th + phase;
    pts.push(new THREE.Vector3((R + amp * Math.sin(q)) * Math.cos(th), (R + amp * Math.sin(q)) * Math.sin(th), amp * Math.cos(q)));
  }
  return pts;
};

// ------------------------------------------------------------------ the name ribbon

const RIBBON_VS = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const RIBBON_FS = /* glsl */ `
  uniform sampler2D map;
  uniform float uStart[16];
  uniform float uEnd[16];
  uniform float uBorn[16];
  uniform float uFlipU[16];
  uniform float uFlipV[16];
  uniform int uCount;
  uniform float uSmear;
  uniform float uOpacity;
  varying vec2 vUv;
  // Each name is turned on its own so it reads upright from wherever it is seen.
  vec4 sampleName(float u, float v) {
    for (int i = 0; i < 16; i++) {
      if (i >= uCount) break;
      if (u >= uStart[i] && u < uEnd[i]) {
        float uu = uFlipU[i] > 0.5 ? uStart[i] + uEnd[i] - u : u;
        float vv = uFlipV[i] > 0.5 ? 1.0 - v : v;
        vec4 s = texture2D(map, vec2(uu, vv));
        return vec4(s.rgb * s.a, s.a) * uBorn[i];
      }
    }
    return vec4(0.0);
  }
  void main() {
    float u0 = 1.0 - vUv.x;
    float side = gl_FrontFacing ? 1.0 : 0.82;
    // Speed smears the names along the band until they are only light.
    vec4 acc = vec4(0.0);
    float wsum = 0.0;
    for (int i = 0; i < 12; i++) {
      float k = (float(i) / 11.0 - 0.5) * uSmear * 0.09;
      float w = 1.0 - abs(float(i) / 11.0 - 0.5);
      acc += sampleName(fract(u0 + k), vUv.y) * w;
      wsum += w;
    }
    acc /= wsum;
    vec3 col = acc.a > 0.0 ? acc.rgb / acc.a : vec3(0.0);
    col = mix(col, vec3(2.4, 1.45, 0.55), clamp(uSmear * 1.2, 0.0, 1.0));
    float a = acc.a * uOpacity * side * (1.0 + uSmear * 1.5);
    if (a < 0.003) discard;
    gl_FragColor = vec4(col * a, min(1.0, a));
  }
`;

/** The ring's names as one band of bold type wrapped round it, read from outside. */
const makeRibbon = (names: string[], R: number, bandH: number) => {
  const H = 160;
  const W = Math.min(16000, Math.round((2 * Math.PI * R * H) / bandH));
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  let size = 112;
  const font = (s: number) => `700 ${s}px "${fonts.inter}"`;
  const label = (n: string) => n.toUpperCase();
  const measure = (s: number) => {
    g.font = font(s);
    (g as unknown as {letterSpacing: string}).letterSpacing = `${s * 0.02}px`;
    return names.reduce((a, n) => a + g.measureText(label(n)).width, 0);
  };
  while (measure(size) > W * 0.82 && size > 40) size -= 2;
  const gap = (W - measure(size)) / names.length;
  g.font = font(size);
  (g as unknown as {letterSpacing: string}).letterSpacing = `${size * 0.02}px`;
  g.textBaseline = "middle";
  const ranges: Array<[number, number]> = [];
  let x = gap / 2;
  names.forEach((n) => {
    const w = g.measureText(label(n)).width;
    g.fillStyle = "#F3EDE3";
    g.fillText(label(n), x, H / 2 + size * 0.04);
    // A gold dot between names.
    g.fillStyle = "#E9B860";
    g.beginPath();
    g.arc(x + w + gap / 2, H / 2, size * 0.07, 0, Math.PI * 2);
    g.fill();
    ranges.push([(x - gap / 2) / W, (x + w + gap / 2) / W]);
    x += w + gap;
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.anisotropy = 16;
  return {tex, ranges};
};

const Ribbon: React.FC<{names: string[]; order: number[]; R: number; bandH: number; born: (i: number) => number; smear: number; opacity: number; quat: THREE.Quaternion; shrink: number; cam: Cam}> = ({names, order, R, bandH, born, smear, opacity, quat, shrink, cam}) => {
  // Names in ring order; batches are interleaved so new ones always land on the near side.
  const ordered = useMemo(() => order.map((k) => names[k]), [names, order]);
  const rib = useMemo(() => makeRibbon(ordered, R, bandH), [ordered, R, bandH]);
  const geom = useMemo(() => {
    const g = new THREE.CylinderGeometry(R, R, bandH, 256, 1, true);
    g.rotateX(Math.PI / 2);
    return g;
  }, [R, bandH]);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: RIBBON_VS,
        fragmentShader: RIBBON_FS,
        transparent: true,
        premultipliedAlpha: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
        uniforms: {
          map: {value: null},
          uStart: {value: new Array(16).fill(0)},
          uEnd: {value: new Array(16).fill(0)},
          uBorn: {value: new Array(16).fill(0)},
          uFlipU: {value: new Array(16).fill(0)},
          uFlipV: {value: new Array(16).fill(0)},
          uCount: {value: 0},
          uSmear: {value: 0},
          uOpacity: {value: 1},
        },
      }),
    [],
  );
  const u = mat.uniforms;
  u.map.value = rib.tex;
  rib.ranges.forEach(([a, b], i) => {
    u.uStart.value[i] = a;
    u.uEnd.value[i] = b;
    u.uBorn.value[i] = born(order[i]);
    // Where this name sits on the band, which way it reads and which way is up, on screen.
    const th = 2 * Math.PI * (1 - (a + b) / 2);
    const local = new THREE.Vector3(R * Math.sin(th), -R * Math.cos(th), 0).multiplyScalar(shrink);
    const read = new THREE.Vector3(-Math.cos(th), -Math.sin(th), 0).applyQuaternion(quat);
    const upDir = new THREE.Vector3(0, 0, 1).applyQuaternion(quat);
    const c = local.applyQuaternion(quat).add(RING_CENTRE);
    const p0 = project(cam, c);
    const pr = project(cam, c.clone().add(read.multiplyScalar(0.3)));
    const pu = project(cam, c.clone().add(upDir.multiplyScalar(0.3)));
    // Screen space with y up.
    const tx = pr.x - p0.x;
    const ty = -(pr.y - p0.y);
    const ux = pu.x - p0.x;
    const uy = -(pu.y - p0.y);
    let flipU = tx * uy - ty * ux < 0;
    let flipV = false;
    if (uy < 0) {
      flipU = !flipU;
      flipV = true;
    }
    u.uFlipU.value[i] = flipU ? 1 : 0;
    u.uFlipV.value[i] = flipV ? 1 : 0;
  });
  u.uCount.value = rib.ranges.length;
  u.uSmear.value = smear;
  u.uOpacity.value = opacity;
  return <mesh geometry={geom} material={mat} renderOrder={28} />;
};

export const Rings: React.FC<{t: number}> = ({t}) => {
  const a = spin(t);
  // Collapse into the knot: radius shrinks, strands fade.
  const shrink = 1 - 0.72 * seg(t, T.collapse, T.collapse + 3.2, ease.in);
  const gone = 1 - seg(t, T.collapse + 1.8, T.collapse + 3.6, ease.in);
  const smear = seg(t, T.keepUp, T.collapse + 0.4, ease.in);
  const strands = useMemo(
    () =>
      RINGS.map((r) =>
        new Array(6).fill(0).map((_, i) => ({pts: strandPts(r.R, (i / 6) * Math.PI * 2, 0.16 + (i % 3) * 0.05), i})),
      ),
    [],
  );
  if (t < T.ringsIn - 0.2 || gone <= 0) return null;
  const cam = s1BaseCam(t);
  return (
    <group position={RING_CENTRE}>
      {RINGS.map((r, ri) => {
        const ringQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(...r.tilt));
        return (
          <group key={ri} quaternion={ringQ}>
            <group rotation={[0, 0, a * r.dir]} scale={[shrink, shrink, shrink]}>
              {strands[ri].map((s) => (
                <GoldLine
                  key={s.i}
                  pts={s.pts}
                  progress={seg(t, r.drawAt + s.i * 0.12, r.drawAt + 1.9 + s.i * 0.12, ease.out)}
                  radius={0.0065}
                  color={GOLD.line.clone().multiplyScalar((0.42 + 0.5 * smear) * gone)}
                  pen={s.i % 2 === 0 ? 0.3 : 0}
                  sparks={0}
                />
              ))}
              {/* Light streaks chasing round the ring once it is too fast to read. */}
              {smear > 0.01
                ? [0, 1, 2, 3, 4].map((k) => {
                    const arc: THREE.Vector3[] = [];
                    const a0 = (k / 5) * Math.PI * 2 + a * 1.8 * r.dir;
                    for (let i = 0; i <= 40; i++) {
                      const th = a0 + (i / 40) * 1.4 * r.dir;
                      arc.push(new THREE.Vector3(r.R * Math.cos(th), r.R * Math.sin(th), 0));
                    }
                    return <GoldLine key={`s${k}`} pts={arc} radius={0.014} color={GOLD.line.clone().multiplyScalar(1.3 * smear * gone)} pen={0} tailFade={1} />;
                  })
                : null}
              <Ribbon
                names={r.names}
                order={r.order}
                R={r.R + 0.3}
                bandH={r.bandH}
                born={(i) => {
                  const batch = i % 3;
                  return seg(t, r.batches[batch] + Math.floor(i / 3) * 0.07, r.batches[batch] + 0.45 + Math.floor(i / 3) * 0.07, ease.out);
                }}
                smear={smear}
                opacity={gone}
                quat={new THREE.Quaternion().setFromEuler(new THREE.Euler(...r.tilt)).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), a * r.dir))}
                shrink={shrink}
                cam={cam}
              />
            </group>
          </group>
        );
      })}
    </group>
  );
};
