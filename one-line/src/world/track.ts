import * as THREE from "three";
import {clamp01, ease} from "../timing";
import type {Cam} from "./Stage";
import type {V3} from "./space";

/**
 * Time-driven geometry for the line and the camera.
 *
 * LineTrack: the line as a sequence of strokes, each drawn between t0 and t1.
 * Inside a stroke the pen spends time by "effort" (length plus turning), so it
 * races along straights and slows in curves and while drawing objects.
 * A stroke can be a pause (no points) where the pen rests.
 */

export type Stroke = {pts: THREE.Vector3[]; t0: number; t1: number; ease?: (x: number) => number; turnCost?: number};

export class LineTrack {
  pts: THREE.Vector3[] = [];
  cum: number[] = [];
  private strokes: Array<{i0: number; i1: number; t0: number; t1: number; ease: (x: number) => number; costs: number[]}> = [];

  constructor(strokes: Stroke[]) {
    for (const s of strokes) {
      const i0 = Math.max(0, this.pts.length - 1);
      for (const p of s.pts) {
        const last = this.pts[this.pts.length - 1];
        if (last && last.distanceToSquared(p) < 1e-10) continue;
        this.cum.push(last ? this.cum[this.cum.length - 1] + last.distanceTo(p) : 0);
        this.pts.push(p.clone());
      }
      const i1 = this.pts.length - 1;
      // Effort per point: arc length plus a cost for turning.
      const k = s.turnCost ?? 0.06;
      const costs = [0];
      for (let i = i0 + 1; i <= i1; i++) {
        const ds = this.cum[i] - this.cum[i - 1];
        let turn = 0;
        if (i < i1 && i > 0) {
          const a = this.pts[i].clone().sub(this.pts[i - 1]).normalize();
          const b = this.pts[i + 1].clone().sub(this.pts[i]).normalize();
          turn = Math.acos(Math.min(1, Math.max(-1, a.dot(b))));
        }
        costs.push(costs[costs.length - 1] + ds + k * turn);
      }
      this.strokes.push({i0, i1, t0: s.t0, t1: s.t1, ease: s.ease ?? ease.glide, costs});
    }
  }

  get length() {
    return this.cum[this.cum.length - 1] ?? 0;
  }

  /** When the last stroke ends. */
  get end() {
    return this.strokes[this.strokes.length - 1]?.t1 ?? 0;
  }

  /** How far a virtual pen has run past the end (so comet tails burn out). */
  overrunAt(t: number, speed = 6) {
    return Math.max(0, t - this.end) * speed;
  }

  /** Arc length drawn at time t. */
  lengthAt(t: number) {
    let L = 0;
    for (const s of this.strokes) {
      if (t <= s.t0) return L;
      const f = s.ease(clamp01((t - s.t0) / Math.max(1e-6, s.t1 - s.t0)));
      const total = s.costs[s.costs.length - 1];
      if (total <= 0) {
        L = this.cum[s.i1];
        continue;
      }
      const target = f * total;
      // Binary search the effort table.
      let lo = 0;
      let hi = s.costs.length - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (s.costs[mid] < target) lo = mid;
        else hi = mid;
      }
      const c0 = s.costs[lo];
      const c1 = s.costs[hi];
      const k = c1 > c0 ? (target - c0) / (c1 - c0) : 0;
      L = this.cum[s.i0 + lo] + (this.cum[s.i0 + hi] - this.cum[s.i0 + lo]) * k;
      if (t < s.t1) return L;
    }
    return L;
  }

  progressAt(t: number) {
    return this.length > 0 ? this.lengthAt(t) / this.length : 0;
  }

  /** Point at arc length L (polyline). */
  pointAtLength(L: number) {
    if (this.pts.length === 0) return new THREE.Vector3();
    if (L <= 0) return this.pts[0].clone();
    if (L >= this.length) return this.pts[this.pts.length - 1].clone();
    let lo = 0;
    let hi = this.cum.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.cum[mid] < L) lo = mid;
      else hi = mid;
    }
    const k = (L - this.cum[lo]) / Math.max(1e-9, this.cum[hi] - this.cum[lo]);
    return this.pts[lo].clone().lerp(this.pts[hi], k);
  }

  headAt(t: number) {
    return this.pointAtLength(this.lengthAt(t));
  }

  /** Speed of the pen (units/s), for sparks and the whoosh. */
  speedAt(t: number, dt = 1 / 60) {
    return Math.abs(this.lengthAt(t + dt) - this.lengthAt(t)) / dt;
  }
}

