import React from "react";
import * as THREE from "three";
import {ease, seg} from "../timing";
import {TexPlane} from "./Card";
import {splitWord, type Glyph} from "./Glyphs";
import {rng} from "./space";
import type {TextSpec} from "./Type";

/**
 * The film's one-word moments ("talk.", "approve.", "mine.") share one
 * grammar: the letters come out of depth as the line's light, gather from wide
 * spacing into the word (outside in) and cool to warm white. While set, the
 * word keeps shrinking a touch, so it never sits dead. It never fades out:
 * each scene sends the letters into the thing the word is about (`exit`).
 */

export type GlyphState = {pos: THREE.Vector3; yaw: number; scale: number; opacity: number; heat: number; blur: number};

export type GatherLayout = {glyphs: Glyph[]; s: number; inkW: number; xHeight: number};

export const gatherLayout = (text: string, spec: TextSpec, width: number): GatherLayout => {
  const w = splitWord(text, spec);
  return {glyphs: w.glyphs, s: width / w.inkW, inkW: w.inkW, xHeight: w.xHeight};
};

export const HOT = new THREE.Color(1.8, 1.2, 0.62);

export type GatherProps = {
  t: number;
  layout: GatherLayout;
  /** Word centre and orientation in the world. */
  centre: THREE.Vector3;
  quaternion?: THREE.Quaternion;
  /** The letters set off. */
  t0: number;
  /** The settle-shrink ends (usually when the exit starts). */
  t1: number;
  seed?: number;
  /** Start spread of the home x positions, and depth scatter (world units). */
  spread?: number;
  depth?: number;
  lift?: number;
  /** Per-glyph exit: mutate the state (local word coordinates). */
  exit?: (i: number, g: Glyph, st: GlyphState) => void;
  renderOrder?: number;
  blurK?: number;
  /** Explicit start offsets (y, depth) per glyph instead of the seeded ones. */
  scatter?: Array<{y: number; z: number}>;
  /** Per-glyph flight time and the outside-in step between ranks (s). Fast words (C1) use less. */
  dur?: number;
  stagger?: number;
};

const scatterFor = (n: number, seed: number) => {
  const r = rng(seed);
  return new Array(n).fill(0).map((_, i) => ({
    y: (r() < 0.5 ? -1 : 1) * (0.3 + r() * 0.5),
    // Alternate in front of / behind the word so the gather reads as depth.
    z: (i % 2 === 0 ? 1 : -1) * (0.8 + r() * 2.0),
  }));
};
const SCATTER = new Map<string, Array<{y: number; z: number}>>();

/** The state of every glyph at time t (home + gather), before any exit. */
export const gatherStates = ({t, layout, t0, t1, seed = 1, spread = 2.3, depth = 1, lift = 1, blurK = 1, scatter, dur = 0.85, stagger = 0.035}: GatherProps): GlyphState[] => {
  const {glyphs, s} = layout;
  const n = glyphs.length;
  const key = `${n}:${seed}`;
  if (!SCATTER.has(key)) SCATTER.set(key, scatterFor(n, seed));
  const sc = scatter ?? SCATTER.get(key)!;
  const mid = (n - 1) / 2;
  const rankOf = (i: number) => Math.max(0, Math.round(Math.abs(i - mid) - 0.5));
  const maxRank = rankOf(0);
  const k = 1.04 - 0.04 * seg(t, t0 + 0.1, t1, ease.outSoft);
  const d = dur / 0.85;
  return glyphs.map((g, i) => {
    const u = mid > 0 ? (i - mid) / mid : 0;
    // Outside in: the outer letters (furthest to travel) leave first.
    const s0 = t0 + (maxRank - rankOf(i)) * stagger;
    const e = seg(t, s0, s0 + dur, ease.out);
    const home = new THREE.Vector3(g.x * s * k, g.y * s * k, 0);
    const pos = new THREE.Vector3(g.x * s * spread, sc[i].y * lift, sc[i].z * depth).lerp(home, e);
    return {
      pos,
      yaw: -0.5 * Math.sign(u) * (0.6 + 0.4 * Math.abs(u)) * (1 - e),
      scale: k,
      opacity: seg(t, s0, s0 + 0.28 * d, ease.outSoft),
      heat: 1 - seg(t, s0 + 0.12 * d, s0 + 0.62 * d, ease.inOut),
      blur: (0.09 * Math.pow(1 - e, 1.4) + Math.abs(pos.z) * 0.025) * blurK,
    };
  });
};

export const GatherWord: React.FC<GatherProps> = (props) => {
  const {layout, centre, quaternion, exit, renderOrder = 40} = props;
  const items = gatherStates(props);
  if (exit) items.forEach((st, i) => exit(i, layout.glyphs[i], st));
  // Far glyphs first, so a blurred near one never cuts a far one by depth.
  const order = items.map((_, i) => i).sort((a, b) => items[a].pos.z - items[b].pos.z);
  const {s} = layout;
  return (
    <group position={centre} quaternion={quaternion}>
      {order.map((i, z) => {
        const it = items[i];
        if (it.opacity <= 0.002 || it.scale <= 0.001) return null;
        const g = layout.glyphs[i];
        return (
          <TexPlane
            key={i}
            tex={g.tt.tex}
            w={g.tt.wPx * s * it.scale}
            h={g.tt.hPx * s * it.scale}
            position={it.pos}
            rotation={[0, it.yaw, 0]}
            blur={it.blur}
            opacity={it.opacity}
            tint={new THREE.Color(1, 1, 1).lerp(HOT, it.heat)}
            renderOrder={renderOrder + z}
          />
        );
      })}
    </group>
  );
};

/** World point → the word's local frame. */
export const toLocal = (p: THREE.Vector3, centre: THREE.Vector3, quaternion?: THREE.Quaternion) => {
  const v = p.clone().sub(centre);
  if (quaternion) v.applyQuaternion(quaternion.clone().invert());
  return v;
};
