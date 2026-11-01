import React, {useMemo} from "react";
import * as THREE from "three";
import {fonts} from "../fonts";
import {LINE_R} from "../looks";
import {BEAT, FILM_END, SECTION_AT} from "../script";
import {at as cueAt, clamp01, ease, life, seg} from "../timing";
import {TexPlane} from "../world/Card";
import {GoldLine, haloTexture, Path, Pen} from "../world/Line";
import {CAM_Z, GOLD, rng} from "../world/space";
import type {Cam} from "../world/Stage";
import {camAt, float, glideKeys, LineTrack, type CamKey} from "../world/track";
import {makeTextTexture, type TextSpec} from "../world/Type";
import {analyse, frameOf, penState, Written, type Placement} from "../world/Written";
import {INK, sentenceSpec} from "./s1/common";
import {CH, CW, drawComposer, KC} from "./s1/Turn";
import {S6_TO_S7} from "./s6";
import {S7_REST, S7_SETTLE, STAR} from "./seams";
import type {Scene} from "./types";

/**
 * S7 · the reveal (C7). The threads go out one by one; far away new ones
 * spark and die. Ours stays. "You don't have to." Everything stops. The line
 * draws the composer one last time and writes the slogan in it: "From
 * inspiration to creation." The cursor blinks three times after the full stop,
 * on the beat; then the composer and the slogan quietly go, one beat of
 * nothing, and tekplatform.ai arrives in their place on the piano's
 * resolution chord, small and quiet.
 * The voice never says the name.
 */

// The slogan at the prompt's normal pace (2.85 s), three blinks of the
// cursor (on a beat, off a beat), the composer and slogan fade in one beat, one beat of nothing, and the address
// arrives on the piano's resolution chord (a bar line).
const NAME = SECTION_AT.C7 + 17.5;
const T = {
  start: 215,
  changing: cueAt("c7.1"),
  weekly: cueAt("c7.2"),
  dontHave: cueAt("c7.3"),
  rest: cueAt("c7.3") + 1.2,
  composer: NAME - 8 * BEAT - 2.9 - 1.25,
  write: NAME - 8 * BEAT - 2.9,
  caret: NAME - 8 * BEAT,
  fade: NAME - 2 * BEAT,
  name: NAME,
  end: FILM_END,
};
const WRITE_DUR = T.caret - T.write - 0.05;
const NAME1 = T.name + 1.0;

// ------------------------------------------------------------------ places

const PEN0 = STAR.clone();
const REST = S7_REST;
const COMP = STAR.clone().add(new THREE.Vector3(4.15, 0, 0));
const TEXT_X = (12 + 36 + 13) * 2.3;
const LINE_SPEC = sentenceSpec("From inspiration to creation.", 48);
const place: Placement = {world: new THREE.Vector3(COMP.x - (CW / 2) * KC + TEXT_X * KC, COMP.y, COMP.z + 0.02), k: KC, left: true};

/**
 * The address: mono, spaced, half-lit, as big on screen as the opening prompt.
 */
const URL_SPEC: TextSpec = {lines: ["tekplatform.ai"], font: `400 "${fonts.mono}"`, size: 38, color: "rgba(240,232,218,0.5)", tracking: 0.16};
/** In the composer's place, optically centred: the texture carries the tracking after the last letter too. */
const URL_C = COMP.clone().add(new THREE.Vector3(0.5 * URL_SPEC.tracking! * URL_SPEC.size * KC, 0, 0.02));

/**
 * The cursor after the full stop, from the font's own metrics: just past the last ink, centred on the
 * line (baseline + 0.32 em, so it runs from the descenders to the ascenders).
 */
const CARET_H = 0.42;
const caretAt = () => {
  const w = analyse(LINE_SPEC);
  const tt = makeTextTexture(LINE_SPEC);
  const {centre, k} = frameOf(w, place);
  const em = LINE_SPEC.size;
  const x = centre.x + (w.x1 - tt.wPx / 2 + 0.22 * em) * k;
  const y = centre.y + (tt.hPx / 2 - tt.padPx - tt.ascent + 0.32 * em) * k;
  return new THREE.Vector3(x, y, COMP.z + 0.03);
};

// ------------------------------------------------------------------ camera

const camera = (t: number): Cam => float(camAt(keys(), t), t, 0.012);

