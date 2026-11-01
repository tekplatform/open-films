import * as THREE from "three";
import {ease} from "../../timing";
import type {Cam} from "../../world/Stage";
import {camAt, float, type CamKey} from "../../world/track";
import {CAM_Z} from "../../world/space";
import {T} from "./common";

/** Where sentence two and the composer live (C2), to the right of and below the knot. */
export const TURN_CENTRE: [number, number, number] = [11.5, -3.2, 1.0];

/** The caught caret (Opening: end of "co" on the prompt's second line): the still frame looks at it. */
export const CARET_1: [number, number, number] = [-0.09, -0.09, 0];

/**
 * C1 after the words: one
 * arc instead of four zig-zag stations. A soft pull-back on "All at once."
 * that flows, at one speed, into a single right-to-left orbit in to the caret
 * (no roll); a 3 s deceleration; and while the world stands still the camera
 * keeps creeping in, so it never dead-stops. Dense keys timed by a speed profile.
 */
const ORBIT_T0 = T.allAtOnce - 0.4;
const ORBIT_SETTLE = T.still + 1.4;
// The creep lasts until the thread leaves (the caret ignites under it).
const ORBIT_T1 = T.free - 0.15;
const orbitKeys = (): CamKey[] => {
  const [kx, ky, kz] = CARET_1;
  const D = Math.PI / 180;
  // (azimuth round the caret in degrees, distance, height): out, round and in.
  const ctrl: Array<[number, number, number]> = [
    [19.6, 5.79, 0.42],
    [16, 6.9, 0.5],
    [13.5, 7.7, 0.57],
    [10, 8.0, 0.6],
    [6, 7.75, 0.55],
    [2.5, 7.05, 0.45],
    [-0.5, 6.45, 0.35],
    [-2.5, 6.1, 0.29],
    [-3, 5.85, 0.27],
  ];
  const curve = new THREE.CatmullRomCurve3(
    ctrl.map(([az, r, y]) => new THREE.Vector3(kx + r * Math.sin(az * D), y, kz + r * Math.cos(az * D))),
    false,
    "centripetal",
  );
  curve.arcLengthDivisions = 4000;
  const lengths = curve.getLengths();
  const total = lengths[lengths.length - 1];
  const settleL = lengths[Math.round(((ctrl.length - 2) / (ctrl.length - 1)) * (lengths.length - 1))];
  // Speed: ramp up from the words' drift, one cruise speed, a 3 s deceleration, then a creep.
  const v0 = 0.1;
  const ramp = [ORBIT_T0, ORBIT_T0 + 2.0];
  const brake = [ORBIT_SETTLE - 3.0, ORBIT_SETTLE];
  const vc = (total - settleL) / (ORBIT_T1 - ORBIT_SETTLE);
  const sm = (a: number, b: number, x: number) => {
    const u = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return u * u * u * (u * (u * 6 - 15) + 10);
  };
  const shape = (t: number, V: number) => (t < ramp[1] ? v0 + (V - v0) * sm(ramp[0], ramp[1], t) : t < brake[0] ? V : V + (vc - V) * sm(brake[0], brake[1], t));
  // Cruise speed so the camera reaches the settle point exactly at ORBIT_SETTLE.
  const dist = (V: number, t1: number) => {
    let d = 0;
    const h = 1 / 240;
    for (let t = ORBIT_T0; t < t1; t += h) d += shape(t + h / 2, V) * h;
    return d;
  };
  const V = (settleL - dist(0, ORBIT_SETTLE)) / (dist(1, ORBIT_SETTLE) - dist(0, ORBIT_SETTLE));
  const look0 = new THREE.Vector3(2.0, 0.2, 0);
  // The caret sits on the left third, with the knot (and the way the thread will go) to its right.
  const look1 = new THREE.Vector3(kx + 1.0, ky + 0.06, kz);
  const out: CamKey[] = [];
  let d = 0;
  let t = ORBIT_T0;
  const h = 1 / 240;
  const step = 0.25;
  for (let k = 0; ; k++) {
    const tk = Math.min(ORBIT_T1, ORBIT_T0 + k * step);
    while (t < tk - 1e-9) {
      const dt = Math.min(h, tk - t);
      d += (t + dt / 2 < ORBIT_SETTLE ? shape(t + dt / 2, V) : vc) * dt;
      t += dt;
    }
    const s = Math.min(total, d);
    const p = curve.getPointAt(s / total);
    // Through the stillness the gaze drifts a hair towards where the thread will go (never two equal keys).
    const creep = Math.max(0, (s - settleL) / (total - settleL));
    const look = look0.clone().lerp(look1, sm(0, 0.85, s / settleL)).add(new THREE.Vector3(0.14 * creep, -0.03 * creep, 0));
    out.push({t: tk, pos: [p.x, p.y, p.z], look: [look.x, look.y, look.z]});
    if (tk >= ORBIT_T1) break;
  }
  return out;
};

