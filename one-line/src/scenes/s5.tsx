import React, {useMemo} from "react";
import * as THREE from "three";
import {fonts} from "../fonts";
import {LINE_R} from "../looks";
import {M} from "../../pictures";
import {at as cueAt, clamp01, ease, life, seg} from "../timing";
import {Card, TexPlane} from "../world/Card";
import {GoldLine, Path} from "../world/Line";
import {GOLD, rng} from "../world/space";
import type {Cam} from "../world/Stage";
import {camAt, float, LineTrack, type CamKey} from "../world/track";
import {makeTextTexture, type TextSpec} from "../world/Type";
import {VideoCard} from "../world/Video";
import {drawPlan, useImage} from "./s2";
import {s4Camera, S4_EXIT, S4_KEYS} from "./s4";
import {O5, S5_FIRST, S6_FIRST} from "./seams";
import type {Scene} from "./types";

/**
 * S5 · the language you don't need (C5). Film jargon hangs in the dark round
 * the camera; each spoken term makes the camera do it. "None of that is your
 * job": the terms become a wall, the camera slips through a gap between its
 * letters, the line cuts the frame and the letters burst into dust that
 * streams past the lens and settles as the plain words of a real plan.
 */

const T = {
  start: 142.5,
  beautiful: cueAt("c5.1"),
  language: cueAt("c5.2"),
  push: cueAt("c5.3"),
  dolly: cueAt("c5.4"),
  fisheye: cueAt("c5.5"),
  bird: cueAt("c5.6"),
  lens: cueAt("c5.7"),
  light: cueAt("c5.8"),
  notJob: cueAt("c5.9"),
  bring: cueAt("c5.10"),
  directs: cueAt("c5.11"),
  end: 165,
};
const THROUGH = T.notJob + 1.35; // camera crosses the wall

const WALL_Z = O5.z - 1.5;
// Past the wall, so the camera keeps going forward after it crosses.
const CARD = new THREE.Vector3(O5.x + 0.9, O5.y, O5.z - 22);

const TERMS = ["PUSH IN", "DOLLY OUT", "FISHEYE", "BIRD'S-EYE", "24MM", "KEY LIGHT", "RACK FOCUS", "DEPTH OF FIELD", "MATCH CUT"];
const SPOKEN = [T.push, T.dolly, T.fisheye, T.bird, T.lens, T.light];
const termSpec = (s: string): TextSpec => ({lines: [s], font: `500 "${fonts.mono}"`, size: 64, color: "#F3EDE3", tracking: 0.1});

/** Terms round the camera; each is born from light as the pen passes it. */
const termLayout = () => {
  const r = rng(55);
  return TERMS.map((term, i) => {
    const a = (i / TERMS.length) * Math.PI * 2 + r() * 0.4;
    const rad = 2.8 + r() * 3.0;
    return {
      term,
      pos: new THREE.Vector3(O5.x + Math.cos(a) * rad * 1.45, O5.y + Math.sin(a) * rad * 0.6, O5.z + (r() - 0.5) * 7),
      h: 0.48 + r() * 0.36,
      born: T.beautiful - 0.6 + i * 0.55,
      yaw: (r() - 0.5) * 0.5,
    };
  });
};

const usePenThroughTerms = (terms: ReturnType<typeof termLayout>) =>
  useMemo(() => {
    const strokes = [];
    let prev = S4_EXIT.clone();
    let t0 = T.start + 0.1;
    for (const tm of terms) {
      const anchor = tm.pos.clone().add(new THREE.Vector3(-(tm.h * 2.2), -tm.h * 0.75, 0.05));
      const p = new Path();
      p.pts.push(prev.clone());
      p.smooth([prev.clone().lerp(anchor, 0.5).add(new THREE.Vector3(0, 0.6, 0.8)), anchor], 18);
      strokes.push({pts: p.pts, t0, t1: tm.born, ease: ease.inOut});
      prev = anchor;
      t0 = tm.born;
    }
    const rest = new Path();
    rest.pts.push(prev.clone());
    rest.smooth([new THREE.Vector3(O5.x - 4.3, O5.y - 2.5, O5.z + 1.0)], 18);
    strokes.push({pts: rest.pts, t0, t1: t0 + 1.0, ease: ease.inOut});
    return new LineTrack(strokes);
  }, [terms]);

