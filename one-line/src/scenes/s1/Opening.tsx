import React, {useMemo} from "react";
import * as THREE from "three";
import {fonts} from "../../fonts";
import {ease, seg} from "../../timing";
import {GoldLine, Path, Pen} from "../../world/Line";
import {at, px, rng} from "../../world/space";
import {measure, TextPlane, type TextSpec} from "../../world/Type";
import {ATTACK, CUT_PREFIX, SENTENCE, T} from "./common";

/**
 * C0: in the dark, a grey text caret beats like a heart. Then someone types
 * their prompt, in grey, the way anyone types into any AI tool, with one
 * change of mind ("an ad" → "an editorial ad"). Gold lines arrive while they type; one
 * loops the caret at "magazine co" and the sentence is left unfinished. The
 * caret stays caught, blinking weakly, through the tangle, and on "What if…"
 * it catches fire and becomes the gold pen (C2), which finishes the sentence.
 */

export const PLACE_1 = {x: 960, y: 520, z: 0};
/** The user's prompt, typed: a monospaced face (the film's HUD mono), in grey. */
const TYPED: TextSpec = {lines: [SENTENCE], font: `400 "${fonts.mono}"`, size: 42, color: "#B7B3AB", tracking: -0.01, ss: 3};
const TYPE0 = 1.6;

/** Keystrokes in a human rhythm, one change of mind, arriving at "magazine co" exactly on the catch. */
export const KEYS = (() => {
  const r = rng(404);
  const ev: Array<{t: number; text: string}> = [];
  let text = "";
  let t = TYPE0;
  const type = (s: string) => {
    for (const ch of s) {
      t += 0.055 + r() * 0.075 + (ch === " " ? 0.04 + r() * 0.09 : 0);
      text += ch;
      ev.push({t, text});
    }
  };
  const pause = (d: number) => {
    t += d;
  };
  const back = (n: number) => {
    for (let i = 0; i < n; i++) {
      t += 0.05;
      text = text.slice(0, -1);
      ev.push({t, text});
    }
  };
  // A vague prompt first, then a change of mind: "an ad" becomes "an editorial ad".
  type("Turn this photo into an ad");
  pause(0.45);
  back(5);
  pause(0.15);
  type("an editorial ad, like a magazine co");
  const k = (T.catch - TYPE0) / (t - TYPE0);
  return ev.map((e) => ({t: TYPE0 + (e.t - TYPE0) * k, text: e.text}));
})();
const typedAt = (t: number) => {
  let s = "";
  for (const e of KEYS) {
    if (e.t <= t) s = e.text;
    else break;
  }
  return s;
};
const lastKey = (t: number) => {
  let k = -1;
  for (const e of KEYS) if (e.t <= t) k = e.t;
  return k;
};
/**
 * The prompt wraps like any prompt box: two lines, left-aligned, the block
 * centred. On one line the caught caret sat outside the knot; on line two it sits inside it.
 */
const LINE1 = "Turn this photo into an editorial ad,";
const LINE_H = 60;
const lineY = (i: number) => PLACE_1.y + (i === 0 ? -LINE_H / 2 : LINE_H / 2);
const linesOf = (text: string): [string, string | null] => (text.length > LINE1.length && text.startsWith(LINE1) ? [LINE1, text.slice(LINE1.length).trimStart()] : [text, null]);
/** Where the typed lines start so the block sits centred. */
const startX = () => PLACE_1.x - measure(TYPED, LINE1) / 2;
const caretAt = (text: string) => {
  const [a, b] = linesOf(text);
  return b === null ? at(startX() + measure(TYPED, a) + 3, lineY(0) - 1, PLACE_1.z) : at(startX() + measure(TYPED, b) + 3, lineY(1) - 1, PLACE_1.z);
};

/** Where the caught caret rests (end of "co"); C2's gold line leaves from here. */
export const usePenRest1 = () => useMemo(() => caretAt(CUT_PREFIX), []);

type Strand = {pts: THREE.Vector3[]; t0: number; t1: number; r: number; tail: number; bright: number};