// ------------------------------------------------------------------ camera

export type CamKey = {
  t: number;
  pos: V3;
  look: V3;
  fov?: number;
  roll?: number;
  /** Legacy per-segment ease. Ignored: the camera is one continuous spline now. */
  ease?: (x: number) => number;
  /** The camera comes to rest on this key (zero velocity). */
  stop?: boolean;
};

/**
 * Steffen's monotone cubic: C1 through the samples, no overshoot, so the
 * camera never wobbles past a key and never brakes on one unless it stops.
 */
const steffen = (ts: number[], ys: number[], stops: boolean[]) => {
  const n = ts.length;
  const m = new Array(n).fill(0);
  for (let k = 0; k < n; k++) {
    if (stops[k] || k === 0 || k === n - 1) continue;
    const h0 = ts[k] - ts[k - 1];
    const h1 = ts[k + 1] - ts[k];
    const d0 = (ys[k] - ys[k - 1]) / h0;
    const d1 = (ys[k + 1] - ys[k]) / h1;
    const p = (d0 * h1 + d1 * h0) / (h0 + h1);
    m[k] = (Math.sign(d0) + Math.sign(d1)) * Math.min(Math.abs(d0), Math.abs(d1), 0.5 * Math.abs(p));
  }
  return m;
};

const hermite = (y0: number, y1: number, m0: number, m1: number, h: number, s: number) => {
  const s2 = s * s;
  const s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * y0 + (s3 - 2 * s2 + s) * h * m0 + (-2 * s3 + 3 * s2) * y1 + (s3 - s2) * h * m1;
};

type Prepared = {
  pos: {curve: THREE.CatmullRomCurve3; m: number[]; s: number[]; L: number};
  look: {curve: THREE.CatmullRomCurve3; m: number[]; s: number[]; L: number};
  fov: number[];
  roll: number[];
  ts: number[];
};
const PREPARED = new WeakMap<CamKey[], Prepared>();

/** A path through points, and the arc length reached at each point. */
const pathOf = (pts: THREE.Vector3[]) => {
  const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal");
  // A fine arc-length table, or the speed ripples between its samples.
  curve.arcLengthDivisions = Math.max(2000, pts.length * 600);
  const lengths = curve.getLengths();
  const L = lengths[lengths.length - 1];
  const s = pts.map((_, i) => lengths[Math.round((i / (pts.length - 1)) * (lengths.length - 1))]);
  return {curve, s, L};
};

const prepare = (keys: CamKey[]): Prepared => {
  const hit = PREPARED.get(keys);
  if (hit) return hit;
  const ts = keys.map((k) => k.t);
  const stops = keys.map((k) => !!k.stop);
  const mk = (pts: THREE.Vector3[]) => {
    const p = pathOf(pts);
    // Progress along the path is a monotone C1 curve in time: no stalls, no
    // surges, rest only on stops.
    return {...p, m: steffen(ts, p.s, stops)};
  };
  const prep: Prepared = {
    pos: mk(keys.map((k) => new THREE.Vector3(...k.pos))),
    look: mk(keys.map((k) => new THREE.Vector3(...k.look))),
    fov: steffen(ts, keys.map((k) => k.fov ?? 40), stops),
    roll: steffen(ts, keys.map((k) => k.roll ?? 0), stops),
    ts,
  };
  PREPARED.set(keys, prep);
  return prep;
};

/**
 * The camera through its keys. Position and gaze each travel one smooth
 * spatial curve (centripetal Catmull-Rom), and how far along it they are is a
 * monotone C1 function of time: the speed flows through every key, even when
 * the path turns, and only falls to rest where a key says `stop` (or at the
 * film's ends; a neighbouring scene's key can be appended as a ghost so the
 * camera runs straight through a seam).
 */