// ------------------------------------------------------------------ camera

const front = (dz: number): [number, number, number] => [O5.x, O5.y, O5.z + dz];

/**
 * The spoken moves as one long take. The narration reads the list briskly; the camera does not
 * finish one move per word, the moves overlap: push in and dolly out are one
 * breath; the fisheye opens as the dolly settles and is still relaxing while
 * the crane up to bird's-eye has begun; the crane comes back down through
 * "Lens choices" with a tele punch inside it; "Lighting" catches the end of
 * the descent, and the camera drifts on into the wall. Every move has soft
 * ends and peaks near the push's own speed (~4–4.7 units/s, ≤ 29°/s).
 * A pure function of t between CH0 and the wall.
 */
const CH0 = T.push - 0.3;
const CH1 = T.notJob;
const R_WALL = WALL_Z + 0.1 - O5.z;
const BREATH = {t0: CH0, dur: 2.2, depth: 2.8};
// The crane starts under the fisheye, tops out just after "Lens choices", lands as "Lighting" ends.
const BIRD = {t0: T.bird - 0.32, dur: 3.3, deg: 30};
const DRIFT1 = BIRD.t0 + BIRD.dur;
/** Lighting: a slow drift in that builds to this speed by "None of that is your job." */
const CH1_SPEED = 0.5;
const smoother = (a: number, b: number, x: number) => {
  const u = clamp01((x - a) / (b - a));
  return u * u * u * (u * (u * 6 - 15) + 10);
};
/** 0 → 1 → 0, soft at both ends (fisheye, tele). */
const lensBump = (t: number, a: number, up: number, hold: number, down: number) => smoother(a, a + up, t) * (1 - smoother(a + up + hold, a + up + hold + down, t));
const radiusAt = (t: number) => {
  if (t < BREATH.t0 + BREATH.dur) {
    const u = clamp01((t - BREATH.t0) / BREATH.dur);
    return 9.4 - (BREATH.depth * (1 - Math.cos(2 * Math.PI * u))) / 2;
  }
  if (t < DRIFT1) return 9.4 + 0.2 * smoother(BREATH.t0 + BREATH.dur, DRIFT1, t);
  // Lighting: from rest, a constant gentle acceleration up to CH1_SPEED.
  const h = CH1 - DRIFT1;
  const rCH1 = 9.6 - (CH1_SPEED * h) / 2;
  if (t < CH1) {
    const dt = t - DRIFT1;
    return 9.6 - (CH1_SPEED / h) * dt * dt * 0.5;
  }
  // Through the wall: a cubic Hermite from CH1_SPEED to the spline's speed at the wall.
  const H = THROUGH - CH1;
  const x = clamp01((t - CH1) / H);
  const [y0, y1, m0, m1] = [rCH1, R_WALL, -CH1_SPEED * H, -wallSpeed() * H];
  return (2 * x ** 3 - 3 * x ** 2 + 1) * y0 + (-2 * x ** 3 + 3 * x ** 2) * y1 + (x ** 3 - 2 * x ** 2 + x) * m0 + (x ** 3 - x ** 2) * m1;
};
const choreo = (t: number): Cam => {
  const r = radiusAt(t);
  const u = clamp01((t - BIRD.t0) / BIRD.dur);
  const el = ((BIRD.deg * Math.PI) / 180) * ((1 - Math.cos(2 * Math.PI * u)) / 2);
  // The push also centres the frame (it starts a touch left and high).
  const c = 1 - smoother(CH0, CH0 + BREATH.dur / 2, t);
  const pos: [number, number, number] = [O5.x - 0.15 * c, O5.y + 0.12 * c + r * Math.sin(el), O5.z + r * Math.cos(el)];
  const fe = lensBump(t, T.fisheye - 0.22, 0.85, 0.05, 1.0);
  const tele = lensBump(t, T.lens + 0.31, 0.7, 0.1, 0.8);
  // Straight ahead; once closer than 6 the gaze runs ahead of the camera (same direction, no flip at the terms).
  return {position: pos, target: [O5.x, O5.y, Math.min(O5.z, pos[2] - 6)], fov: 40 + 16 * fe - 10 * tele, barrel: 0.7 * fe};
};