const KEYS: CamKey[] = [
  // C0: rest, a slow breath forward, then the push as everything accelerates.
  {t: 0, pos: [0, 0, CAM_Z + 0.8], look: [0, 0, 0]},
  {t: 7.0, pos: [0, 0, CAM_Z], look: [0, 0, 0], ease: ease.linear},
  {t: T.accel, pos: [0.05, 0.02, CAM_Z - 0.9], look: [0, 0, 0], ease: ease.linear},
  {t: T.ringsIn + 0.6, pos: [0.6, 0.35, 10.6], look: [0, 0.1, -0.3], ease: ease.push},
  // The rings: drift round them…
  {t: T.batch2, pos: [2.7, 1.7, 9.6], look: [0, 0.15, 0], ease: ease.linear},
  {t: T.honest, pos: [-1.9, 1.0, 8.2], look: [0.2, 0.15, 0], ease: ease.linear},
  // …and slip between them as they speed up.
  {t: T.collapse, pos: [0.6, -0.4, 5.4], look: [1.2, 0.2, 0], ease: ease.inOut},
  // C1: inside the knot, on the unfinished end of the sentence.
  {t: T.slams[0] - 0.2, pos: [1.9, 0.45, 4.9], look: [2.05, 0.21, 0], ease: ease.glide},
  // After the words: one arc, then the slow creep through the stillness.
  ...orbitKeys(),
  // C2: follow the freed thread out of the knot, along its own path (re-timed below).
  {t: T.free + 1.6, pos: [3.6, -0.9, 7.6], look: [4.4, -1.1, 1.2]},
  {t: T.just, pos: [6.0, -1.6, 9.6], look: [6.6, -2.0, 0.9]},
  {t: T.talk, pos: [8.6, -2.45, 11.9], look: [8.7, -2.9, 0.8]},
  {t: T.tell + 1.4, pos: [TURN_CENTRE[0], TURN_CENTRE[1] + 0.35, TURN_CENTRE[2] + CAM_Z * 0.92], look: [TURN_CENTRE[0], TURN_CENTRE[1] + 0.35, TURN_CENTRE[2]], ease: ease.glide},
  {t: T.discover, pos: [TURN_CENTRE[0] - 0.2, TURN_CENTRE[1] + 0.6, TURN_CENTRE[2] + CAM_Z * 1.02], look: [TURN_CENTRE[0], TURN_CENTRE[1] + 0.5, TURN_CENTRE[2]], ease: ease.linear},
  {t: T.dive - 0.6, pos: [TURN_CENTRE[0] - 0.1, TURN_CENTRE[1] + 0.45, TURN_CENTRE[2] + CAM_Z * 0.95], look: [TURN_CENTRE[0], TURN_CENTRE[1] + 0.4, TURN_CENTRE[2]], ease: ease.linear},
];

/** Before the dive the camera is a pure function of the keys; the dive itself is added in Turn. */
/**
 * Re-time keys i0..i1 for one steady speed, except that the first and last
 * segments take twice as long as their distance asks: the spline then ramps
 * linearly from rest up to that speed and back down, with no overshoot.
 */
const steadyFollow = (keys: CamKey[], i0: number, i1: number) => {
  const d: number[] = [];
  for (let i = i0; i < i1; i++) {
    const [a, b, la, lb] = [keys[i].pos, keys[i + 1].pos, keys[i].look, keys[i + 1].look];
    d.push(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) + 0.6 * Math.hypot(lb[0] - la[0], lb[1] - la[1], lb[2] - la[2]) + 1e-3);
  }
  const w = d.map((x, k) => (k === 0 || k === d.length - 1 ? 2 * x : x));
  const total = w.reduce((x, y) => x + y, 0);
  const T0 = keys[i0].t;
  const T1 = keys[i1].t;
  const out = keys.map((k) => ({...k}));
  let acc = 0;
  for (let i = i0 + 1; i < i1; i++) {
    acc += w[i - i0 - 1];
    out[i].t = T0 + ((T1 - T0) * acc) / total;
  }
  return out;
};
// From the end of the stillness to the composer the follow keeps one steady speed.
const CREEP_END = KEYS.findIndex((k) => k.t === ORBIT_T1);
const COMPOSER_KEY = KEYS.findIndex((k) => k.t === T.tell + 1.4);
const EVEN_KEYS = steadyFollow(KEYS, CREEP_END, COMPOSER_KEY);

export const s1BaseCam = (t: number): Cam => {
  // The float's own clock stops while everything stands still, so nothing snaps.
  const hold = T.free - 0.6 - T.still;
  const tf = t < T.still ? t : t < T.free - 0.6 ? T.still : t - hold;
  return float(camAt(EVEN_KEYS, t), tf, 0.035);
};

/** A point d units in front of the camera at time t, and the camera's orientation. */
export const inFront = (cam: Cam, d: number) => {
  const p = new THREE.Vector3(...cam.position);
  const dir = new THREE.Vector3(...cam.target).sub(p).normalize();
  const m = new THREE.Matrix4().lookAt(p, new THREE.Vector3(...cam.target), new THREE.Vector3(0, 1, 0));
  const q = new THREE.Quaternion().setFromRotationMatrix(m);
  return {pos: p.add(dir.multiplyScalar(d)), q};
};
