import {Easing} from "remotion";
import timing from "./vo-timing.json";

/**
 * Film time helpers. Everything in the film is a pure function of the global
 * time t (seconds). Cue times come from the measured narration.
 */

type CueTime = {id: string; section: string; text: string; start: number; end: number};
const CUE_MAP = new Map<string, CueTime>((timing.cues as CueTime[]).map((c) => [c.id, c]));

/** Start of a narration cue (s). Picture follows the word by ~0.2 s, slams land at 0. */
export const cue = (id: string) => {
  const c = CUE_MAP.get(id);
  if (!c) throw new Error(`unknown cue ${id}`);
  return c;
};
export const at = (id: string, offset = 0) => cue(id).start + offset;
export const end = (id: string, offset = 0) => cue(id).end + offset;
export const allCues = timing.cues as CueTime[];

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
export const mix3 = (a: [number, number, number], b: [number, number, number], k: number): [number, number, number] => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];

/** Named eases. No linear or generic in-out on hero motion (studio rule). */
export const ease = {
  out: Easing.bezier(0.16, 1, 0.3, 1),
  outSoft: Easing.bezier(0.25, 0.9, 0.35, 1),
  in: Easing.bezier(0.7, 0, 0.84, 0),
  inOut: Easing.bezier(0.83, 0, 0.17, 1),
  glide: Easing.bezier(0.45, 0.05, 0.25, 1),
  push: Easing.bezier(0.7, 0, 0.2, 1),
  settle: Easing.bezier(0.2, 0.9, 0.25, 1.04),
  linear: (x: number) => x,
} as const;

/** 0..1 progress of t through [a, b] with an ease. */
export const seg = (t: number, a: number, b: number, e: (x: number) => number = ease.out) => e(clamp01((t - a) / Math.max(1e-6, b - a)));

/** Fade in at a over d, out at b over d2. */
export const life = (t: number, a: number, b: number, d = 0.4, d2 = d) => Math.min(seg(t, a, a + d, ease.outSoft), 1 - seg(t, b - d2, b, ease.in));

/** Smooth noise-free drift: a sum of slow sines (deterministic). */
export const drift = (t: number, seed: number, amp = 1) =>
  amp * (Math.sin(t * 0.21 + seed * 1.7) * 0.6 + Math.sin(t * 0.37 + seed * 3.1) * 0.3 + Math.sin(t * 0.59 + seed * 5.3) * 0.1);

/** Damped breath of the pen when the line rests. */
export const breath = (t: number) => 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * 0.42 - Math.PI / 2);