export const S5_KEYS: CamKey[] = [
  {t: T.start, ...(() => {
    const c = s4Camera(T.start);
    return {pos: c.position, look: c.target};
  })()},
  S5_FIRST,
  // The choreography runs between these two (see `choreo`); the spline arrives at rest on the first
  // and leaves the second at the drift's speed.
  {t: CH0, pos: choreo(CH0).position, look: choreo(CH0).target, stop: true},
  {t: CH1, pos: [O5.x, O5.y, O5.z + 9.31], look: [O5.x, O5.y, O5.z]},
  {t: THROUGH, pos: [O5.x, O5.y, WALL_Z + 0.1], look: [O5.x, O5.y, WALL_Z - 6]},
  {t: T.bring + 0.9, pos: [CARD.x - 1.6, CARD.y + 0.1, CARD.z + 12.8], look: [CARD.x - 1.2, CARD.y, CARD.z]},
  {t: T.end - 1.6, pos: [CARD.x - 1.3, CARD.y + 0.05, CARD.z + 12.2], look: [CARD.x - 1.2, CARD.y, CARD.z]},
  {t: T.end, pos: [CARD.x + 4.0, CARD.y - 0.3, CARD.z + 10.5], look: [CARD.x + 9, CARD.y - 0.6, CARD.z - 6]},
];
const KEYS: CamKey[] = [S4_KEYS[S4_KEYS.length - 2], ...S5_KEYS, S6_FIRST];
/** The spline's speed as it leaves the wall (the choreography arrives at exactly this). */
let WALL_SPEED = -1;
function wallSpeed() {
  if (WALL_SPEED < 0) {
    const e = 1 / 240;
    const a = camAt(KEYS, THROUGH).position;
    const b = camAt(KEYS, THROUGH + e).position;
    WALL_SPEED = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / e;
  }
  return WALL_SPEED;
}

export const s5Camera = (t: number): Cam => {
  if (t > CH0 && t < THROUGH) return {...float(choreo(t), t, 0.025), fov: choreo(t).fov, barrel: choreo(t).barrel};
  return float(camAt(KEYS, t), t, 0.025);
};

// ------------------------------------------------------------------ wall → dust → plan

