import React, {useMemo} from "react";
import * as THREE from "three";
import {AbsoluteFill, Easing, staticFile, useCurrentFrame, useVideoConfig} from "remotion";
import {CAR, FINAL_WIDE, MOMENTS, ROOMS, TUNNEL, WALL} from "../pictures";
import {fonts, FontGate} from "./fonts";
import {Blade, wipeState} from "./world/Blade";
import {Card, TexPlane, useTexture} from "./world/Card";
import {Stage, type Cam, type Look} from "./world/Stage";
import {Nib, Stroke} from "./world/Stroke";
import {rng} from "./world/space";
import {BAY, D, Hall, litAt, LitPicture, PA, PH, picSrc, PZ, W} from "./Hall";
import manContour from "./man-contour.json";
import manFlakes from "./man-flakes.json";
import signData from "./signature.json";

/**
 * "Do Not Touch". A night in a monumental museum whose rule is cut into the floor. NOT breaks out of the stone, its dust becomes
 * a pen, and everything on the walls starts to change hands: your face, your product, your kid's birthday, your room, your city,
 * your language, your style, one photo in every form, a torn photograph. Then the pictures come off the walls as a tunnel, the far
 * end of the hall opens, and the pen writes the last line in the air. The museum speaks in carved capitals, you answer in a warm
 * italic. The light is cream white. Everything here is a pure function of the time t.
 */

export const DNT_SECONDS = 172;

const out = Easing.bezier(0.16, 1, 0.3, 1);
const glide = Easing.bezier(0.45, 0.05, 0.25, 1);
const soft = Easing.bezier(0.37, 0, 0.63, 1);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const mix = (a: number, b: number, k: number) => a + (b - a) * k;
const seg = (t: number, a: number, b: number, e: (x: number) => number = (x) => x) => e(clamp01((t - a) / (b - a)));

const LINE = new THREE.Color(1.5, 1.32, 1.04);
const BLADE_CORE = new THREE.Color(3.2, 2.9, 2.35);
const BLADE_HALO = new THREE.Color(1.3, 1.02, 0.66);
const HOT = new THREE.Color(1.75, 1.55, 1.2);
const SET = new THREE.Color(0.98, 0.93, 0.84);
const STONE = new THREE.Color(0.8, 0.77, 0.71);
const STONE_LIT = new THREE.Color(1.02, 0.97, 0.87);
const LOOK_: Look = {background: "#020203", bloom: {strength: 0.32, factors: [0.7, 0.5, 0.3, 0.12, 0.04]}, grain: 0.032, ca: 0.3, vignette: 0.42};

// ------------------------------------------------------------------ the two frames: the same clock and the same hall, staged again for 9:16

const FLOOR_Z_OPEN = 18;

type Fit = {
  rule: string[]; ruleW: number; ruleLead: number;
  high: {y: [number, number]; z: [number, number]; arc: number; fov: number; aim: number};
  walk: {fov: number; shift: number; turnFov: number; turnShift: number};
  fovHall: number; holdFov: number; holdShift: number;
  room: {dz: [number, number]; x: number; shift: number; fov: number};
  car: {dz: [number, number]; x: number; shift: number; fov: number};
  tunnel: {hw: number; hh: number; y: number}; diveFov: number;
  words: {y: number; w: number}; endFov: number;
  url: {size: number; caret: [number, number]};
  tall: boolean;
};
const WIDE: Fit = {
  rule: ["DO NOT TOUCH"], ruleW: 35, ruleLead: 0,
  high: {y: [15, 14], z: [49, 37], arc: 7, fov: 52, aim: FLOOR_Z_OPEN - 4},
  walk: {fov: 54, shift: 0.72, turnFov: 54, turnShift: 0.56},
  fovHall: 54, holdFov: 54, holdShift: 0.78,
  room: {dz: [16, 12], x: 13, shift: 0.8, fov: 54},
  car: {dz: [16, 11], x: 13, shift: 0.8, fov: 54},
  tunnel: {hw: 13, hh: 8, y: 9}, diveFov: 54,
  words: {y: 36, w: 40}, endFov: 54,
  url: {size: 54, caret: [3, 46]},
  tall: false,
};
const TALL: Fit = {
  rule: ["DO", "NOT", "TOUCH"], ruleW: 15, ruleLead: 6.2,
  high: {y: [26, 24], z: [46, 37], arc: 2.5, fov: 60, aim: FLOOR_Z_OPEN + 1},
  walk: {fov: 72, shift: 0.45, turnFov: 62, turnShift: 0.56},
  fovHall: 76, holdFov: 66, holdShift: 0.5,
  room: {dz: [5, 1], x: 21, shift: 0.3, fov: 90},
  car: {dz: [5, 1], x: 21, shift: 0.3, fov: 90},
  tunnel: {hw: 8, hh: 12.5, y: 14}, diveFov: 80,
  words: {y: 30, w: 24}, endFov: 60,
  url: {size: 72, caret: [4, 60]},
  tall: true,
};
const FitContext = React.createContext<Fit>(WIDE);

// ------------------------------------------------------------------ the clock (the seconds of the narration, see narration.md)

const OPEN = 14.2; // where the rule starts to break
const T = {
  wave0: 0.3, wave1: 2.6,
  tear: 3.8 + OPEN, dust: 6.6 + OPEN, down0: 6.1 + OPEN, down1: 8.5 + OPEN,
  mine: 7.3 + OPEN, mine1: 8.7 + OPEN, pen0: 9 + OPEN, pen1: 10.3 + OPEN, press: 10.6 + OPEN, fire0: 24.9, fire1: 26.95, strike: 26.9,
  turn0: 24.75, turn1: 27.1, back0: 28.6, back1: 30.9, talk: 30.6, talk1: 31.6, shot0: 31.9, shot1: 36.1,
  off0: 140, off1: 144.4,
  gather: 147.1, dive0: 147.6, hall2: 149.4, retract: 154.0, dive1: 155.4, rise0: 157.2, rise1: 161.4, write0: 160.6, write1: 163.6, dark0: 166, dark1: 167,
  url0: 167.6, url1: 168.7,
  trace0: 114.3, trace1: 115.55, gone: 115.85,
};

// ------------------------------------------------------------------ the carved capitals of the opening

type Glyph = {ch: string; tex: THREE.CanvasTexture; x: number; z: number; w: number; h: number};
const SIZE = 340;
const romanFont = () => `600 ${SIZE}px "${fonts.cinzel}"`;

const carvedGlyphs = (lines: string[], width: number, tracking: number, lead: number): Glyph[] => {
  const m = document.createElement("canvas").getContext("2d")!;
  m.font = romanFont();
  const glyphs: Glyph[] = [];
  const widest = Math.max(...lines.map((l) => m.measureText(l).width + l.length * tracking * SIZE));
  const k = width / widest;
  lines.forEach((text, line) => {
  const before = (i: number) => m.measureText(text.slice(0, i)).width + i * tracking * SIZE;
  const total = before(text.length);
  const z = FLOOR_Z_OPEN + (line - (lines.length - 1) / 2) * lead;
  [...text].forEach((ch, i) => {
    if (ch === " ") return;
    const adv = m.measureText(ch).width;
    const pad = SIZE * 0.14;
    const c = document.createElement("canvas");
    c.width = Math.ceil(adv + 2 * pad);
    c.height = Math.ceil(SIZE * 1.3);
    const g = c.getContext("2d")!;
    g.font = romanFont();
    g.textBaseline = "middle";
    const y = c.height * 0.53;
    g.fillStyle = "#040302";
    g.fillText(ch, pad - 7, y - 10);
    const gr = g.createLinearGradient(0, y - SIZE * 0.4, 0, y + SIZE * 0.4);
    gr.addColorStop(0, "#c9bda6");
    gr.addColorStop(1, "#efe6d2");
    g.fillStyle = gr;
    g.fillText(ch, pad, y);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 16;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    glyphs.push({ch, tex: t, x: (before(i) + adv / 2 - total / 2) * k, z, w: c.width * k, h: c.height * k});
  });
  });
  return glyphs;
};

const FLAT: [number, number, number] = [-Math.PI / 2, 0, 0];
const SH = {crack: T.tear - 0.3, lift: T.tear + 0.55, end: T.dust + 0.1};

const FloorRule: React.FC<{t: number; lit: number}> = ({t, lit}) => {
  const fit = React.useContext(FitContext);
  const glyphs = useMemo(() => carvedGlyphs(fit.rule, fit.ruleW, 0.05, fit.ruleLead), [fit]);
  const after = seg(t, T.tear + 0.3, T.tear + 1.5, soft);
  if (t > T.down1 + 3) return null;
  return (
    <>
      {glyphs.map((g, i) => {
        const isNot = i >= 2 && i <= 4;
        const dark = mix(0.05, 1, lit);
        if (!isNot) return <TexPlane key={i} tex={g.tex} w={g.w} h={g.h} position={[g.x, 0.05, g.z]} rotation={FLAT} tint={STONE.clone().lerp(STONE_LIT, after).multiplyScalar(dark)} depthWrite={false} renderOrder={12} />;
        const glow = seg(t, SH.crack, SH.lift, soft) * (1 - seg(t, SH.lift + 0.1, SH.lift + 1.0, soft));
        const cut = seg(t, SH.lift - 0.1, SH.lift + 0.5, soft);
        return (
          <group key={i}>
            <TexPlane tex={g.tex} w={g.w} h={g.h} position={[g.x, 0.04, g.z]} rotation={FLAT} tint={new THREE.Color(0.012, 0.011, 0.01)} opacity={0.86 * cut} depthWrite={false} renderOrder={11} />
            {glow > 0.002 ? <TexPlane tex={g.tex} w={g.w} h={g.h} position={[g.x, 0.045, g.z]} rotation={FLAT} tint={new THREE.Color(2.5, 2.15, 1.6)} opacity={glow} depthWrite={false} renderOrder={12} /> : null}
            <Shards g={g} t={t} dark={dark} seed={31 + i} origin={glyphs[3].x} order={i - 2} />
          </group>
        );
      })}
    </>
  );
};