export const camAt = (keys: CamKey[], t: number): Cam => {
  const n = keys.length;
  const P = prepare(keys);
  const at = (k: CamKey): Cam => ({position: k.pos, target: k.look, fov: k.fov ?? 40, roll: k.roll ?? 0});
  if (t <= keys[0].t) return at(keys[0]);
  if (t >= keys[n - 1].t) return at(keys[n - 1]);
  let i = 0;
  while (i < n - 2 && t > keys[i + 1].t) i++;
  const h = keys[i + 1].t - keys[i].t;
  const x = clamp01((t - keys[i].t) / h);
  const along = (c: Prepared["pos"]) => {
    const sNow = hermite(c.s[i], c.s[i + 1], c.m[i], c.m[i + 1], h, x);
    return c.curve.getPointAt(c.L > 0 ? clamp01(sNow / c.L) : 0);
  };
  const p = along(P.pos);
  const l = along(P.look);
  const fov = hermite(keys[i].fov ?? 40, keys[i + 1].fov ?? 40, P.fov[i], P.fov[i + 1], h, x);
  const roll = hermite(keys[i].roll ?? 0, keys[i + 1].roll ?? 0, P.roll[i], P.roll[i + 1], h, x);
  return {position: [p.x, p.y, p.z], target: [l.x, l.y, l.z], fov, roll};
};

/**
 * Re-time the keys strictly between i0 and i1 so each segment's duration is
 * proportional to how far the camera travels: an even, steady speed.
 */
export const evenOut = (keys: CamKey[], i0: number, i1: number) => {
  const d: number[] = [];
  for (let i = i0; i < i1; i++) {
    const a = keys[i].pos;
    const b = keys[i + 1].pos;
    const la = keys[i].look;
    const lb = keys[i + 1].look;
    // Distance travelled plus how far the gaze swings (both read as motion).
    d.push(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) + 0.6 * Math.hypot(lb[0] - la[0], lb[1] - la[1], lb[2] - la[2]) + 1e-3);
  }
  const total = d.reduce((x, y) => x + y, 0);
  const T0 = keys[i0].t;
  const T1 = keys[i1].t;
  let acc = 0;
  const out = keys.map((k) => ({...k}));
  for (let i = i0 + 1; i < i1; i++) {
    acc += d[i - i0 - 1];
    out[i].t = T0 + ((T1 - T0) * acc) / total;
  }
  return out;
};

/**
 * One camera move through several framings, as dense keys (every 0.1 s). The path is one
 * centripetal curve through the framings' positions. Distance along it is driven by quintic
 * Hermite segments between pinned knots (a framing index, a time, a speed): velocity and
 * acceleration are continuous and the acceleration is zero at every knot, so the move never
 * jerks. The gaze blends framing to framing as a direction (not a point), by distance, so a
 * camera travelling fast does not swing its view.
 */