const WALL_ROWS = 7;
const drawWall = () => {
  const W = 4096;
  const Hh = 2048;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = Hh;
  const g = c.getContext("2d")!;
  g.fillStyle = "#F3EDE3";
  g.font = `700 172px "${fonts.mono}"`;
  (g as unknown as {letterSpacing: string}).letterSpacing = "6px";
  g.textBaseline = "middle";
  const words = ["PUSH IN", "DOLLY OUT", "FISHEYE", "BIRD'S-EYE", "24MM", "KEY LIGHT", "RACK FOCUS", "DEPTH OF FIELD", "MATCH CUT", "85MM", "TILT", "WHIP PAN"];
  for (let row = 0; row < WALL_ROWS; row++) {
    const y = (row + 0.5) * (Hh / WALL_ROWS);
    // Left half and right half, leaving a gap down the middle for the camera.
    let x = 40 - ((row * 263) % 900);
    let k = row * 3;
    while (x < W / 2 - 170) {
      const w = words[k++ % words.length];
      const ww = g.measureText(w).width;
      if (x + ww > W / 2 - 170) break;
      g.fillText(w, x, y);
      x += ww + 120;
    }
    x = W / 2 + 170 + ((row * 191) % 300);
    while (x < W) {
      const w = words[k++ % words.length];
      g.fillText(w, x, y);
      x += g.measureText(w).width + 120;
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.anisotropy = 8;
  return {tex, canvas: c};
};
const WALL_W = 34;
const WALL_H = 17;

const sampleInk = (canvas: HTMLCanvasElement, n: number, seed: number, test: (r: number, g: number, b: number, a: number) => boolean) => {
  const g = canvas.getContext("2d")!;
  const {width, height} = canvas;
  const data = g.getImageData(0, 0, width, height).data;
  const out: Array<[number, number]> = [];
  const r = rng(seed);
  let guard = 0;
  while (out.length < n && guard < n * 400) {
    guard++;
    const x = Math.floor(r() * width);
    const y = Math.floor(r() * height);
    const i = (y * width + x) * 4;
    if (test(data[i], data[i + 1], data[i + 2], data[i + 3])) out.push([x / width, y / height]);
  }
  return out;
};

const DUST_VS = /* glsl */ `
  attribute vec3 aEnd;
  attribute vec3 aMid;
  attribute float aDelay;
  uniform float uScatter;
  uniform float uGather;
  uniform float uScale;
  varying float vHot;
  vec3 bez(vec3 a, vec3 b, vec3 c, vec3 d, float t) {
    float u = 1.0 - t;
    return u*u*u*a + 3.0*u*u*t*b + 3.0*u*t*t*c + t*t*t*d;
  }
  void main() {
    float s = clamp(uScatter * 1.3 - aDelay * 0.3, 0.0, 1.0);
    float g = clamp((uGather - aDelay * 0.35) / 0.65, 0.0, 1.0);
    g = g * g * (3.0 - 2.0 * g);
    vec3 burst = mix(position, aMid, 1.0 - pow(1.0 - s, 3.0));
    vec3 p = bez(burst, aMid + (aEnd - aMid) * 0.35 + vec3(0.0, 0.0, 2.5), aEnd + vec3(0.0, 0.0, 1.2), aEnd, g);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp(uScale * 0.022 / max(0.2, -mv.z), 1.2, 9.0);
    vHot = (1.0 - g) * s;
  }
`;
const DUST_FS = /* glsl */ `
  uniform float uOpacity;
  varying float vHot;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c) * 2.0;
    if (d > 1.0) discard;
    float a = exp(-d * d * 3.0);
    vec3 col = mix(vec3(0.95, 0.9, 0.82), vec3(2.2, 1.35, 0.5), vHot);
    gl_FragColor = vec4(col * a * uOpacity, 1.0);
  }
`;

const PLAN_PRODUCT = {
  facts: ["Earbuds in Motion Light", "15 s", "With sound"],
  brief: [
    "A black studio, a glossy plinth and streaks of gold light; the cable and the clutter go.",
    "Five shots cut to music; macro angles glide over the shell and the case.",
    "The buds click magnetically into their case.",
  ],
};

const World: React.FC<{t: number}> = ({t}) => {
  const terms = useMemo(termLayout, []);
  const lead = usePenThroughTerms(terms);
  const wall = useMemo(drawWall, []);
  const thumb = useImage(M.yourProduct.src);
  const plan = useMemo(() => drawPlan(thumb, PLAN_PRODUCT, false), [thumb]);
  const K = 0.0092 * 1.05;

  // Dust: sampled from the wall's letters, landing on the plan's words.
  const dust = useMemo(() => {
    const N = 7000;
    const from = sampleInk(wall.canvas, N, 3, (_r, _g, _b, a) => a > 140);
    const to = sampleInk(plan.canvas, N, 4, (r, g, b) => (r + g + b) / 3 > 150);
    const r = rng(8);
    const pos = new Float32Array(N * 3);
    const mid = new Float32Array(N * 3);
    const endA = new Float32Array(N * 3);
    const delay = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const [u, v] = from[i % from.length];
      const x = O5.x + (u - 0.5) * WALL_W;
      const y = O5.y - (v - 0.5) * WALL_H;
      pos.set([x, y, WALL_Z], i * 3);
      const dir = new THREE.Vector3(x - O5.x, y - O5.y, 0).normalize();
      mid.set([x + dir.x * (1 + r() * 4), y + dir.y * (1 + r() * 3), WALL_Z - 2 - r() * 6], i * 3);
      const [eu, ev] = to[i % to.length];
      endA.set([CARD.x + (eu - 0.5) * plan.w * K, CARD.y - (ev - 0.5) * plan.h * K, CARD.z + 0.02], i * 3);
      delay[i] = r();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aMid", new THREE.BufferAttribute(mid, 3));
    g.setAttribute("aEnd", new THREE.BufferAttribute(endA, 3));
    g.setAttribute("aDelay", new THREE.BufferAttribute(delay, 1));
    return g;
  }, [wall, plan, K]);
  const dustMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: DUST_VS,
        fragmentShader: DUST_FS,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {uScatter: {value: 0}, uGather: {value: 0}, uScale: {value: 1080 / 2 / 0.364}, uOpacity: {value: 1}},
      }),
    [],
  );
  const scatter = seg(t, THROUGH - 0.1, THROUGH + 0.9, ease.linear);
  const gather = seg(t, T.bring - 0.1, T.directs + 0.6, ease.linear);
  const textIn = seg(t, T.directs + 0.2, T.directs + 1.1, ease.outSoft);
  dustMat.uniforms.uScatter.value = scatter;
  dustMat.uniforms.uGather.value = gather;
  dustMat.uniforms.uOpacity.value = 1 - textIn;

  const wallIn = seg(t, T.notJob - 0.1, T.notJob + 0.6, ease.outSoft);
  const wallOut = seg(t, THROUGH - 0.12, THROUGH + 0.05, ease.in);
  const termsOut = seg(t, T.notJob, T.notJob + 0.5, ease.in);

  // The slash: the line cuts the frame as the camera crosses the wall.
  const slash = useMemo(() => {
    const p = new Path();
    const z = WALL_Z - 5.5;
    p.pts.push(new THREE.Vector3(O5.x - 12, O5.y - 2.6, z));
    p.smooth([new THREE.Vector3(O5.x - 1, O5.y - 0.3, z), new THREE.Vector3(O5.x + 4, O5.y + 0.8, z - 2), new THREE.Vector3(CARD.x - (plan.w * K) / 2 - 0.4, CARD.y + 0.6, CARD.z + 0.6), new THREE.Vector3(CARD.x - (plan.w * K) / 2 - 0.12, CARD.y + (plan.h * K) / 2 - 0.3, CARD.z + 0.05)], 14);
    return new LineTrack([
      {pts: p.pts.slice(0, Math.floor(p.pts.length * 0.35)), t0: THROUGH - 0.18, t1: THROUGH + 0.22, ease: ease.linear},
      {pts: p.pts.slice(Math.floor(p.pts.length * 0.35) - 1), t0: T.bring + 0.2, t1: T.directs + 0.3, ease: ease.inOut},
    ]);
  }, [plan, K]);
  // Leaving for C6: out from the card to the right.
  const exit = useMemo(() => {
    const p = new Path();
    const a = new THREE.Vector3(CARD.x - (plan.w * K) / 2 - 0.12, CARD.y + (plan.h * K) / 2 - 0.3, CARD.z + 0.05);
    p.pts.push(a);
    p.smooth([a.clone().add(new THREE.Vector3(1.2, 0.9, 0.4)), new THREE.Vector3(CARD.x + 6, CARD.y + 0.2, CARD.z - 1), new THREE.Vector3(CARD.x + 12, CARD.y - 0.7, CARD.z - 6)], 14);
    return new LineTrack([{pts: p.pts, t0: T.end - 1.8, t1: T.end + 0.4, ease: ease.inOut}]);
  }, [plan, K]);

  const cardIn = seg(t, T.bring + 0.4, T.bring + 1.2, ease.outSoft);
  const media = seg(t, T.bring + 0.2, T.bring + 0.9, ease.outSoft);
  const film = seg(t, T.directs + 0.8, T.directs + 1.6, ease.inOut);
  const leave = seg(t, T.end - 1.6, T.end, ease.in);
  const mediaPos = new THREE.Vector3(CARD.x - (plan.w * K) / 2 - 1.75, CARD.y + 0.1, CARD.z + 0.3);

  return (
    <group>
      {terms.map((tm, i) => {
        const tt = makeTextTexture(termSpec(tm.term));
        const born = seg(t, tm.born - 0.05, tm.born + 0.45, ease.outSoft);
        const flash = life(t, tm.born - 0.05, tm.born + 0.8, 0.05, 0.7);
        const sp = SPOKEN[i] !== undefined ? SPOKEN[i] : -99;
        const lit = life(t, sp - 0.02, sp + 0.9, 0.05, 0.4);
        // Lighting: a key light sweeps across every term, left to right.
        const sweep = clamp01(1 - Math.abs((tm.pos.x - O5.x) / 8 - ((t - T.light) / 0.9 - 0.5) * 2) * 1.2) * (t > T.light && t < T.light + 1.1 ? 1 : 0);
        const toward = new THREE.Vector3(0, 0, 2.2 * lit);
        const k = 1 + 0.25 * lit;
        const tint = new THREE.Color(1, 1, 1).lerp(new THREE.Color(2.0, 1.25, 0.5), Math.max(lit, sweep, flash));
        if (born <= 0 || termsOut >= 1) return null;
        return (
          <TexPlane
            key={tm.term}
            tex={tt.tex}
            w={((tm.h * tt.wPx) / tt.hPx) * k * (0.9 + 0.1 * born)}
            h={tm.h * k * (0.9 + 0.1 * born)}
            position={tm.pos.clone().add(toward)}
            rotation={[0, tm.yaw * (1 - lit), 0]}
            opacity={born * (1 - termsOut)}
            tint={tint}
            renderOrder={20}
          />
        );
      })}
      {t < T.notJob + 0.4 ? <GoldLine pts={lead.pts} progress={lead.progressAt(t)} radius={LINE_R} pen={1} breathe={t > lead.end ? 1 : 0} sparks={4} tailLen={4} overrun={0} opacity={1 - termsOut} /> : null}
      {wallIn > 0 && wallOut < 1 ? <TexPlane tex={wall.tex} w={WALL_W} h={WALL_H} position={[O5.x, O5.y, WALL_Z]} opacity={wallIn * (1 - wallOut)} dim={0.92} renderOrder={21} /> : null}
      {scatter > 0 && textIn < 1 ? <points geometry={dust} material={dustMat} frustumCulled={false} renderOrder={65} /> : null}
      {t > THROUGH - 0.2 ? <GoldLine pts={slash.pts} progress={slash.progressAt(t)} radius={LINE_R} pen={t < T.directs + 0.35 ? 0.85 : 0} sparks={5} tailLen={3.2} overrun={slash.overrunAt(t)} opacity={1 - leave} /> : null}
      {cardIn > 0 ? (
        <group>
          <TexPlane tex={plan.tex} w={plan.w * K} h={plan.h * K} position={CARD.clone().add(new THREE.Vector3(0, 0, -0.01))} opacity={cardIn * textIn * (1 - leave)} renderOrder={6} />
          {/* The card's empty shell is there first; its words arrive as dust. */}
          <mesh position={CARD.clone().add(new THREE.Vector3(0, 0, -0.02))} renderOrder={5}>
            <planeGeometry args={[plan.w * K, plan.h * K]} />
            <meshBasicMaterial color="#181818" transparent opacity={cardIn * (1 - textIn) * 0.95 * (1 - leave)} />
          </mesh>
        </group>
      ) : null}
      {media > 0 ? (
        <group>
          <Card src={M.yourProduct.src} w={2.2} h={2.75} position={mediaPos} corner={0.06} matte={1} opacity={media * (1 - film) * (1 - leave)} renderOrder={7} />
          {film > 0 ? <VideoCard src={M.product.video} poster={M.product.poster} time={t - (T.directs + 0.8)} w={2.2} h={2.2 * (16 / 9)} position={mediaPos} corner={0.06} opacity={film * (1 - leave)} rim={0.5} rimWidth={0.012} renderOrder={8} /> : null}
        </group>
      ) : null}
      {t > T.end - 1.8 ? <GoldLine pts={exit.pts} progress={exit.progressAt(t)} radius={LINE_R} pen={1} sparks={5} tailLen={7} /> : null}
      {GOLD ? null : null}
    </group>
  );
};

export const S5: Scene = {
  id: "s5",
  from: T.start,
  to: T.end,
  camera: s5Camera,
  World,
  dust: 0.5,
};

export const S5_TIMES = T;
export const S5_CARD = CARD;