type Shard = {c: [number, number]; v: Array<[number, number]>; uv: Array<[number, number]>; dist: number; delay: number; rise: number; driftX: number; driftZ: number; axis: THREE.Vector3; turn: number; shine: number};

const shardsOf = (g: Glyph, seed: number, origin: number): Shard[] => {
  const img = g.tex.image as HTMLCanvasElement;
  const px = img.getContext("2d")!.getImageData(0, 0, img.width, img.height).data;
  const solid = (u: number, v: number) => px[(Math.floor((1 - v) * (img.height - 1)) * img.width + Math.floor(u * (img.width - 1))) * 4 + 3] > 40;
  const r = rng(seed);
  const nx = 4;
  const ny = 5;
  const corners: Array<Array<[number, number]>> = [];
  for (let j = 0; j <= ny; j++) {
    corners.push([]);
    for (let i = 0; i <= nx; i++) corners[j].push([i / nx + (i > 0 && i < nx ? (r() - 0.5) * 0.15 : 0), j / ny + (j > 0 && j < ny ? (r() - 0.5) * 0.11 : 0)]);
  }
  const out_: Shard[] = [];
  const add = (a: [number, number], b: [number, number], c: [number, number]) => {
    const cu = (a[0] + b[0] + c[0]) / 3;
    const cv = (a[1] + b[1] + c[1]) / 3;
    const mid = (p: [number, number]) => solid((p[0] + cu) / 2, (p[1] + cv) / 2);
    if (!solid(cu, cv) && !mid(a) && !mid(b) && !mid(c)) return;
    const cx = (cu - 0.5) * g.w;
    const cy = (cv - 0.5) * g.h;
    const tri = [a, b, c].map((p) => [(p[0] - 0.5) * g.w - cx, (p[1] - 0.5) * g.h - cy] as [number, number]);
    out_.push({
      c: [cx, cy],
      v: tri,
      uv: [a, b, c],
      dist: Math.hypot(g.x + cx - origin, cy),
      delay: r(),
      rise: 1.5 + r() * r() * 9,
      driftX: (g.x + cx - origin) * (0.08 + r() * 0.16) + (r() - 0.5) * 1.6,
      driftZ: (r() - 0.6) * 5,
      axis: new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize(),
      turn: 0.7 + r() * 1.7,
      shine: 0.86 + r() * 0.28,
    });
  };
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const [p00, p10, p11, p01] = [corners[j][i], corners[j][i + 1], corners[j + 1][i + 1], corners[j + 1][i]];
      if (r() < 0.5) {
        add(p00, p10, p11);
        add(p00, p11, p01);
      } else {
        add(p00, p10, p01);
        add(p10, p11, p01);
      }
    }
  return out_;
};

const Shards: React.FC<{g: Glyph; t: number; dark: number; seed: number; origin: number; order: number}> = ({g, t, dark, seed, origin, order}) => {
  const {shards, top, under} = useMemo(() => {
    const shards = shardsOf(g, seed, origin);
    const make = () => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(shards.length * 9), 3));
      geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(shards.length * 9), 3));
      geo.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(shards.flatMap((s) => s.uv.flat())), 2));
      return geo;
    };
    return {shards, top: make(), under: make()};
  }, [g, seed, origin]);
  const matTop = useMemo(() => new THREE.MeshBasicMaterial({map: g.tex, vertexColors: true, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, toneMapped: false, depthWrite: false}), [g]);
  const matUnder = useMemo(() => new THREE.MeshBasicMaterial({map: g.tex, color: new THREE.Color(0.05, 0.045, 0.04), transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, toneMapped: false, depthWrite: false}), [g]);
  const matMirror = useMemo(() => new THREE.MeshBasicMaterial({map: g.tex, vertexColors: true, transparent: true, opacity: 0.3, alphaTest: 0.35, side: THREE.DoubleSide, toneMapped: false, depthWrite: false}), [g]);
  const ptop = top.attributes.position as THREE.BufferAttribute;
  const ctop = top.attributes.color as THREE.BufferAttribute;
  const punder = under.attributes.position as THREE.BufferAttribute;
  const rise = Easing.bezier(0.5, 0, 0.3, 1);
  const rise0 = Easing.bezier(0.42, 0, 0.25, 1);
  const whole = seg(t, SH.lift + order * 0.2, SH.lift + order * 0.2 + 2.3, rise0);
  const tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.95 * whole);
  const lift = new THREE.Vector3(g.x + (g.x - origin) * 0.16 * whole, 0.07 + 8.5 * whole, g.z - 2.5 * whole);
  const rel = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3();
  const p = new THREE.Vector3();
  shards.forEach((s, n) => {
    const crack = seg(t, SH.crack + s.dist * 0.035, SH.crack + s.dist * 0.035 + 0.28, soft);
    const start = SH.lift + 0.8 + s.delay * 0.8 + order * 0.2;
    const k = seg(t, start, start + 2.2, rise);
    const wear = seg(t, SH.end - 0.9 + s.delay * 0.6, SH.end + s.delay * 0.6, soft);
    const size = mix(1, 0.9, crack) * (1 - wear);
    const shake = crack * (1 - seg(t, SH.lift, SH.lift + 0.2)) * 0.012 * Math.sin(t * 70 + n);
    q.setFromAxisAngle(s.axis, s.turn * k).premultiply(tilt);
    rel.set(s.c[0], 0, -s.c[1]).applyQuaternion(tilt);
    const cx = lift.x + rel.x + s.driftX * k + shake;
    const cy = lift.y + rel.y + s.rise * k;
    const cz = lift.z + rel.z + s.driftZ * k;
    up.set(0, 1, 0).applyQuaternion(q);
    const facet = mix(0.5, 1.3, Math.abs(up.y) * 0.45 + Math.abs(up.z) * 0.55) * s.shine;
    const shade = whole > 0 ? mix(1, facet, seg(whole, 0, 0.3)) : 1;
    const heat = crack * (1 - seg(t, SH.lift + 0.2, SH.lift + 1.4, soft)) * 0.35;
    const col = (0.8 + heat) * shade * mix(0.05, 1, dark);
    s.v.forEach((v, m) => {
      p.set(v[0] * size, 0, -v[1] * size).applyQuaternion(q);
      ptop.setXYZ(n * 3 + m, cx + p.x, cy + p.y, cz + p.z);
      ctop.setXYZ(n * 3 + m, col, col * 0.965, col * 0.89);
      punder.setXYZ(n * 3 + m, cx + p.x - up.x * 0.34, cy + p.y - up.y * 0.34, cz + p.z - up.z * 0.34);
    });
  });
  ptop.needsUpdate = true;
  ctop.needsUpdate = true;
  punder.needsUpdate = true;
  if (t > SH.end + 0.8) return null;
  return (
    <>
      <group scale={[1, -1, 1]}>
        <mesh geometry={top} material={matMirror} renderOrder={3} frustumCulled={false} />
      </group>
      {t > SH.lift ? <mesh geometry={under} material={matUnder} renderOrder={19} frustumCulled={false} /> : null}
      <mesh geometry={top} material={matTop} renderOrder={20} frustumCulled={false} />
    </>
  );
};

const DUST_N = 190;
const Dust: React.FC<{t: number; to: THREE.Vector3}> = ({t, to}) => {
  const {geom, seeds} = useMemo(() => {
    const r = rng(77);
    const seeds = new Array(DUST_N).fill(0).map(() => ({x: (r() - 0.5) * 11, z: FLOOR_Z_OPEN + (r() - 0.5) * 2.4, vx: (r() - 0.5) * 7, vy: 3 + r() * 11, vz: -r() * 9, ph: r() * 6.28, late: r() * 0.7}));
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(new Float32Array(DUST_N * 3), 3));
    return {geom, seeds};
  }, []);
  const mat = useMemo(() => new THREE.PointsMaterial({color: new THREE.Color(1.3, 1.15, 0.9), size: 0.075, transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending}), []);
  if (t < T.tear || t > T.mine + 0.25) return null;
  const pos = geom.attributes.position as THREE.BufferAttribute;
  seeds.forEach((s, i) => {
    const k = seg(t, T.tear + 0.9 + s.late * 0.9, T.tear + 3.4, out);
    const a = new THREE.Vector3(s.x + s.vx * k + 0.3 * Math.sin(t * 1.3 + s.ph), 0.2 + s.vy * k, s.z + s.vz * k);
    a.lerp(to, seg(t, T.dust + s.late * 0.35, T.mine + 0.05, Easing.bezier(0.6, 0, 0.8, 0.4)));
    pos.setXYZ(i, a.x, a.y, a.z);
  });
  pos.needsUpdate = true;
  mat.opacity = 0.75 * seg(t, T.tear + 0.9, T.tear + 1.8, soft);
  return <points geometry={geom} material={mat} renderOrder={36} frustumCulled={false} />;
};

// ------------------------------------------------------------------ the italic, written by the pen

const ITALIC_SIZE = 420;
const wordTex = (text: string) => {
  const font = `italic 500 ${ITALIC_SIZE}px "${fonts.bodoni}"`;
  const m = document.createElement("canvas").getContext("2d")!;
  m.font = font;
  const ink = m.measureText(text).width;
  const c = document.createElement("canvas");
  c.width = Math.ceil(ink + ITALIC_SIZE);
  c.height = Math.ceil(ITALIC_SIZE * 1.9);
  const g = c.getContext("2d")!;
  g.font = font;
  g.textBaseline = "middle";
  g.fillStyle = "#fff";
  g.fillText(text, ITALIC_SIZE / 2, c.height * 0.5);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 16;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return {t, ink, full: c.width, h: c.height};
};

const penOf = (c: THREE.Vector3, width: number, t: number, t0: number, t1: number, h: number) => {
  const e = seg(t, t0, t1, (x) => x);
  const x = c.x - width / 2 + e * width;
  return new THREE.Vector3(x, c.y - h * 0.08 + Math.sin(e * Math.PI * 9) * h * 0.13, c.z + 0.1);
};