const KEY_CACHE: {k?: CamKey[]} = {};
const keys = () => {
  if (KEY_CACHE.k) return KEY_CACHE.k;
  KEY_CACHE.k = [
    // The clip → constellation → sparks → the pen → rest: one move, shared with S6.
    ...S6_TO_S7.filter((k) => k.t >= T.start - 0.4),
    // Rest → the composer as the line draws it (was 1.35 s for ~6 units: 10 units/s² on and off).
    ...glideKeys(
      [
        {pos: new THREE.Vector3(...(S7_SETTLE.pos as [number, number, number])), look: new THREE.Vector3(...(S7_SETTLE.look as [number, number, number]))},
        {pos: new THREE.Vector3(COMP.x, COMP.y + 0.1, COMP.z + CAM_Z * 0.92), look: new THREE.Vector3(COMP.x, COMP.y + 0.1, COMP.z)},
      ],
      [
        {at: 0, t: S7_SETTLE.t + 0.05, v: 0},
        {at: 1, t: T.write + 0.9, v: 0.06},
      ],
    ),
    {t: T.caret, pos: [COMP.x + 0.15, COMP.y + 0.1, COMP.z + CAM_Z * 0.9], look: [COMP.x + 0.1, COMP.y + 0.08, COMP.z]},
    // No cut and no fly-through: a slow, unbroken push from the prompt down to the composer and the name.
    {t: T.name, pos: [COMP.x + 0.06, COMP.y + 0.06, COMP.z + CAM_Z * 0.86], look: [COMP.x + 0.03, COMP.y + 0.04, COMP.z]},
    {t: T.end + 1, pos: [COMP.x, COMP.y, COMP.z + CAM_Z * 0.8], look: [COMP.x, COMP.y, COMP.z]},
  ];
  return KEY_CACHE.k;
};

// ------------------------------------------------------------------ world

const sparkTimes = () => {
  const r = rng(707);
  return new Array(34).fill(0).map(() => ({
    // New models spark far away until the threads are called home.
    at: T.changing + 0.2 + r() * 2.7,
    pos: STAR.clone().add(new THREE.Vector3(14 + r() * 70, (r() - 0.5) * 30, -8 - r() * 60)),
    size: 0.6 + r() * 1.2,
  }));
};

/** The pen flares as the last threads come home on "You". */
const home = (t: number) => 1 + 0.55 * life(t, T.dontHave - 0.2, T.dontHave + 0.55, 0.15, 0.45);