const makeAttack = (catchPos: THREE.Vector3): Strand[] => {
  const r = rng(77);
  const out: Strand[] = [];
  const N = 40;
  for (let i = 0; i < N; i++) {
    const u = i / N;
    const t0 = 5.95 + 5.6 * Math.pow(u, 0.62);
    const fast = t0 > T.accel ? 0.55 : 1;
    const dur = (1.2 + r() * 0.7) * fast;
    const a = r() * Math.PI * 2;
    const far = 13 + r() * 5;
    const zA = (r() - 0.5) * 9;
    const zB = (r() - 0.5) * 9;
    const start = new THREE.Vector3(Math.cos(a) * far * 1.6, Math.sin(a) * far * 0.9, zA);
    const b = a + Math.PI + (r() - 0.5) * 1.2;
    const end = new THREE.Vector3(Math.cos(b) * far * 1.6, Math.sin(b) * far * 0.9, zB);
    const ctrl: THREE.Vector3[] = [start];
    // Some pass, some curl around the sentence (they "catch" it).
    const curl = r() < 0.45;
    const cx = (r() - 0.5) * 7;
    const cy = (r() - 0.5) * 2.4;
    if (curl) {
      const rad = 0.9 + r() * 1.8;
      const ph = r() * Math.PI * 2;
      for (let k = 0; k < 5; k++) {
        const q = ph + (k / 5) * Math.PI * 2.2;
        ctrl.push(new THREE.Vector3(cx + Math.cos(q) * rad * 1.8, cy + Math.sin(q) * rad * 0.6, (r() - 0.5) * 3));
      }
    } else {
      ctrl.push(new THREE.Vector3(cx, cy, (r() - 0.5) * 4));
    }
    ctrl.push(end);
    const p = new Path();
    p.pts.push(ctrl[0]);
    p.smooth(ctrl.slice(1), 10);
    out.push({pts: p.pts, t0, t1: t0 + dur * (curl ? 1.5 : 1), r: 0.0055 + r() * 0.006, tail: 3 + r() * 4, bright: 0.55 + r() * 0.6});
  }
  // The one that catches the pen: it arrives from the upper right and loops the pen itself.
  const p = new Path();
  p.pts.push(new THREE.Vector3(16, 8, -3));
  p.smooth(
    [
      new THREE.Vector3(7, 2.5, -1),
      catchPos.clone().add(new THREE.Vector3(0.9, 0.35, 0.2)),
      catchPos.clone().add(new THREE.Vector3(0.05, 0.42, 0.1)),
      catchPos.clone().add(new THREE.Vector3(-0.38, 0.0, 0.1)),
      catchPos.clone().add(new THREE.Vector3(0.0, -0.36, 0.1)),
      catchPos.clone().add(new THREE.Vector3(0.45, 0.05, 0.1)),
      new THREE.Vector3(-3, -3.2, 2),
      new THREE.Vector3(-15, -7, 1),
    ],
    12,
  );
  out.push({pts: p.pts, t0: T.catch - 0.55, t1: T.catch + 0.75, r: 0.009, tail: 5, bright: 1.1});
  return out;
};

/** A double beat (lub-dub) every second: the caret waiting, like a heart. */
const heartbeat = (t: number) => {
  const p = (((t - 0.25) % 1.0) + 1.0) % 1.0;
  const bump = (c: number, w: number) => Math.exp(-((p - c) * (p - c)) / (w * w));
  return Math.min(1, bump(0.06, 0.06) + 0.7 * bump(0.27, 0.06));
};

export const Opening: React.FC<{t: number}> = ({t}) => {
  const penRest = usePenRest1();
  const strands = useMemo(() => makeAttack(penRest), [penRest]);
  const text = typedAt(t);
  const away = 1 - seg(t, T.free + 0.8, T.just + 0.9, ease.in);
  const born = seg(t, 0.1, 0.5, ease.outSoft);

  // The caret: a heartbeat while it waits, solid while keys land, then caught: a weak, slow blink.
  const sinceKey = t - lastKey(t);
  let caretA = 0;
  if (t < TYPE0) caretA = 0.15 + 0.85 * heartbeat(t);
  else if (t < T.catch + 0.1) caretA = sinceKey < 0.45 || lastKey(t) < 0 ? 1 : 0.15 + 0.85 * heartbeat(t);
  else caretA = 0.35 + 0.35 * (Math.floor((t - T.catch) / 0.6) % 2 === 0 ? 1 : 0);
  // On "What if…" the caught caret catches fire and becomes the gold pen.
  const ignite = seg(t, T.free - 0.7, T.free - 0.05, ease.in);
  const caretPos = t < T.catch ? caretAt(text) : penRest;
  const caretH = px(56);
  const caretColor = new THREE.Color(0.62, 0.6, 0.57).lerp(new THREE.Color(2.4, 1.5, 0.6), ignite);

  return (
    <group>
      {linesOf(text).map((line, i) => (line ? <TextPlane key={i} spec={{...TYPED, lines: [line]}} x={startX()} y={lineY(i)} z={0} anchor="left" opacity={away} renderOrder={22} /> : null))}
      {t < T.free + 0.1 ? (
        <mesh position={caretPos} renderOrder={70}>
          <planeGeometry args={[px(3), caretH]} />
          <meshBasicMaterial color={caretColor} transparent opacity={born * caretA * (1 - seg(t, T.free - 0.25, T.free + 0.05, ease.in))} toneMapped={false} depthWrite={false} depthTest={ignite <= 0} />
        </mesh>
      ) : null}
      {t > T.free - 0.6 && t < T.free + 0.08 ? <Pen position={penRest} size={0.55 * ignite} breathe={0} sparks={2} intensity={0.6 + 0.4 * ignite} onTop /> : null}
      {strands.map((s, i) =>
        t > s.t0 && t < s.t1 + 2 ? (
          <GoldLine
            key={i}
            pts={s.pts}
            progress={seg(t, s.t0, s.t1, ease.linear)}
            radius={s.r}
            color={ATTACK.clone().multiplyScalar(s.bright)}
            pen={0.35}
            sparks={0}
            tailLen={s.tail}
            start={seg(t, s.t1, s.t1 + 1.2, ease.in)}
            seed={i}
          />
        ) : null,
      )}
    </group>
  );
};