const Written: React.FC<{text: string; t: number; t0: number; t1: number; c: THREE.Vector3; width: number; fadeAt: number; fadeLen?: number; reflect?: boolean; nib?: number}> = ({text, t, t0, t1, c, width, fadeAt, fadeLen = 0.8, reflect = true, nib = 1.1}) => {
  const w = useMemo(() => wordTex(text), [text]);
  if (t < t0 || t > fadeAt + fadeLen) return null;
  const k = width / w.ink;
  const pw = w.full * k;
  const ph = w.h * k;
  const u0 = ITALIC_SIZE / 2 / w.full;
  const u1 = (ITALIC_SIZE / 2 + w.ink) / w.full;
  const e = seg(t, t0, t1, (x) => x);
  const wipe = e >= 1 ? 10 : mix(u0, u1, e);
  const color = HOT.clone().lerp(SET, seg(t, t1 - 0.2, t1 + 0.8, soft));
  const op = 1 - seg(t, fadeAt, fadeAt + fadeLen, soft);
  const settle = 1.02 - 0.02 * seg(t, t0, fadeAt, soft);
  return (
    <>
      <group scale={[1, -1, 1]} visible={reflect}>
        <TexPlane tex={w.t} w={pw * settle} h={ph * settle} position={c} tint={color.clone().multiplyScalar(0.28)} opacity={op} blur={0.14} wipe={wipe} wipeSoft={0.012} depthWrite={false} renderOrder={3} />
      </group>
      <TexPlane tex={w.t} w={pw * settle} h={ph * settle} position={c} tint={color} opacity={op} wipe={wipe} wipeSoft={0.012} wipeGlow={e < 1 ? 0.7 : 0} accent={HOT} depthWrite={false} renderOrder={34} />
      {e > 0 && e < 1 ? <Nib position={penOf(c, width, t, t0, t1, ph * 0.5)} finish="neon" color={LINE} size={nib} renderOrder={40} /> : null}
    </>
  );
};

// ------------------------------------------------------------------ the button and the line's first runs

const MINE_C = new THREE.Vector3(0, 17.5, -24);
const MINE_W = 27;
const BUTTON_C = new THREE.Vector3(0, 6.5, -24);
const BW = 13;
const BH = 3.15;

const buttonTex = () => {
  const c = document.createElement("canvas");
  c.width = 1000;
  c.height = 242;
  const g = c.getContext("2d")!;
  g.fillStyle = "#f4efe4";
  g.beginPath();
  g.roundRect(0, 0, 1000, 242, 121);
  g.fill();
  g.fillStyle = "#14120e";
  g.font = `italic 500 120px "${fonts.bodoni}"`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("Make it mine", 500, 124);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 16;
  return t;
};

const penPath = () => {
  const r = BH / 2;
  const z = BUTTON_C.z + 0.1;
  const start = new THREE.Vector3(MINE_C.x + MINE_W / 2, MINE_C.y - 2.4, z);
  const lead = new THREE.CatmullRomCurve3([start, new THREE.Vector3(9, 13, z), new THREE.Vector3(3, BUTTON_C.y + r + 1.5, z), new THREE.Vector3(BUTTON_C.x - BW / 2 + r, BUTTON_C.y + r, z)], false, "centripetal").getPoints(90);
  const pts = [...lead];
  const add = (cx: number, a0: number) => {
    for (let k = 1; k <= 24; k++) {
      const a = a0 - (k / 24) * Math.PI;
      pts.push(new THREE.Vector3(BUTTON_C.x + cx + Math.cos(a) * r, BUTTON_C.y + Math.sin(a) * r, z));
    }
  };
  for (let k = 1; k <= 24; k++) pts.push(new THREE.Vector3(BUTTON_C.x - BW / 2 + r + (k / 24) * (BW - 2 * r), BUTTON_C.y + r, z));
  add(BW / 2 - r, Math.PI / 2);
  for (let k = 1; k <= 24; k++) pts.push(new THREE.Vector3(BUTTON_C.x + BW / 2 - r - (k / 24) * (BW - 2 * r), BUTTON_C.y - r, z));
  add(-BW / 2 + r, -Math.PI / 2);
  return pts;
};

const Button: React.FC<{t: number}> = ({t}) => {
  const tex = useMemo(buttonTex, []);
  const path = useMemo(penPath, []);
  const p = seg(t, T.pen0, T.pen1, glide);
  const fill = seg(t, T.pen1 - 0.35, T.pen1 + 0.05, soft);
  const pr = Math.sin(Math.PI * seg(t, T.press, T.press + 0.22));
  const gone = seg(t, T.press + 0.3, T.press + 0.85, soft);
  const glow = 1 + 0.7 * Math.sin(Math.PI * seg(t, T.press, T.press + 0.5));
  const w = BW * (1 - 0.05 * pr);
  return (
    <>
      {p > 0 && t < T.pen1 + 0.25 ? <Stroke pts={path} progress={p} finish="neon" color={LINE} radius={0.045} pen={p < 1 ? 0.9 : 0} tailLen={0} time={t} opacity={1 - seg(t, T.pen1, T.pen1 + 0.25)} renderOrder={42} /> : null}
      {fill > 0 && gone < 1 ? (
        <>
          <TexPlane tex={tex} w={w} h={w * 0.242} position={[0, -BUTTON_C.y, BUTTON_C.z]} rotation={[Math.PI, 0, 0]} tint={new THREE.Color(0.28, 0.26, 0.23)} opacity={fill * (1 - gone)} blur={0.1} depthWrite={false} renderOrder={3} />
          <TexPlane tex={tex} w={w} h={w * 0.242} position={BUTTON_C} tint={new THREE.Color(glow, glow, glow)} opacity={fill * (1 - gone)} depthWrite={false} renderOrder={44} />
        </>
      ) : null}
    </>
  );
};

const PIC_Z = -BAY;
const firePath = () => {
  const x = W + D - 0.25;
  const hw = (PH * PA) / 2 + 0.25;
  const y0 = PZ - PH / 2 - 0.25;
  const y1 = PZ + PH / 2 + 0.25;
  const c = new THREE.CatmullRomCurve3([BUTTON_C.clone(), new THREE.Vector3(8, 16, BUTTON_C.z - 4), new THREE.Vector3(x - 7, y1 + 1.4, PIC_Z + hw + 7), new THREE.Vector3(x - 0.8, y1 + 0.2, PIC_Z + hw + 0.7), new THREE.Vector3(x, y1, PIC_Z + hw)], false, "centripetal");
  const pts = c.getPoints(120);
  const w = [
    [PIC_Z + hw, y1],
    [PIC_Z - hw, y1],
    [PIC_Z - hw, y0],
    [PIC_Z + hw, y0],
    [PIC_Z + hw, y1],
  ];
  for (let i = 0; i < 4; i++) for (let k = 1; k <= 40; k++) pts.push(new THREE.Vector3(x, w[i][1] + ((w[i + 1][1] - w[i][1]) * k) / 40, w[i][0] + ((w[i + 1][0] - w[i][0]) * k) / 40));
  return pts;
};

const TALK_C = new THREE.Vector3(0, 18, -44);
const TALK_W = 22;
const shotPath = () => new THREE.CatmullRomCurve3([new THREE.Vector3(TALK_C.x + TALK_W / 2, TALK_C.y - 3, TALK_C.z + 0.1), new THREE.Vector3(-1.5, 14, -100), new THREE.Vector3(1.5, 16, -170), new THREE.Vector3(0, 18, -252)], false, "centripetal").getPoints(500);

// ------------------------------------------------------------------ what hangs where, and when it changes hands

type State = {id: string; at?: number; len?: number; dir?: number};
type Hanging = {row: number; side: -1 | 1; states: State[]; height?: number; aspect?: number; chip?: {id: string; w?: number; at: number; out: number}};

const zOf = (row: number) => (1 - row) * BAY;

const wall = (n: number): State[] => [{id: WALL[n % WALL.length]}];
const m = MOMENTS;