const World: React.FC<{t: number}> = ({t}) => {
  const composer = useMemo(() => drawComposer(), []);
  const sparks = useMemo(sparkTimes, []);
  const caret = useMemo(caretAt, []);
  const url = useMemo(() => makeTextTexture(URL_SPEC), []);

  // Our line: calm; one short stroke to rest, then the composer, then home to the cursor.
  const calm = useMemo(() => {
    const p = new Path();
    p.pts.push(PEN0.clone());
    p.smooth([PEN0.clone().add(new THREE.Vector3(0.7, 0.12, 0)), REST], 40);
    return new LineTrack([{pts: p.pts, t0: T.dontHave + 0.1, t1: T.rest, ease: ease.inOut}]);
  }, []);
  const frame = useMemo(() => {
    const hw = (CW / 2) * KC;
    const hh = (CH / 2) * KC;
    const r = 26 * 2.3 * KC;
    const z = COMP.z + 0.02;
    const P = (x: number, y: number) => new THREE.Vector3(x, y, z);
    const L = COMP.x - hw;
    const R = COMP.x + hw;
    const Tp = COMP.y + hh;
    const B = COMP.y - hh;
    const p = new Path();
    p.pts.push(REST.clone());
    p.smooth([REST.clone().add(new THREE.Vector3(0.2, 0.35, 0)), P(REST.x + 0.6, Tp)], 40);
    const leadPts = p.pts.length;
    p.lineTo(P(R - r, Tp), 30);
    p.arc(P(R - r, Tp - r), r, Math.PI / 2, 0, 10);
    p.lineTo(P(R, B + r), 30);
    p.arc(P(R - r, B + r), r, 0, -Math.PI / 2, 10);
    p.lineTo(P(L + r, B), 30);
    p.arc(P(L + r, B + r), r, -Math.PI / 2, -Math.PI, 10);
    p.lineTo(P(L, Tp - r), 30);
    p.arc(P(L + r, Tp - r), r, Math.PI, Math.PI / 2, 10);
    p.lineTo(P(REST.x + 0.6, Tp), 30);
    const start = penState(analyse(LINE_SPEC), place, 0).pos;
    const link = new Path();
    link.pts.push(P(REST.x + 0.6, Tp));
    link.smooth([P(start.x - 0.3, Tp - 0.25), start], 40);
    const split = T.composer + (T.write - T.composer) * 0.86;
    // How much of the outline is the lead-in from the pen's rest to the composer's edge (it retracts once
    // the slogan is written).
    const dist = (a: number, b: number) => p.pts.slice(a, b).reduce((sum, q, i, arr) => (i ? sum + q.distanceTo(arr[i - 1]) : 0), 0);
    const lead = dist(0, leadPts) / dist(0, p.pts.length);
    return {
      lead,
      frame: new LineTrack([{pts: p.pts, t0: T.composer, t1: split, ease: ease.inOut, turnCost: 0.3}]),
      link: new LineTrack([{pts: link.pts, t0: split, t1: T.write, ease: ease.inOut}]),
    };
  }, []);

  const f = clamp01((t - T.write) / WRITE_DUR);
  const compIn = seg(t, T.composer + 0.6, T.composer + 1.2, ease.outSoft);
  // Three blinks of the cursor on the beat (on one beat, off the next).
  const caretOn = t >= T.caret && t < T.fade && Math.floor((t - T.caret) / BEAT + 1e-6) % 2 === 0;
  // The composer and the slogan go together, in one beat; the address arrives a beat later.
  const boxOut = seg(t, T.fade, T.fade + BEAT, ease.inOut);
  const nameIn = seg(t, T.name, NAME1, ease.outSoft);
  // While the slogan holds, the outline cools to just above the bloom threshold: at full heat its thin top
  // edge shimmered in the wide bloom mips as the camera tilted (a glow breathing every ~1.2 s).

  return (
    <group>
      {/* Far away, new threads spark and die: the models keep changing. */}
      {sparks.map((s, i) => {
        const k = life(t, s.at, s.at + 0.7, 0.08, 0.5);
        if (k <= 0) return null;
        return (
          <sprite key={i} position={s.pos} scale={[s.size * (0.6 + 0.4 * k), s.size * (0.6 + 0.4 * k), 1]} renderOrder={60}>
            <spriteMaterial map={haloTexture()} color={GOLD.core.clone().multiplyScalar(0.25 * k)} blending={THREE.AdditiveBlending} depthWrite={false} transparent toneMapped={false} />
          </sprite>
        );
      })}
      {/* Ours: calm. */}
      {t < T.dontHave + 0.1 ? <Pen position={PEN0} size={0.9 * home(t)} breathe={1} sparks={2} /> : null}
      {t >= T.dontHave + 0.1 && t < T.composer + 2 ? (
        <GoldLine pts={calm.pts} progress={calm.progressAt(t)} start={seg(t, T.composer, T.composer + 1.5, ease.in)} radius={LINE_R} pen={t < T.composer ? home(t) : 0} breathe={t > T.rest ? 1 : 0} sparks={2} />
      ) : null}
      {/* The composer, one last time. */}
      {t >= T.composer && boxOut < 1 ? (
        <>
          <GoldLine pts={frame.frame.pts} progress={frame.frame.progressAt(t)} radius={LINE_R * 0.5} color={GOLD.line.clone().multiplyScalar(0.62 - 0.2 * seg(t, T.write + 1.5, T.caret + 0.5, ease.inOut))} pen={t < frame.frame.end ? 0.9 : 0} sparks={3} start={frame.lead * seg(t, T.write + 0.3, T.write + 1.5, ease.inOut)} overrun={Math.max(0, t - frame.frame.end) * 3} opacity={1 - boxOut} />
          {t >= frame.frame.end ? <GoldLine pts={frame.link.pts} progress={frame.link.progressAt(t)} radius={LINE_R * 0.6} pen={t < T.write ? 0.9 : 0} sparks={2} tailLen={0.7} overrun={frame.link.overrunAt(t, 3)} opacity={1 - seg(t, T.write + 0.3, T.write + 1.5, ease.inOut)} /> : null}
        </>
      ) : null}
      {compIn > 0 && boxOut < 1 ? <TexPlane tex={composer} w={CW * KC} h={CH * KC} position={COMP} opacity={compIn * (1 - boxOut)} renderOrder={5} /> : null}
      {t >= T.write && boxOut < 1 ? <Written spec={LINE_SPEC} place={place} f={f} tint={INK} pen={f < 1 ? 0.85 : 0} opacity={1 - boxOut} renderOrder={22} /> : null}
      {caretOn ? (
        <mesh position={caret} renderOrder={70}>
          <planeGeometry args={[0.032, CARET_H]} />
          <meshBasicMaterial color={new THREE.Color(1.6, 1.45, 1.2)} toneMapped={false} />
        </mesh>
      ) : null}
      {/* tekplatform.ai, small and quiet in the composer's place. */}
      {nameIn > 0 ? <TexPlane tex={url.tex} w={url.wPx * KC} h={url.hPx * KC} position={URL_C.clone().add(new THREE.Vector3(0, -0.06 * (1 - nameIn), 0))} opacity={nameIn} renderOrder={22} /> : null}
    </group>
  );
};

export const S7: Scene = {
  id: "s7",
  from: T.start,
  to: T.end + 1,
  camera,
  World,
  dust: 0.35,
};

export const S7_TIMES = T;