export type Framing = {pos: THREE.Vector3; look: THREE.Vector3};
export const glideKeys = (framings: Framing[], knots: Array<{at: number; t: number; v: number}>, dt = 0.1): CamKey[] => {
  const n = framings.length - 1;
  const curve = new THREE.CatmullRomCurve3(framings.map((f) => f.pos), false, "centripetal");
  const D = 4000;
  curve.arcLengthDivisions = D;
  const lengths = curve.getLengths(D);
  const sAt = framings.map((_, i) => lengths[Math.round((i / n) * D)]);
  const L = sAt[n];
  const K = knots.map((k) => ({t: k.t, s: sAt[k.at], v: k.v}));
  const sOf = (t: number) => {
    let k = 0;
    while (k < K.length - 2 && t > K[k + 1].t) k++;
    const a = K[k];
    const b = K[k + 1];
    const h = b.t - a.t;
    const u = clamp01((t - a.t) / h);
    const u3 = u * u * u;
    const u4 = u3 * u;
    const u5 = u4 * u;
    return (1 - 10 * u3 + 15 * u4 - 6 * u5) * a.s + (u - 6 * u3 + 8 * u4 - 3 * u5) * h * a.v + (10 * u3 - 15 * u4 + 6 * u5) * b.s + (-4 * u3 + 7 * u4 - 3 * u5) * h * b.v;
  };
  const smoother = (x: number) => {
    const u = clamp01(x);
    return u * u * u * (u * (u * 6 - 15) + 10);
  };
  const dirs = framings.map((f) => f.look.clone().sub(f.pos).normalize());
  const reach = framings.map((f) => f.look.distanceTo(f.pos));
  const out: CamKey[] = [];
  const t0 = K[0].t;
  const t1 = K[K.length - 1].t;
  for (let k = 1; ; k++) {
    const t = Math.min(t1, t0 + k * dt);
    const s = Math.min(L, Math.max(0, sOf(t)));
    let i = 0;
    while (i < n - 1 && s > sAt[i + 1]) i++;
    const w = smoother((s - sAt[i]) / Math.max(1e-6, sAt[i + 1] - sAt[i]));
    const p = curve.getPointAt(s / L);
    const dir = dirs[i].clone().lerp(dirs[i + 1], w).normalize();
    const look = p.clone().addScaledVector(dir, reach[i] + (reach[i + 1] - reach[i]) * w);
    out.push({t, pos: [p.x, p.y, p.z], look: [look.x, look.y, look.z]});
    if (t >= t1) break;
  }
  const last = framings[n];
  out[out.length - 1] = {t: t1, pos: [last.pos.x, last.pos.y, last.pos.z], look: [last.look.x, last.look.y, last.look.z]};
  return out;
};

/** Add a tiny deterministic float so a still camera never feels frozen. */
export const float = (cam: Cam, t: number, amp = 0.03): Cam => ({
  ...cam,
  position: [
    cam.position[0] + amp * (Math.sin(t * 0.31) * 0.7 + Math.sin(t * 0.53 + 1.3) * 0.3),
    cam.position[1] + amp * 0.7 * (Math.sin(t * 0.27 + 2.1) * 0.7 + Math.sin(t * 0.61) * 0.3),
    cam.position[2],
  ],
});

/** Screen position (px, 1920×1080) of a world point seen by a camera pose. */
const PROJ = new THREE.PerspectiveCamera(40, 16 / 9, 0.05, 3000);
export const project = (cam: Cam, p: THREE.Vector3) => {
  PROJ.position.set(...cam.position);
  PROJ.up.set(Math.sin(cam.roll ?? 0), Math.cos(cam.roll ?? 0), 0);
  PROJ.lookAt(new THREE.Vector3(...cam.target));
  PROJ.fov = cam.fov ?? 40;
  PROJ.updateProjectionMatrix();
  PROJ.updateMatrixWorld();
  const v = p.clone().project(PROJ);
  return {x: (v.x * 0.5 + 0.5) * 1920, y: (0.5 - v.y * 0.5) * 1080, behind: v.z > 1};
};

/**
 * A line whose pen follows a function of time p(τ) (e.g. leading the camera).
 * Sampled once; progress is the arc-length fraction reached at time t.
 */
export class TimedTrack {
  pts: THREE.Vector3[] = [];
  private times: number[] = [];
  private cum: number[] = [];
  constructor(p: (tau: number) => THREE.Vector3, t0: number, t1: number, step = 1 / 30) {
    for (let tau = t0; tau <= t1 + 1e-6; tau += step) {
      const v = p(tau);
      const last = this.pts[this.pts.length - 1];
      this.cum.push(last ? this.cum[this.cum.length - 1] + last.distanceTo(v) : 0);
      this.pts.push(v);
      this.times.push(tau);
    }
  }
  progressAt(t: number) {
    const n = this.times.length;
    if (n < 2 || t <= this.times[0]) return 0;
    if (t >= this.times[n - 1]) return 1;
    const step = this.times[1] - this.times[0];
    const i = Math.min(n - 2, Math.floor((t - this.times[0]) / step));
    const k = (t - this.times[i]) / step;
    const L = this.cum[i] + (this.cum[i + 1] - this.cum[i]) * k;
    return L / this.cum[n - 1];
  }
}