const HANG: Hanging[] = [
  {row: 0, side: -1, states: wall(0)},
  {row: 0, side: 1, states: wall(1)},
  {row: 1, side: -1, states: wall(2)},
  {row: 1, side: 1, states: wall(3)},
  {row: 2, side: -1, states: wall(4)},
  // the first picture the line changes
  {row: 2, side: 1, states: [{id: m.first.from}, {id: m.first.to, at: T.strike}]},
  {row: 3, side: -1, states: wall(5)},
  {row: 3, side: 1, states: wall(6)},
  {row: 4, side: -1, states: wall(7)},
  {row: 4, side: 1, states: wall(8)},
  {row: 5, side: -1, states: wall(9)},
  {row: 5, side: 1, states: wall(10)},
  {row: 6, side: -1, states: wall(11)},
  {row: 6, side: 1, states: wall(12)},
  // your face
  {row: 7, side: -1, states: wall(13)},
  {row: 7, side: 1, states: [{id: m.face.from}, {id: m.face.to, at: 40.9}], chip: {id: m.face.chip, at: 39.2, out: 41.6}},
  // your product, then your dinner
  {row: 8, side: -1, states: wall(14)},
  {row: 8, side: 1, states: [{id: m.product.from}, {id: m.product.to, at: 47.4}], chip: {id: m.product.chip, at: 45.6, out: 48.1}},
  {row: 9, side: -1, states: wall(15)},
  {row: 9, side: 1, states: [{id: m.dinner.from}, {id: m.dinner.to, at: 52.6}]},
  // your kid's birthday: the photo is only ever a very small chip in the corner
  {row: 10, side: -1, states: [{id: m.birthday.from}, {id: m.birthday.to, at: 59.2}], chip: {id: m.birthday.chip, w: 3.1, at: 58.3, out: 60.0}},
  {row: 10, side: 1, states: wall(16)},
  {row: 11, side: 1, states: wall(17)},
  {row: 12, side: 1, states: wall(18)},
  // same poster, another city
  {row: 13, side: -1, states: [{id: m.city.from}, {id: m.city.to, at: 76.1}]},
  {row: 13, side: 1, states: wall(19)},
  // the ad you love, in your language
  {row: 14, side: -1, states: [{id: m.language[0]}, {id: m.language[1], at: 82.25}, {id: m.language[2], at: 83.6}]},
  {row: 14, side: 1, states: wall(20)},
  // your photo, in any style
  {row: 15, side: -1, states: wall(21)},
  {row: 15, side: 1, states: [{id: m.style[0]}, {id: m.style[1], at: 90.7, len: 58}, {id: m.style[2], at: 91.9, len: 58, dir: 1}, {id: m.style[3], at: 93.05, len: 58, dir: 2}, {id: m.style[4], at: 94.2, len: 58, dir: 3}, {id: m.style[5], at: 95.35, len: 58, dir: 1}, {id: m.style[6], at: 96.55, len: 84, dir: 2}]},
  {row: 16, side: -1, states: wall(22)},
  {row: 17, side: -1, states: wall(23)},
  // the dog too, and the cat nobody asked for
  {row: 18, side: -1, states: wall(24)},
  {row: 18, side: 1, states: [{id: m.dog.from}, {id: m.dog.to, at: 120.3}]},
  {row: 19, side: -1, states: wall(25)},
  {row: 19, side: 1, states: [{id: m.cat}]},
  // the torn photo
  {row: 20, side: -1, states: wall(26)},
  {row: 20, side: 1, states: [{id: m.restored.from}, {id: m.restored.to, at: 132.25}], height: 27, aspect: 0.75},
  // the great hall: everything you just saw, yours
  {row: 21, side: -1, states: wall(27)},
  {row: 21, side: 1, states: wall(28)},
  {row: 22, side: -1, states: wall(29)},
  {row: 22, side: 1, states: wall(30)},
  {row: 23, side: -1, states: wall(31)},
  {row: 23, side: 1, states: wall(32)},
  {row: 24, side: -1, states: wall(33)},
  {row: 24, side: 1, states: wall(34)},
  {row: 25, side: -1, states: wall(35)},
  {row: 25, side: 1, states: wall(36)},
  {row: 26, side: -1, states: wall(37)},
  {row: 26, side: 1, states: wall(38)},
  {row: 27, side: -1, states: wall(39)},
  {row: 28, side: -1, states: wall(40)},
  {row: 29, side: -1, states: wall(41)},
  {row: 29, side: 1, states: wall(42)},
  {row: 30, side: -1, states: wall(43)},
  {row: 30, side: 1, states: wall(44)},
];

const WIPE_LEN = 80;
const stateOf = (states: State[], t: number) => {
  let i = 0;
  for (let k = 1; k < states.length; k++) if ((states[k].at ?? 0) <= t) i = k;
  if (i === 0) return {a: states[0].id, b: states[0].id, wipe: 0, st: null, dir: 0};
  const st = wipeState(t * 60, (states[i].at as number) * 60, states[i].len ?? WIPE_LEN);
  return {a: states[i - 1].id, b: states[i].id, wipe: st.shown ? (st.done ? 2 : st.wipe) : 0, st, dir: states[i].dir ?? 0};
};

const onWallAt = (side: -1 | 1, z0: number, lx: number, ly: number, off: number) => new THREE.Vector3(side * (W + D - off), ly, z0 + (side === 1 ? lx : -lx));
const sideRot = (side: -1 | 1): [number, number, number] => [0, -side * (Math.PI / 2), 0];

/** The pictures of both walls, the mirrored copy included, with their blades and the small photo each one starts from. */
const Pictures: React.FC<{mirror: boolean; t: number; cz: number; onZ: number; offZ: number; ember: number; level?: number}> = ({mirror, t, cz, onZ, offZ, ember, level}) => (
  <>
    {HANG.map((p) => {
      const z = zOf(p.row);
      if (z > cz + 70 || z < cz - 330) return null;
      const s = stateOf(p.states, t);
      const lit = level ?? mix(litAt(z, onZ, offZ), 1, ember * litAt(z, onZ, 1e5));
      return <LitPicture key={`${p.row}${p.side}`} id={s.a} next={s.b !== s.a ? s.b : undefined} wipe={s.wipe} side={p.side} z={z} mirror={mirror} order={mirror ? -8 : 20} lit={lit} height={p.height} aspect={p.aspect} dir={s.dir} />;
    })}
  </>
);

const Actions: React.FC<{t: number; cz: number}> = ({t, cz}) => (
  <>
    {HANG.map((p) => {
      const z = zOf(p.row);
      if (z > cz + 70 || z < cz - 200) return null;
      const s = stateOf(p.states, t);
      const h = p.height ?? PH;
      const w = h * (p.aspect ?? PA);
      const blade = s.st && s.st.on ? Math.min(s.st.wipe, 1.01) : null;
      const chip = p.chip;
      const chipW = chip?.w ?? 6;
      const chipK = chip ? seg(t, chip.at, chip.at + 0.5, out) * (1 - seg(t, chip.out, chip.out + 0.5, soft)) : 0;
      return (
        <group key={`${p.row}${p.side}`}>
          {blade !== null && s.st ? (
            <group position={[p.side * (W + D - 0.2), PZ, z]} rotation={sideRot(p.side)}>
              {s.dir < 2 ? (
                <>
                  <Blade x={(s.dir === 1 ? 0.5 - blade : blade - 0.5) * w} to={s.st.to} height={h + 0.2} k={2.2} time={t} intensity={0.7} core={BLADE_CORE} halo={BLADE_HALO} />
                  <Nib position={new THREE.Vector3((s.dir === 1 ? 0.5 - blade : blade - 0.5) * w, h / 2 + 0.05, 0.12)} finish="neon" color={LINE} size={0.5 * Math.min(s.st.to * 2, 1)} renderOrder={72} />
                </>
              ) : (
                <>
                  {/* the same blade laid on its side */}
                  <group rotation={[0, 0, Math.PI / 2]}>
                    <Blade x={(s.dir === 2 ? 0.5 - blade : blade - 0.5) * h} to={s.st.to} height={w + 0.2} k={2.2} time={t} intensity={0.7} core={BLADE_CORE} halo={BLADE_HALO} />
                  </group>
                  <Nib position={new THREE.Vector3(-w / 2 - 0.05, (s.dir === 2 ? 0.5 - blade : blade - 0.5) * h, 0.12)} finish="neon" color={LINE} size={0.5 * Math.min(s.st.to * 2, 1)} renderOrder={72} />
                </>
              )}
            </group>
          ) : null}
          {chip && chipK > 0.001 ? (
            <Card src={picSrc(chip.id)} w={chipW} h={(chipW * 4) / 3} position={onWallAt(p.side, z, -w / 2 - 0.2, PZ - h / 2 + (chipW * 2) / 3 + 1.4 - (1 - chipK) * 1.1, 0.75)} rotation={sideRot(p.side)} opacity={chipK} corner={0.28} rim={0.5} rimWidth={0.05} rimColor={new THREE.Color(1.2, 1.15, 1.05)} depthWrite={false} renderOrder={34} />
          ) : null}
          {chip && p.states[1]?.at ? <ChipLine side={p.side} z={z} w={w} h={h} chipW={chipW} t={t} at={p.states[1].at as number} /> : null}
        </group>
      );
    })}
  </>
);

/** The line leaves the small photo, climbs the frame and hands over to the blade at the top corner. */
const ChipLine: React.FC<{side: -1 | 1; z: number; w: number; h: number; chipW: number; t: number; at: number}> = ({side, z, w, h, chipW, t, at}) => {
  const pts = useMemo(() => {
    const y0 = PZ - h / 2 + (chipW * 4) / 3 + 1.5;
    const out_: THREE.Vector3[] = [];
    for (let k = 0; k <= 60; k++) out_.push(onWallAt(side, z, -w / 2 - 0.2, mix(y0, PZ + h / 2 + 0.1, k / 60), 0.7));
    return out_;
  }, [side, z, w, h, chipW]);
  const p = seg(t, at - 0.72, at, glide);
  if (p <= 0 || p >= 1) return null;
  return <Stroke pts={pts} progress={p} finish="neon" color={LINE} radius={0.05} pen={1} tailLen={14} time={t} renderOrder={48} />;
};

// ------------------------------------------------------------------ a wide picture, whose frame changes shape

const FP_VS = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FP_FS = /* glsl */ `
  uniform sampler2D a;
  uniform sampler2D b;
  uniform vec2 coverA;
  uniform vec2 coverB;
  uniform float wipe;
  uniform float spotOn;
  uniform vec2 spotC;
  uniform float spotR;
  uniform vec2 size;
  uniform float lit;
  uniform float exposure;
  uniform float blur;
  uniform sampler2D mask;
  uniform float maskOn;
  uniform float maskK;
  uniform float selected;
  uniform float full;
  uniform float dir;
  varying vec2 vUv;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  void main() {
    vec4 ca = texture2D(a, (vUv - 0.5) * coverA + 0.5);
    vec4 cb = texture2D(b, (vUv - 0.5) * coverB + 0.5);
    vec4 col = ca;
    vec3 glow = vec3(0.0);
    if (maskOn > 0.5) {
      // he goes the way snow goes: grains of him lift away from the top down the wind, the road was there all along
      float m = texture2D(mask, vUv).r;
      float grain = noise(vUv * vec2(520.0, 293.0)) * 0.6 + noise(vUv * vec2(120.0, 68.0)) * 0.4;
      float e = smoothstep(grain - 0.06, grain + 0.06, maskK * 1.25 - 0.12);
      col = mix(mix(ca, cb, m * e), cb, full);
      float edge = m * smoothstep(0.0, 0.12, e) * (1.0 - smoothstep(0.12, 0.5, e)) * step(0.001, maskK);
      glow = vec3(1.15, 1.02, 0.84) * 1.5 * edge + vec3(1.0, 0.92, 0.78) * 0.09 * m * selected * (1.0 - e);
    } else {
      // 0 left to right, 1 right to left, 2 top down, 3 bottom up
      float along = dir < 0.5 ? vUv.x : dir < 1.5 ? 1.0 - vUv.x : dir < 2.5 ? 1.0 - vUv.y : vUv.y;
      if (wipe > 0.0 && along < wipe) {
        col = cb;
        glow = vec3(1.15, 1.0, 0.78) * 0.5 * exp(-(wipe - along) / 0.03) * step(wipe, 1.0);
      }
    }
    vec2 p = (vUv - vec2(0.5, 1.0)) * size;
    float light = 0.0;
    for (int i = 0; i < 3; i++) {
      float lx = (float(i) - 1.0) * size.x * 0.32;
      vec3 l = vec3(lx - p.x, 0.8 - p.y, 3.2);
      float d2 = dot(l, l) + 18.0;
      light += 14.0 * l.z / (d2 * sqrt(d2)) * 14.0;
    }
    light = min(0.5 + exposure * light, 1.08);
    gl_FragColor = vec4((col.rgb * light * mix(0.025, 1.0, lit) + glow * col.a) * col.a, col.a);
  }
`;

