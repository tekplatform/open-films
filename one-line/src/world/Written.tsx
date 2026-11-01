import React, {useMemo} from "react";
import * as THREE from "three";
import {TexPlane, type CardLook} from "./Card";
import {Pen} from "./Line";
import {makeTextTexture, measure, type TextSpec} from "./Type";
import {at, px} from "./space";
import {clamp01, ease} from "../timing";

/**
 * Handwriting by the line. The glyphs are the line's ink (tinted HDR gold so
 * they glow like it); a write-on wipe follows the pen, and the pen's speed and
 * height come from the ink itself: it lingers where letters are dense, skims
 * spaces and bobs through the strokes.
 */

export type Writing = {
  spec: TextSpec;
  /** Canvas analysis: per px column, cumulative effort and the pen's height (px from top). */
  cum: Float32Array;
  penY: Float32Array;
  wPx: number;
  hPx: number;
  x0: number;
  x1: number;
};

const CACHE = new Map<string, Writing>();

export const analyse = (spec: TextSpec): Writing => {
  const key = JSON.stringify(spec);
  const hit = CACHE.get(key);
  if (hit) return hit;
  const tt = makeTextTexture(spec);
  const {canvas, ss, wPx, hPx} = tt;
  const g = canvas.getContext("2d")!;
  const img = g.getImageData(0, 0, canvas.width, canvas.height).data;
  const ink = new Float32Array(wPx);
  const cy = new Float32Array(wPx);
  const top = new Float32Array(wPx);
  const bot = new Float32Array(wPx);
  for (let x = 0; x < wPx; x++) {
    let sum = 0;
    let ys = 0;
    let t = -1;
    let b = -1;
    for (let sy = 0; sy < canvas.height; sy += 2) {
      let a = 0;
      for (let k = 0; k < ss; k++) a += img[(sy * canvas.width + x * ss + k) * 4 + 3];
      if (a > 40) {
        sum += a;
        ys += a * (sy / ss);
        if (t < 0) t = sy / ss;
        b = sy / ss;
      }
    }
    ink[x] = sum;
    cy[x] = sum > 0 ? ys / sum : -1;
    top[x] = t;
    bot[x] = b;
  }
  let x0 = 0;
  while (x0 < wPx - 1 && ink[x0] === 0) x0++;
  let x1 = wPx - 1;
  while (x1 > 0 && ink[x1] === 0) x1--;
  const max = Math.max(...Array.from(ink));
  const base = tt.ascent * 0.6 + tt.padPx;
  // Effort: ink plus a floor so spaces still take a moment.
  const cum = new Float32Array(wPx);
  let acc = 0;
  for (let x = 0; x < wPx; x++) {
    if (x >= x0 && x <= x1) acc += ink[x] / max + 0.18;
    cum[x] = acc;
  }
  // Pen height: the ink's centre, smoothed, with a bob through each stroke.
  const penY = new Float32Array(wPx);
  let last = base;
  let phase = 0;
  for (let x = 0; x < wPx; x++) {
    let s = 0;
    let n = 0;
    for (let k = -6; k <= 6; k++) {
      const xi = x + k;
      if (xi >= 0 && xi < wPx && cy[xi] >= 0) {
        s += cy[xi];
        n++;
      }
    }
    const c = n ? s / n : last;
    last = c;
    phase += (ink[x] / max) * 0.55;
    const amp = top[x] >= 0 ? (bot[x] - top[x]) * 0.32 : 0;
    penY[x] = c + Math.sin(phase) * amp;
  }
  const w = {spec, cum, penY, wPx, hPx, x0, x1};
  CACHE.set(key, w);
  return w;
};

/** Fraction of the text written (0..1 of effort) → pen column (px). */
const columnAt = (w: Writing, f: number) => {
  const total = w.cum[w.x1];
  const target = clamp01(f) * total;
  let lo = w.x0;
  let hi = w.x1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (w.cum[mid] < target) lo = mid;
    else hi = mid;
  }
  return lo;
};

/** Effort fraction at which a prefix of the text ends (to stop mid-sentence). */
export const cutFraction = (w: Writing, prefix: string) => {
  const tt = makeTextTexture(w.spec);
  const x = Math.round(tt.padPx + measure(w.spec, prefix));
  return w.cum[Math.min(w.x1, Math.max(w.x0, x))] / w.cum[w.x1];
};

/**
 * Either a screen position for the camera at rest (x, y px at depth z), or a
 * world centre with a scale k (world units per text px). `left` anchors the
 * text's ink start at the point instead of its centre.
 */
export type Placement = {x: number; y: number; z: number; world?: undefined; left?: boolean} | {world: THREE.Vector3; k: number; left?: boolean};

export const frameOf = (w: {wPx: number; padPx?: number}, place: Placement) => {
  const tt = makeTextTexture((w as Writing).spec);
  if (place.world) {
    const centre = place.world.clone();
    if (place.left) centre.x += (tt.wPx / 2 - tt.padPx) * place.k;
    return {centre, k: place.k};
  }
  const k = px(1, place.z);
  const centre = at(place.x, place.y, place.z);
  if (place.left) centre.x += (tt.wPx / 2 - tt.padPx) * k;
  return {centre, k};
};

/** Pen state for a written text at its placement. */
export const penState = (w: Writing, place: Placement, f: number) => {
  const col = columnAt(w, f);
  const u = col / w.wPx;
  const v = w.penY[col] / w.hPx;
  const {centre, k} = frameOf(w, place);
  const pos = new THREE.Vector3(centre.x + (u - 0.5) * w.wPx * k, centre.y + (0.5 - v) * w.hPx * k, centre.z + 0.01);
  return {u, pos, col};
};

/** Start point of the writing (where the line hands over to the pen). */
export const writingStart = (w: Writing, place: Placement) => penState(w, place, 0).pos;
export const writingEnd = (w: Writing, place: Placement) => penState(w, place, 1).pos;

export const Written: React.FC<
  {
    spec: TextSpec;
    place: Placement;
    /** Written fraction 0..1 (effort). */
    f: number;
    /** Glyph tint (HDR for line-ink). */
    tint?: THREE.Color;
    pen?: number;
    penBreathe?: number;
    renderOrder?: number;
  } & Omit<CardLook, "wipe" | "tint">
> = ({spec, place, f, tint, pen = 0.8, penBreathe = 0, renderOrder = 20, ...look}) => {
  const w = useMemo(() => analyse(spec), [spec]);
  const tt = makeTextTexture(spec);
  const st = penState(w, place, f);
  const {centre, k} = frameOf(w, place);
  const writing = f > 0 && f < 1;
  return (
    <group>
      <TexPlane
        tex={tt.tex}
        w={tt.wPx * k}
        h={tt.hPx * k}
        position={centre}
        tint={tint}
        wipe={f >= 1 ? 10 : st.u}
        wipeSoft={0.006}
        renderOrder={renderOrder}
        {...look}
      />
      {pen > 0 && (writing || penBreathe > 0) ? <Pen position={st.pos} size={pen} breathe={penBreathe} sparks={writing ? 4 : 2} /> : null}
    </group>
  );
};

export const writeF = (t: number, t0: number, t1: number) => ease.linear(clamp01((t - t0) / (t1 - t0)));