type WallState = {id: string; aspect: number; at?: number; len?: number; keyed?: boolean; dir?: number};
const frameOf = (aspect: number): [number, number] => (aspect > 1.5 ? [28 * aspect, 28] : aspect > 0.9 ? [30, 30] : [32 * aspect, 32]);

const FramePicture: React.FC<{side: -1 | 1; z: number; states: WallState[]; t: number; lit: number; mirror: boolean; man?: {t0: number; at: number; len: number; state: number}}> = ({side, z, states, t, lit, mirror, man}) => {
  let i = 0;
  for (let k = 1; k < states.length; k++) if ((states[k].at ?? 0) <= t) i = k;
  const cur = states[i];
  const prev = states[Math.max(0, i - 1)];
  const texA = useTexture(picSrc(prev.id));
  const texB = useTexture(picSrc(cur.id));
  const maskTex = useTexture(picSrc(CAR.manMask));
  const manClean = useTexture(picSrc(CAR.withoutMan));
  const mat = useMemo(() => new THREE.ShaderMaterial({vertexShader: FP_VS, fragmentShader: FP_FS, transparent: true, premultipliedAlpha: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, uniforms: {a: {value: null}, b: {value: null}, coverA: {value: new THREE.Vector2(1, 1)}, coverB: {value: new THREE.Vector2(1, 1)}, wipe: {value: 0}, spotOn: {value: 0}, spotC: {value: new THREE.Vector2()}, spotR: {value: 0}, size: {value: new THREE.Vector2()}, lit: {value: 1}, exposure: {value: 0.42}, blur: {value: 0}, mask: {value: null}, maskOn: {value: 0}, maskK: {value: 0}, selected: {value: 0}, full: {value: 0}, dir: {value: 0}}}), []);
  const frameMat = useMemo(() => new THREE.MeshBasicMaterial({color: "#050403", toneMapped: false, transparent: true, depthWrite: false, side: THREE.DoubleSide}), []);
  if (!texA || !texB || !maskTex) return null;
  const st = i > 0 && !(man && i === man.state) ? wipeState(t * 60, (cur.at as number) * 60, cur.len ?? 42) : null;
  const morph = st ? seg(t, cur.at as number, (cur.at as number) + 1.1, smoother) : 1;
  const [wa, ha] = frameOf(prev.aspect);
  const [wb, hb] = frameOf(cur.aspect);
  const w = mix(wa, wb, morph);
  const h = mix(ha, hb, morph);
  const fa = w / h;
  // the picture keeps its own shape; the frame crops it
  const cover = (tex: THREE.Texture) => {
    const img = tex.image as {width: number; height: number};
    const ta = img.width / img.height;
    return fa > ta ? new THREE.Vector2(1, ta / fa) : new THREE.Vector2(fa / ta, 1);
  };
  const u = mat.uniforms;
  u.a.value = texA;
  u.b.value = texB;
  u.coverA.value.copy(cover(texA));
  u.coverB.value.copy(cover(texB));
  u.wipe.value = st && st.shown ? (st.done ? 2 : st.wipe) : 0;
  u.size.value.set(w, h);
  u.lit.value = lit;
  u.dir.value = cur.dir ?? 0;
  u.exposure.value = mirror ? 0.2 : 0.42;
  // the man: selected on the snow picture, then he goes; the clean picture is only ever seen through his shape
  const onMan = man !== undefined && (i === man.state || i === man.state - 1) && t >= man.t0;
  u.maskOn.value = onMan ? 1 : 0;
  if (onMan && man) {
    u.mask.value = maskTex;
    u.a.value = i === man.state ? (texA as THREE.Texture) : texB;
    u.b.value = manClean ?? texB;
    u.wipe.value = 0;
    u.selected.value = seg(t, man.t0 + 0.8, man.at, soft);
    u.maskK.value = seg(t, man.at, man.at + man.len, (x) => x);
    u.full.value = seg(t, man.at + 0.25, man.at + 1.35, soft);
  }
  // the frame fades away with the background and comes back with it
  const keyedNow = cur.keyed ? seg(t, (cur.at as number) + 0.2, (cur.at as number) + 0.8, soft) : prev.keyed ? 1 - seg(t, cur.at as number, (cur.at as number) + 0.3, soft) : 0;
  frameMat.opacity = 1 - keyedNow;
  const bladeU = st && st.on ? Math.min(st.wipe, 1.01) : null;
  return (
    <group position={[side * (W + D - 0.1), FRAME_Y, z]} rotation={sideRot(side)}>
      <mesh position={[0, 0, -0.05]} material={frameMat} renderOrder={mirror ? -9 : 21}>
        <planeGeometry args={[w + 0.36, h + 0.36]} />
      </mesh>
      <mesh material={mat} renderOrder={mirror ? -8 : 22}>
        <planeGeometry args={[w, h]} />
      </mesh>
      {!mirror && bladeU !== null && st ? (
        (cur.dir ?? 0) < 2 ? (
          <>
            <Blade x={(cur.dir === 1 ? 0.5 - bladeU : bladeU - 0.5) * w} to={st.to} height={h + 0.2} k={2} time={t} intensity={0.7} core={BLADE_CORE} halo={BLADE_HALO} />
            <Nib position={new THREE.Vector3((cur.dir === 1 ? 0.5 - bladeU : bladeU - 0.5) * w, h / 2 + 0.05, 0.12)} finish="neon" color={LINE} size={0.5 * Math.min(st.to * 2, 1)} renderOrder={72} />
          </>
        ) : (
          <>
            <group rotation={[0, 0, Math.PI / 2]}>
              <Blade x={(cur.dir === 2 ? 0.5 - bladeU : bladeU - 0.5) * h} to={st.to} height={w + 0.2} k={2} time={t} intensity={0.7} core={BLADE_CORE} halo={BLADE_HALO} />
            </group>
            <Nib position={new THREE.Vector3(-w / 2 - 0.05, (cur.dir === 2 ? 0.5 - bladeU : bladeU - 0.5) * h, 0.12)} finish="neon" color={LINE} size={0.5 * Math.min(st.to * 2, 1)} renderOrder={72} />
          </>
        )
      ) : null}
    </group>
  );
};

/** A wide recess holds two bays: the left-out pier leaves the lamps of both rows above it. */
const WideLamps: React.FC<{side: -1 | 1; z: number; lit: number; mirror: boolean}> = ({side, z, lit, mirror}) => {
  const x = side * (W + D - 0.08);
  const top = PZ + PH / 2;
  const order = mirror ? -8 : 20;
  return (
    <>
      {[-BAY / 2, BAY / 2].flatMap((row) =>
        [-5.8, 0, 5.8].map((k) => (
          <group key={row + k} position={[0, 0, z + row + k]}>
            <mesh position={[x - side * 1.35, top + 1.1, 0]} renderOrder={order}>
              <boxGeometry args={[2.7, 0.08, 0.08]} />
              <meshBasicMaterial color={LAMP_ARM} toneMapped={false} />
            </mesh>
            <mesh position={[x - side * 2.7, top + 0.95, 0]} renderOrder={order}>
              <cylinderGeometry args={[0.2, 0.28, 0.5, 14]} />
              <meshBasicMaterial color={LAMP_ARM} toneMapped={false} />
            </mesh>
            <mesh position={[x - side * 2.7, top + 0.68, 0]} renderOrder={order + 1}>
              <circleGeometry args={[0.22, 16]} />
              <meshBasicMaterial color={LAMP_ON.clone().multiplyScalar(Math.max(0.015, lit))} toneMapped={false} side={THREE.DoubleSide} />
            </mesh>
          </group>
        )),
      )}
    </>
  );
};

const FRAME_Y = PZ;
const LAMP_ARM = new THREE.Color(0.012, 0.011, 0.01);
const LAMP_ON = new THREE.Color(5.2, 4.9, 4.4);
const midOf = (row: number) => zOf(row + 0.5);
const ROOM_Z = midOf(11);
const CAR_Z = midOf(16);
const END_Z = midOf(27);

const LAST_WIDE: WallState[] = [{id: FINAL_WIDE, aspect: 16 / 9}];
const ROOM: WallState[] = [
  {id: ROOMS[0], aspect: 16 / 9},
  {id: ROOMS[1], aspect: 16 / 9, at: 65.4, len: 44},
  {id: ROOMS[2], aspect: 16 / 9, at: 66.6, len: 44, dir: 1},
  {id: ROOMS[3], aspect: 16 / 9, at: 67.8, len: 44, dir: 2},
  {id: ROOMS[4], aspect: 16 / 9, at: 69.0, len: 44, dir: 3},
  {id: ROOMS[5], aspect: 16 / 9, at: 70.2, len: 44, dir: 1},
];
/** One photo in every form: the frame goes tall, square, loses its background, then "take that out". */
const CARS: WallState[] = [
  {id: CAR.start, aspect: 16 / 9},
  {id: CAR.tall, aspect: 9 / 16, at: 103.45, len: 46},
  {id: CAR.square, aspect: 1, at: 105.65, len: 46},
  {id: CAR.cutout, aspect: 16 / 9, at: 108.1, len: 46, keyed: true},
  {id: CAR.next, aspect: 16 / 9, at: 110.9, len: 46},
  {id: CAR.withMan, aspect: 16 / 9, at: 113.35, len: 46},
  {id: CAR.withoutMan, aspect: 16 / 9, at: 115.85},
];
const manLine = () => {
  const [w, h] = frameOf(16 / 9);
  return (manContour as number[][]).map(([u, v]) => onWallAt(1, CAR_Z, (u - 0.5) * w, (v - 0.5) * h + FRAME_Y, 0.35));
};

/** Grains of him, carried off down the wind and falling away like the rest of the snow. */
const ManSnow: React.FC<{t: number}> = ({t}) => {
  const {geom, seeds} = useMemo(() => {
    const [w, h] = frameOf(16 / 9);
    const r = rng(55);
    const seeds = (manFlakes as number[][]).map(([u, v]) => ({p: onWallAt(1, CAR_Z, (u - 0.5) * w, (v - 0.5) * h + FRAME_Y, 0.3), late: (1 - v) * 0.6 + r() * 0.35, wind: 1.5 + r() * 4.5, out: 0.4 + r() * 2.4, lift: r() * 1.2, life: 1 + r() * 1.3, ph: r() * 6.28}));
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(new Float32Array(seeds.length * 3), 3));
    geom.setAttribute("color", new THREE.BufferAttribute(new Float32Array(seeds.length * 3), 3));
    return {geom, seeds};
  }, []);
  const mat = useMemo(() => new THREE.PointsMaterial({size: 0.11, vertexColors: true, transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending}), []);
  if (t < T.gone || t > T.gone + 3.4) return null;
  const pos = geom.attributes.position as THREE.BufferAttribute;
  const col = geom.attributes.color as THREE.BufferAttribute;
  seeds.forEach((s, i) => {
    const a = t - T.gone - s.late;
    if (a < 0 || a > s.life) {
      pos.setXYZ(i, 0, -500, 0);
      col.setXYZ(i, 0, 0, 0);
      return;
    }
    pos.setXYZ(i, s.p.x - s.out * a, s.p.y + s.lift * a - 0.9 * a * a + 0.12 * Math.sin(a * 5 + s.ph), s.p.z + s.wind * a);
    const k = Math.sin(Math.PI * Math.min(1, a / s.life));
    col.setXYZ(i, 1.45 * k, 1.38 * k, 1.25 * k);
  });
  pos.needsUpdate = true;
  col.needsUpdate = true;
  return <points geometry={geom} material={mat} renderOrder={36} frustumCulled={false} />;
};

// ------------------------------------------------------------------ camera

const Y0 = 1.7;
const NEAR = 0.6;
const TUNNEL_RUN = 330;
/** Every move starts slowly, gathers speed in the middle and settles slowly on what it came for. */
const smoother = (k: number) => k * k * k * (k * (k * 6 - 15) + 10);

type PosKey = [t: number, x: number, y: number, z: number];
type LookKey = [t: number, yaw: number, pitch: number, shift: number];
const WALL_X = W + D;
const SHIFT = 0.78;

/** Standing a little across the hall from a picture, near enough to read it, with some of the hall still in the frame. */
const stand = (side: -1 | 1, z0: number, dz: number, x = 6): [number, number, number] => [-side * x, Y0, z0 + dz];
const yawTo = (side: -1 | 1, dz: number, aim: number, x = 6) => side * Math.atan2(WALL_X + x, dz - aim);

const keysFor = (fit: Fit) => {
  const POS: PosKey[] = [];
  const LOOK: LookKey[] = [];
  const FOVS: Array<[t: number, fov: number]> = [];
  /** The camera holds on one picture from t0 to t1, drifting in a little and keeping it framed. */
  const hold = (side: -1 | 1, z0: number, t0: number, t1: number, aim = 0, dzs: [number, number] = [18, 13], x = 6, shift = fit.holdShift, fov = fit.holdFov) => {
    POS.push([t0, ...stand(side, z0, dzs[0], x)], [t1, ...stand(side, z0, dzs[1], x)]);
    LOOK.push([t0, yawTo(side, dzs[0], aim, x), 0, shift], [t1, yawTo(side, dzs[1], aim, x), 0, shift]);
    FOVS.push([t0, fov], [t1, fov]);
  };

  POS.push([T.back1, 0, Y0, -4], [T.shot0, 0, Y0, -4]);
  LOOK.push([T.back1, 0, 0.01, 0.72], [35.4, 0, 0.01, 0.72]);
  FOVS.push([T.back1, fit.fovHall], [35.4, fit.fovHall]);
  hold(1, zOf(7), 38.8, 42.6, -2);
  hold(1, zOf(8), 45.8, 49.2, -2);
  hold(1, zOf(9), 52.4, 54.1);
  hold(-1, zOf(10), 58.6, 61.0);
  hold(-1, ROOM_Z, 64.4, 71.4, 0, fit.room.dz, fit.room.x, fit.room.shift, fit.room.fov);
  hold(-1, zOf(13), 74.8, 77.9);
  hold(-1, zOf(14), 81.1, 85.15, 2);
  hold(1, zOf(15), 90.0, 98.3);
  hold(1, CAR_Z, 101.2, 117.2, 0, fit.car.dz, fit.car.x, fit.car.shift, fit.car.fov);
  hold(1, zOf(18), 120.6, 122.1);
  hold(1, zOf(19), 125.1, 126.6);
  hold(1, zOf(20), 129.8, 134.2);
  // the long run down the great hall, in the lamps and on into the dark, rising to the middle of what is coming
  LOOK.push([137.4, 0, 0.01, 0.72], [143.8, 0, 0.01, 0.72], [T.dive0, 0, 0, 0], [T.dive1 - 3, 0, 0, 0], [T.rise0, 0, 0.01, 0.62], [T.rise1, 0, 0.1, 0.36], [T.dark1, 0, 0.1, 0.36]);
  POS.push([144.4, 0, Y0, zOf(26)], [T.dive0, 0, fit.tunnel.y, zOf(26) - 24], [T.dive1 - 3, 0, fit.tunnel.y, zOf(26) - 24], [T.rise0, 0, Y0, zOf(26) - 24], [T.rise1, 0, 13, zOf(26) - 24 - 46], [T.dark1, 0, 14, zOf(26) - 24 - 54]);
  FOVS.push([137.4, fit.fovHall], [143.8, fit.fovHall], [T.dive0, fit.diveFov], [T.dive1 - 3, fit.diveFov], ...(fit.tall ? ([[T.rise0, fit.diveFov], [T.rise1, fit.endFov]] as Array<[number, number]>) : ([[T.rise0, fit.endFov]] as Array<[number, number]>)), [T.dark1, fit.endFov]);
  return {POS, LOOK, FOVS};
};

const interp = <K extends number[]>(keys: K[], t: number, n: number) => {
  if (t <= keys[0][0]) return keys[0][n];
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (t <= b[0]) return a[n] + (b[n] - a[n]) * smoother((t - a[0]) / (b[0] - a[0]));
  }
  return keys[keys.length - 1][n];
};

const diveE = Easing.bezier(0.62, 0, 0.16, 1);
const diveDepth = (t: number) => TUNNEL_RUN * seg(t, T.dive0, T.dive1, diveE);

const KEYS = {wide: keysFor(WIDE), tall: keysFor(TALL)};

const camAt = (t: number, fit: Fit): Cam => {
  if (t >= T.back1) {
    const {POS, LOOK, FOVS} = fit.tall ? KEYS.tall : KEYS.wide;
    const x = interp(POS, t, 1);
    const y = interp(POS, t, 2) + 0.02 * Math.sin(t * 1.1);
    const z = interp(POS, t, 3) - diveDepth(t);
    const yaw = interp(LOOK, t, 1);
    const pitch = interp(LOOK, t, 2);
    return {position: [x, y, z], target: [x + Math.sin(yaw) * Math.cos(pitch) * 10, y + Math.sin(pitch) * 10, z - Math.cos(yaw) * Math.cos(pitch) * 10], fov: interp(FOVS, t, 1), shift: interp(LOOK, t, 3), near: NEAR};
  }
  const down = seg(t, T.down0, T.down1, smoother);
  const walk = 34 * seg(t, T.down0 + 1.6, 27.3, smoother);
  const z = mix(mix(fit.high.z[0], fit.high.z[1], seg(t, 0, T.down0, soft)), 30, down) - walk;
  const turn = seg(t, T.turn0, T.turn1, smoother) * (1 - seg(t, T.back0, T.back1, smoother));
  const arc = fit.high.arc * (1 - seg(t, 0, T.tear - 0.6, smoother));
  const x = mix(arc, -10, turn);
  const yaw = turn * 0.92;
  const push = seg(t, T.tear - 0.5, T.tear + 2.1, soft);
  const y = mix(mix(fit.high.y[0], fit.high.y[1], push), Y0, down) + 0.02 * Math.sin(t * 1.1);
  const walkT = new THREE.Vector3(x + Math.sin(yaw) * 10, y + 0.1, z - Math.cos(yaw) * 10);
  const highT = new THREE.Vector3(0, 0.5, fit.high.aim);
  const tg = highT.lerp(walkT, down);
  return {position: [x, y, z], target: [tg.x, tg.y, tg.z], fov: mix(fit.high.fov, mix(fit.walk.fov, fit.walk.turnFov, turn), down), shift: mix(0, mix(fit.walk.shift, fit.walk.turnShift, turn), down), near: NEAR};
};

// ------------------------------------------------------------------ the tunnel: everything comes off the walls at once

const TUNNEL_Z = zOf(26) - 24;
const TUNNEL_END = -TUNNEL_RUN - 44;
/** The hall comes back moved along, so its far end stands where the tunnel lets us out: 118 m from the doors. */
const HALL_END = -1037;
const HALL_SHIFT = TUNNEL_Z - TUNNEL_RUN - HALL_END - 118;
const WORDS_Z = HALL_END + HALL_SHIFT + 26;
type Slab = {n: string; p: THREE.Vector3; r: [number, number, number]; w: number; h: number; from: THREE.Vector3; delay: number};
const slabsFor = ({hw, hh, y: TUNNEL_Y}: Fit["tunnel"]): Slab[] => {
  const keep = TUNNEL;
  const r = rng(404);
  const list = [...keep];
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  const out: Slab[] = [];
  let seed = 0;
  const next = () => list[seed++ % list.length];
  // nothing crosses the middle: each picture comes straight in from its own wall, a wave running away from us down the hall
  const put = (n: string, p: THREE.Vector3, rot: [number, number, number], w: number, h: number, from: THREE.Vector3) => out.push({n, p, r: rot, w, h, from, delay: Math.max(0, -p.z) / 115 + r() * 0.16});
  const END = TUNNEL_END;
  for (const side of [-1, 1])
    for (const row of [-1, 1]) {
      let z = 26 - (row + 1) * 2.2;
      while (z > END) {
        const [n, a] = next();
        const h = hh - 0.16;
        const w = h * a;
        z -= w / 2;
        const y = TUNNEL_Y + (row * hh) / 2;
        put(n, new THREE.Vector3(side * hw, y, z), [0, -side * (Math.PI / 2), 0], w, h, new THREE.Vector3(side * 25, y, z));
        z -= w / 2 + 0.2;
      }
    }
  for (const side of [-1, 1])
    for (const lane of [-1, 0, 1]) {
      let z = 26 - (lane + 1) * 1.7;
      while (z > END) {
        const [n, a] = next();
        const w = (2 * hw) / 3 - 0.16;
        const h = w / a;
        z -= h / 2;
        const x = (lane * (2 * hw)) / 3;
        put(n, new THREE.Vector3(x, TUNNEL_Y + side * hh, z), [(side * Math.PI) / 2, 0, 0], w, h, new THREE.Vector3(x * 1.5, TUNNEL_Y + side * 26, z));
        z -= h / 2 + 0.2;
      }
    }
  return out;
};
const SLABS = {wide: slabsFor(WIDE.tunnel), tall: slabsFor(TALL.tunnel)};

const Tunnel: React.FC<{t: number; camZ: number}> = ({t, camZ}) => {
  const fit = React.useContext(FitContext);
  const TUNNEL_Y = fit.tunnel.y;
  const axis = useMemo(() => {
    const r = rng(9);
    const key: THREE.Vector3[] = [];
    for (let z = 10; z > TUNNEL_END - 60; z -= 12) key.push(new THREE.Vector3((r() - 0.5) * 2.4, TUNNEL_Y + (r() - 0.5) * 1.6, z));
    const c = new THREE.CatmullRomCurve3(key, false, "centripetal");
    return new Array(900).fill(0).map((_, k) => c.getPointAt(k / 899));
  }, [TUNNEL_Y]);
  if (t < T.gather || t > T.rise0 + 0.2) return null;
  const local = camZ - TUNNEL_Z;
  const near = local + 2;
  const far = local - 120;
  // the pen runs ahead of us and on through the end of the tunnel, into the hall
  const head = seg(t, T.dive0 - 0.2, T.dive1 - 0.6, Easing.bezier(0.5, 0, 0.45, 1));
  return (
    <group position={[0, 0, TUNNEL_Z]}>
      {(fit.tall ? SLABS.tall : SLABS.wide).map((s, i) => {
        const k = seg(t, T.gather + s.delay, T.gather + s.delay + 1.25, smoother);
        if (k <= 0) return null;
        if (s.p.z > near + 2 || s.p.z < far) return null;
        // they withdraw the way they came, the farthest first: the end of the hall opens through them
        const leave = T.retract + clamp01((s.p.z - TUNNEL_END) / 110) * 1.3;
        const g = seg(t, leave, leave + 1.5, smoother);
        if (g >= 1) return null;
        const arrive = Math.pow(clamp01((s.p.z - far) / 30), 1.6);
        const m = k * (1 - g);
        return <Card key={i} src={picSrc(s.n)} w={s.w} h={s.h} position={[mix(s.from.x, s.p.x, m), mix(s.from.y, s.p.y, m), s.p.z]} rotation={s.r} corner={0.05} opacity={Math.pow(k, 1.4) * arrive * (1 - g * g)} dim={0.92} depthWrite={false} renderOrder={26} />;
      })}
      {head > 0 && head < 1 ? <Stroke pts={axis} progress={head} finish="neon" color={LINE} radius={0.014} pen={0.9} tailLen={16} time={t} renderOrder={60} /> : null}
    </group>
  );
};

// ------------------------------------------------------------------ the last line, in the pen's own hand, standing in the air before the glass

const signAspect = signData.w / signData.h;
const signPen = (k: number, {y: WORDS_Y, w: WORDS_W}: Fit["words"]) => {
  const WORDS_H = WORDS_W / signAspect;
  const pts = signData.pen;
  const f = clamp01(k) * (pts.length - 1);
  const i = Math.min(pts.length - 2, Math.floor(f));
  const a = pts[i];
  const b = pts[i + 1];
  return new THREE.Vector3((mix(a[0], b[0], f - i) - 0.5) * WORDS_W, WORDS_Y + (mix(a[1], b[1], f - i) - 0.5) * WORDS_H, WORDS_Z + 0.15);
};

const WORD_FS = /* glsl */ `
  uniform sampler2D map;
  uniform float cut;
  uniform float behind;
  uniform float heatK;
  uniform vec3 col;
  uniform float fade;
  varying vec2 vUv;
  void main() {
    vec4 c = texture2D(map, vUv);
    float order = c.g;
    float reach = cut - behind;
    float a = c.r * (1.0 - smoothstep(reach - 0.003, reach + 0.003, order));
    float heat = exp(-max(cut - order, 0.0) / 0.035) * heatK;
    gl_FragColor = vec4((col + vec3(1.6, 1.4, 1.05) * heat) * a * fade, a * fade);
  }
`;

const WORD_LIGHT = new THREE.Color(1.75, 1.58, 1.28);

/** The pen writes it in light, flat in the air before the glass, so it reads. */
const Words: React.FC<{t: number}> = ({t}) => {
  const fit = React.useContext(FitContext);
  const {y: WORDS_Y, w: WORDS_W} = fit.words;
  const WORDS_H = WORDS_W / signAspect;
  const sign = useTexture(staticFile("signature-order.png"));
  const mat = useMemo(() => new THREE.ShaderMaterial({vertexShader: FP_VS, fragmentShader: WORD_FS, transparent: true, premultipliedAlpha: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, uniforms: {map: {value: null}, cut: {value: 0}, behind: {value: 0}, heatK: {value: 1}, col: {value: WORD_LIGHT}, fade: {value: 1}}}), []);
  if (!sign || t < T.write0 || t > T.dark1) return null;
  sign.generateMipmaps = false;
  sign.minFilter = THREE.LinearFilter;
  sign.colorSpace = THREE.NoColorSpace;
  const cut = (t - T.write0) / (T.write1 - T.write0);
  const k = clamp01(cut);
  mat.uniforms.map.value = sign;
  mat.uniforms.cut.value = cut * 1.02;
  mat.uniforms.fade.value = 1 - seg(t, T.dark0, T.dark1 - 0.15, soft);
  return (
    <>
      <mesh position={[0, WORDS_Y, WORDS_Z]} material={mat} renderOrder={60}>
        <planeGeometry args={[WORDS_W, WORDS_H]} />
      </mesh>
      {k > 0 && k < 1 ? <Nib position={signPen(k, fit.words)} finish="neon" color={LINE} size={0.8} renderOrder={80} /> : null}
    </>
  );
};

// ------------------------------------------------------------------ a word in the air, facing the camera, in the hall

const Air: React.FC<{text: string; t: number; t0: number; t1: number; fadeAt: number; cam: [number, number]; look: [number, number]; d?: number; off?: number; y?: number; width?: number; tall?: {at: number; of: number}}> = ({text, t, t0, t1, fadeAt, cam, look, d = 21, off = 9, y = 3.2, width = 12.5, tall}) => {
  const fit = React.useContext(FitContext);
  if (fit.tall && tall) {
    // the narrow frame leaves no room beside the picture: the word stands under it, level with the lens, and barely drifts
    const c = camAt(t, fit);
    const tan = Math.tan(((c.fov ?? 54) * Math.PI) / 360);
    const lift = tall.at + (c.shift ?? 0);
    const near = Math.min(10, lift < 0 ? (c.position[1] - 0.55) / (-lift * tan) : 10);
    const fx = c.target[0] - c.position[0];
    const fz = c.target[2] - c.position[2];
    const n = Math.hypot(fx, fz);
    const slide = (seg(t, t0, fadeAt + 0.7) - 0.5) * 0.02 * near;
    const px = c.position[0] + (fx / n) * near - (fz / n) * slide;
    const pz = c.position[2] + (fz / n) * near + (fx / n) * slide;
    return (
      <group position={[px, c.position[1] + lift * near * tan, pz]} rotation={[0, Math.atan2(c.position[0] - px, c.position[2] - pz), 0]}>
        <Written text={text} t={t} t0={t0} t1={t1} c={new THREE.Vector3(0, 0, 0)} width={tall.of * 2 * near * tan * (9 / 16)} fadeAt={fadeAt} fadeLen={0.7} reflect={false} nib={(1.1 * near) / 21} />
      </group>
    );
  }
  const dx = look[0] - cam[0];
  const dz = look[1] - cam[1];
  const n = Math.hypot(dx, dz);
  const fx = dx / n;
  const fz = dz / n;
  // left of where we look
  const px = cam[0] + fx * d + fz * off;
  const pz = cam[1] + fz * d - fx * off;
  const rotY = Math.atan2(cam[0] - px, cam[1] - pz);
  return (
    <group position={[px, y, pz]} rotation={[0, rotY, 0]}>
      <Written text={text} t={t} t0={t0} t1={t1} c={new THREE.Vector3(0, 0, 0)} width={width} fadeAt={fadeAt} fadeLen={0.7} reflect={false} />
    </group>
  );
};

// ------------------------------------------------------------------ the last line

const Typed: React.FC<{t: number}> = ({t}) => {
  const {url} = React.useContext(FitContext);
  const S2 = "tekplatform.ai";
  const u = Math.floor(seg(t, T.url0, T.url1) * S2.length + 1e-6);
  const caret = t < T.url1 || Math.floor((t - T.url1) / 0.55) % 2 === 0;
  if (t < T.url0 - 0.5) return null;
  return (
    <AbsoluteFill style={{display: "flex", alignItems: "center", justifyContent: "center"}}>
      <div style={{position: "relative", fontFamily: fonts.jetbrains, fontSize: url.size, color: "#EFE6D2", whiteSpace: "pre", letterSpacing: "0.01em"}}>
        <span style={{visibility: "hidden"}}>{S2}</span>
        <span style={{position: "absolute", left: 0, top: 0}}>
          {S2.slice(0, u)}
          <span style={{display: "inline-block", width: url.caret[0], height: url.caret[1], marginLeft: 5, verticalAlign: "-0.1em", background: caret ? "#EFE6D2" : "transparent"}} />
        </span>
      </div>
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ the film

export const DoNotTouch: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();
  const fit = height > width ? TALL : WIDE;
  const t = frame / fps;
  const cam = camAt(t, fit);
  const fire = useMemo(firePath, []);
  const shot = useMemo(shotPath, []);
  const trace = useMemo(manLine, []);
  const pf = seg(t, T.fire0, T.fire1, glide);
  const ps = seg(t, T.shot0, T.shot1, Easing.bezier(0.45, 0, 0.3, 1));
  const camZ = cam.position[2];
  const penZ = shot[Math.round(ps * (shot.length - 1))].z;
  const ahead = camZ - 78;
  const beyond = mix(penZ + 4, -1400, seg(t, T.shot1 - 0.2, T.shot1 + 2.4, smoother));
  const onZ = t < T.wave1 ? mix(80, ahead, seg(t, T.wave0, T.wave1, soft)) : t < T.shot0 ? ahead : Math.min(ahead, beyond);
  const offZ = t < T.off0 ? 1e5 : mix(camZ + 70, -1120, seg(t, T.off0, T.off1, soft));
  const hallAway = seg(t, T.gather, T.gather + 1.6, soft);
  const hallOn = t < T.gather + 1.7;
  // the end of the hall: its pictures still on the walls; the glass and the doors stay the strongest thing in it
  const end = t >= T.hall2 && t < T.dark1 + 0.1;
  const glass = seg(t, T.hall2, T.hall2 + 1.2, soft) * (1 - seg(t, T.dark0, T.dark1 - 0.1, soft));
  const hallLevel = mix(0.04, 0.72, seg(t, T.retract + 0.3, T.rise0, smoother)) * (1 - 0.62 * seg(t, T.rise0 + 1, T.write0, smoother));
  const penUp = seg(t, T.write0 - 1.1, T.write0, glide);
  const penStart = new THREE.Vector3(MINE_C.x - MINE_W / 2, MINE_C.y - 1.5, MINE_C.z + 0.1);
  const roomLit = litAt(ROOM_Z, onZ, offZ);
  const carLit = litAt(CAR_Z, onZ, offZ);
  const endLit = litAt(END_Z, onZ, offZ);
  const traceP = seg(t, T.trace0, T.trace1, Easing.bezier(0.45, 0, 0.55, 1));

  const upPath = useMemo(() => new THREE.CatmullRomCurve3([new THREE.Vector3(0, 7, WORDS_Z), new THREE.Vector3(-8, 16, WORDS_Z + 3), new THREE.Vector3(-14, 26, WORDS_Z + 2), signPen(0, fit.words)], false, "centripetal").getPoints(90), [fit]);
  const endPictures = (mirror: boolean) => (
    <>
      <Pictures mirror={mirror} t={t} cz={camZ - HALL_SHIFT} onZ={-1e5} offZ={-1e5} ember={0} level={hallLevel * glass} />
      <FramePicture side={1} z={END_Z} states={LAST_WIDE} t={t} lit={hallLevel * glass} mirror={mirror} />
      <WideLamps side={1} z={END_Z} lit={hallLevel * glass} mirror={mirror} />
    </>
  );
  const pictures = (mirror: boolean) =>
    hallOn ? (
      <>
        <Pictures mirror={mirror} t={t} cz={camZ} onZ={onZ} offZ={offZ} ember={0} />
        {Math.abs(ROOM_Z - camZ) < 300 ? (
          <>
            <FramePicture side={-1} z={ROOM_Z} states={ROOM} t={t} lit={roomLit} mirror={mirror} />
            <WideLamps side={-1} z={ROOM_Z} lit={roomLit} mirror={mirror} />
          </>
        ) : null}
        {Math.abs(CAR_Z - camZ) < 300 ? (
          <>
            <FramePicture side={1} z={CAR_Z} states={CARS} t={t} lit={carLit} mirror={mirror} man={{t0: T.trace0, at: T.gone, len: 1.05, state: 6}} />
            <WideLamps side={1} z={CAR_Z} lit={carLit} mirror={mirror} />
          </>
        ) : null}
        {Math.abs(END_Z - camZ) < 400 ? (
          <>
            <FramePicture side={1} z={END_Z} states={LAST_WIDE} t={t} lit={endLit} mirror={mirror} />
            <WideLamps side={1} z={END_Z} lit={endLit} mirror={mirror} />
          </>
        ) : null}
      </>
    ) : null;

  return (
    <FontGate>
      <FitContext.Provider value={fit}>
      <AbsoluteFill style={{background: "#020203"}}>
        {/* R3F has its own tree, so the context goes in again */}
        <Stage look={LOOK_} cam={cam}>
          <FitContext.Provider value={fit}>
          {hallOn ? <Hall onZ={onZ} offZ={offZ} away={hallAway} pictures={pictures} /> : null}
          {end ? (
            <group position={[0, 0, HALL_SHIFT]}>
              <Hall onZ={-1e5} offZ={-1e5} embers={(hallLevel / 3.1 - 0.02) / 0.98} away={1 - 3.1 * glass} pictures={endPictures} />
            </group>
          ) : null}
          <FloorRule t={t} lit={seg(t, T.wave0 + 0.3, T.wave1 - 0.2, soft)} />
          <Dust t={t} to={penStart} />
          <Written text="mine." t={t} t0={T.mine} t1={T.mine1} c={MINE_C} width={MINE_W} fadeAt={T.press + 0.5} />
          <Button t={t} />
          <Written text="talk." t={t} t0={T.talk} t1={T.talk1} c={TALK_C} width={TALK_W} fadeAt={T.shot0 + 0.25} />
          {pf > 0 && pf < 1 ? <Stroke pts={fire} progress={pf} finish="neon" color={LINE} radius={0.05} pen={1} tailLen={26} time={t} renderOrder={48} /> : null}
          {ps > 0 && ps < 1 ? <Stroke pts={shot} progress={ps} finish="neon" color={LINE} radius={0.05} pen={1} tailLen={36} time={t} renderOrder={48} /> : null}
          <Actions t={t} cz={camZ} />
          <Air text="your face." t={t} t0={39.3} t1={40.2} fadeAt={42.2} cam={[-6, zOf(7) + 16]} look={[27, zOf(7) - 2]} width={11} off={10} tall={{at: -0.6, of: 0.56}} />
          <Air text="your product." t={t} t0={45.85} t1={46.9} fadeAt={48.9} cam={[-6, zOf(8) + 16]} look={[27, zOf(8) - 2]} width={13} off={9.8} tall={{at: -0.6, of: 0.68}} />
          <Air text="in your" t={t} t0={82.25} t1={82.8} fadeAt={84.9} cam={[6, zOf(14) + 16]} look={[-27, zOf(14) + 2]} width={7.6} off={10.6} y={4.9} tall={{at: -0.5, of: 0.42}} />
          <Air text="language." t={t} t0={82.85} t1={83.6} fadeAt={84.9} cam={[6, zOf(14) + 16]} look={[-27, zOf(14) + 2]} width={8.9} off={10.6} y={2.6} tall={{at: -0.62, of: 0.52}} />
          <Air text="one photo." t={t} t0={100.85} t1={101.8} fadeAt={102.9} cam={[-13, CAR_Z + 15]} look={[27, CAR_Z]} d={22} off={9} y={2.8} width={10} tall={{at: -0.5, of: 0.5}} />
          {traceP > 0 && t < T.gone + 0.3 ? <Stroke pts={trace} progress={traceP} finish="neon" color={LINE} radius={0.045} pen={traceP < 1 ? 0.8 : 0} tailLen={0} time={t} opacity={1 - seg(t, T.gone, T.gone + 0.3, soft)} renderOrder={48} /> : null}
          <ManSnow t={t} />
          <Tunnel t={t} camZ={camZ} />
          {penUp > 0 && penUp < 1 ? <Stroke pts={upPath} progress={penUp} finish="neon" color={LINE} radius={0.05} pen={1} tailLen={18} time={t} renderOrder={70} /> : null}
          <Words t={t} />
          </FitContext.Provider>
        </Stage>
        <AbsoluteFill style={{background: "#020203", opacity: seg(t, T.dark0, T.dark1, soft)}} />
        <Typed t={t} />
      </AbsoluteFill>
      </FitContext.Provider>
    </FontGate>
  );
};
