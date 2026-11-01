import React, {useMemo} from "react";
import {Easing} from "remotion";
import * as THREE from "three";
import {fonts} from "../../fonts";
import {LINE_R, WARM_WHITE} from "../../looks";
import {M, pic, WALL} from "../../../pictures";
import {clamp01, ease, life, seg} from "../../timing";
import {Card, TexPlane} from "../../world/Card";
import {GoldLine, Path, Pen} from "../../world/Line";
import {GatherWord, gatherLayout, toLocal, type GlyphState} from "../../world/GatherWord";
import type {Glyph} from "../../world/Glyphs";
import {LineTrack} from "../../world/track";
import {makeTextTexture, type TextSpec} from "../../world/Type";
import {analyse, penState, Written, type Placement} from "../../world/Written";
import {GOLD, rng, TAN} from "../../world/space";
import {inFront, s1BaseCam, TURN_CENTRE} from "./camera";
import {INK, SENTENCE_DONE, sentenceSpec, T} from "./common";
import {usePenRest1} from "./Opening";

/**
 * C2 inside S1: one thread frees itself, slows on "just…" without stopping,
 * and on "talk?" writes the sentence again — finished this time. Its last stroke draws the
 * composer around it, then three small cards (an idea, a product, a photo),
 * and the pen settles into the composer as its blinking cursor.
 */

// ------------------------------------------------------------------ composer (real tokens, dark mode)

/** Composer px → world. The camera frames it at ~1:1 px. */
export const KC = 0.0092;
export const CW = 1240;
export const CH = 129;
export const COMPOSER = new THREE.Vector3(TURN_CENTRE[0], TURN_CENTRE[1] - 0.55, TURN_CENTRE[2]);

export const drawComposer = (placeholder?: string) => {
  const s = 2.3;
  const ss = 2;
  const c = document.createElement("canvas");
  c.width = CW * ss;
  c.height = CH * ss;
  const g = c.getContext("2d")!;
  g.scale(ss, ss);
  // .composer: radius 26, padding 10/10/10/12, glass graphite oklch(20.9% 0 0 / .94).
  g.fillStyle = "rgb(24,24,24)";
  g.beginPath();
  g.roundRect(0, 0, CW, CH, 26 * s);
  g.fill();
  const btn = 36 * s;
  const cy = CH / 2;
  // "+" button: elevated oklch(34% 0 0), ink oklch(94% 0 0).
  g.fillStyle = "#383838";
  g.beginPath();
  g.arc(12 * s + btn / 2, cy, btn / 2, 0, Math.PI * 2);
  g.fill();
  const icon = (paths: string[], x: number, y: number, size: number, col: string) => {
    g.save();
    g.translate(x - size / 2, y - size / 2);
    g.scale(size / 24, size / 24);
    g.strokeStyle = col;
    g.lineWidth = 2;
    g.lineCap = "round";
    g.lineJoin = "round";
    paths.forEach((d) => g.stroke(new Path2D(d)));
    g.restore();
  };
  icon(["M5 12h14", "M12 5v14"], 12 * s + btn / 2, cy, 20 * s, "#EBEBEB");
  // Send, enabled: brand oklch(90% 0 0) with on-brand oklch(16% 0 0) arrow.
  g.fillStyle = "#DEDEDE";
  g.beginPath();
  g.arc(CW - 10 * s - btn / 2, cy, btn / 2, 0, Math.PI * 2);
  g.fill();
  icon(["m5 12 7-7 7 7", "M12 19V5"], CW - 10 * s - btn / 2, cy, 19 * s, "#0D0D0D");
  if (placeholder) {
    // Textarea placeholder: 15px Albert Sans in stone oklch(75% 0 0).
    g.fillStyle = "#AEAEAE";
    g.font = `400 ${15 * s}px "${fonts.ui}"`;
    g.textBaseline = "middle";
    g.fillText(placeholder, (12 + 36 + 13) * s, cy + 1);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.anisotropy = 8;
  return tex;
};

// The prompt is longer now: a touch smaller so it sits inside the composer.
const S2_SPEC = sentenceSpec(SENTENCE_DONE, 42);
/** Text starts after the + button: 12 + 36 + 12 (×2.3) composer px from the left. */
const TEXT_X = (12 + 36 + 13) * 2.3;
const place2: Placement = {world: new THREE.Vector3(COMPOSER.x - (CW / 2) * KC + TEXT_X * KC, COMPOSER.y, COMPOSER.z + 0.02), k: KC, left: true};

// ------------------------------------------------------------------ cards

const CARD_W = 170 * KC;
const CARD_H = 212 * KC;
const cardTop = COMPOSER.y + (CH / 2) * KC + 0.32;
const CARDS = [0, 1, 2].map((i) => new THREE.Vector3(COMPOSER.x - 4.05 + i * (CARD_W + 0.42), cardTop + CARD_H / 2, COMPOSER.z + 0.02));
const CARD_LABELS = ["IDEA", "PRODUCT", "PHOTO"];

const ideaTexture = () => {
  const W = 340;
  const H = 424;
  const c = document.createElement("canvas");
  c.width = W * 2;
  c.height = H * 2;
  const g = c.getContext("2d")!;
  g.scale(2, 2);
  g.fillStyle = "#121318";
  g.beginPath();
  g.roundRect(0, 0, W, H, 18);
  g.fill();
  g.fillStyle = "#F1C982";
  g.font = `italic 400 40px "${fonts.serif}"`;
  ["“Turn this photo", "into an editorial", "ad, like a", "magazine cover.”"].forEach((l, i) => g.fillText(l, 28, 92 + i * 66));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
};

const monoSpec = (s: string): TextSpec => ({lines: [s], font: `500 "${fonts.mono}"`, size: 15, color: "rgba(243,237,227,0.7)", tracking: 0.16});

// ------------------------------------------------------------------ the line

const rectTrace = (p: Path, c: THREE.Vector3, hw: number, hh: number, r: number, from: "top-mid" | "tl", startX?: number) => {
  const z = c.z;
  const P = (x: number, y: number) => new THREE.Vector3(x, y, z);
  const L = c.x - hw;
  const R = c.x + hw;
  const Tp = c.y + hh;
  const B = c.y - hh;
  if (from === "top-mid") {
    p.lineTo(P(L + r, Tp), 26);
  }
  p.arc(P(L + r, Tp - r), r, Math.PI / 2, Math.PI, 10);
  p.lineTo(P(L, B + r), 26);
  p.arc(P(L + r, B + r), r, Math.PI, Math.PI * 1.5, 10);
  p.lineTo(P(R - r, B), 26);
  p.arc(P(R - r, B + r), r, -Math.PI / 2, 0, 10);
  p.lineTo(P(R, Tp - r), 26);
  p.arc(P(R - r, Tp - r), r, 0, Math.PI / 2, 10);
  p.lineTo(P(from === "top-mid" ? (startX as number) : L + r, Tp), 26);
};

/**
 * The freed thread's pace. It
 * eases out of the knot, cruises, slows on "just…" without ever stopping, and
 * reaches the sentence still moving, so the writing takes over from it.
 */
const FLOW = (() => {
  const N = 600;
  const ss = (a: number, b: number, x: number) => {
    const u = clamp01((x - a) / (b - a));
    return u * u * (3 - 2 * u);
  };
  const t0 = T.free;
  const t1 = T.talk + 0.36;
  const x0 = (T.just - t0) / (t1 - t0);
  const x1 = (T.talk - 0.2 - t0) / (t1 - t0);
  const v = (x: number) => (0.04 + 0.96 * ss(0, 0.16, x)) * (1 - 0.45 * ss(x0 - 0.06, x0 + 0.06, x) * (1 - ss(x1 - 0.06, x1 + 0.06, x)));
  const acc = [0];
  for (let k = 1; k <= N; k++) acc.push(acc[k - 1] + v((k - 0.5) / N));
  const total = acc[N];
  return (x: number) => {
    const f = clamp01(x) * N;
    const k = Math.min(N - 1, Math.floor(f));
    return (acc[k] + (acc[k + 1] - acc[k]) * (f - k)) / total;
  };
})();

export const useTurnTracks = () => {
  const penRest = usePenRest1();
  const w2 = useMemo(() => analyse(S2_SPEC), []);
  const s2Start = penState(w2, place2, 0).pos;
  const s2End = penState(w2, place2, 1).pos;
  return useMemo(() => {
    // 1 · out of the knot and on into the sentence in one stroke: the old resting
    // point is only passed (a swoop into the first letter), never parked on.
    const rest = s2Start.clone().add(new THREE.Vector3(-1.1, 0.35, 0));
    const a = new Path();
    a.pts.push(penRest.clone());
    a.smooth(
      [
        penRest.clone().add(new THREE.Vector3(0.7, 0.45, 0.6)),
        penRest.clone().add(new THREE.Vector3(1.4, -0.5, 1.2)),
        new THREE.Vector3(4.6, -1.0, 1.6),
        new THREE.Vector3(6.6, -1.6, 1.4),
        rest,
        rest.clone().add(new THREE.Vector3(0.6, -0.3, 0)),
        s2Start,
      ],
      24,
    );
    const track1 = new LineTrack([{pts: a.pts, t0: T.free, t1: T.talk + 0.36, ease: FLOW}]);

    // 2 · the period's stroke becomes the composer, then the three cards, then the cursor.
    // Frames stay (thin); the links between them burn out behind the pen.
    const hw = (CW / 2) * KC;
    const hh = (CH / 2) * KC;
    const r = 26 * 2.3 * KC;
    const topY = COMPOSER.y + hh;
    const joinX = s2End.x + 0.5;
    const Z = COMPOSER.z + 0.02;
    const segs: Array<{track: LineTrack; kind: "frame" | "link"; t0: number; t1: number}> = [];
    const add = (pts: THREE.Vector3[], kind: "frame" | "link", t0: number, t1: number) => segs.push({track: new LineTrack([{pts, t0, t1, ease: kind === "link" ? ease.inOut : ease.glide, turnCost: 0.25}]), kind, t0, t1});
    const l0 = new Path();
    l0.pts.push(s2End.clone());
    l0.smooth([s2End.clone().add(new THREE.Vector3(0.28, 0.3, 0)), new THREE.Vector3(joinX, topY, Z)], 40);
    add(l0.pts, "link", T.write2End, T.write2End + 0.22);
    const f0 = new Path();
    f0.pts.push(new THREE.Vector3(joinX, topY, Z));
    rectTrace(f0, COMPOSER.clone().setZ(Z), hw, hh, r, "top-mid", joinX);
    add(f0.pts, "frame", T.write2End + 0.22, T.idea - 0.12);
    let from = new THREE.Vector3(joinX, topY, Z);
    const cardTimes = [T.idea - 0.12, T.product, T.photo, T.photo + 1.05];
    CARDS.forEach((cc, i) => {
      const tl = new THREE.Vector3(cc.x - CARD_W / 2 + 0.14, cc.y + CARD_H / 2, cc.z);
      const lift = i === 0 ? 1.5 : 0.5;
      const link = new Path();
      link.pts.push(from.clone());
      link.smooth([from.clone().lerp(tl, 0.5).add(new THREE.Vector3(0, lift, 0.4)), tl], 26);
      const a0 = cardTimes[i];
      const split = a0 + (cardTimes[i + 1] - a0) * (i === 0 ? 0.32 : 0.22);
      add(link.pts, "link", a0, split);
      const fr = new Path();
      fr.pts.push(tl.clone());
      rectTrace(fr, cc, CARD_W / 2, CARD_H / 2, 0.14, "tl");
      add(fr.pts, "frame", split, cardTimes[i + 1]);
      from = tl.clone();
    });
    // Home: the pen dives into the composer and becomes its cursor.
    const caret = s2End.clone().add(new THREE.Vector3(0.16, 0.02, 0));
    const g = new Path();
    g.pts.push(from.clone());
    g.smooth([from.clone().add(new THREE.Vector3(1.6, 0.9, 0.6)), caret.clone().add(new THREE.Vector3(0.5, 1.0, 0.2)), caret], 26);
    add(g.pts, "link", T.photo + 1.05, T.home);
    const track2 = segs;
    return {track1, track2, caret, rest};
  }, [penRest, s2Start, s2End]);
};

// ------------------------------------------------------------------ the world

// ------------------------------------------------------------------ "talk."

/**
 * The family of one-word moments (world/GatherWord): the letters gather out
 * of depth on "talk?", and as the sentence starts writing itself they pour
 * into the pen that writes it — the talk becomes the ink.
 */
// The letters start gathering at the end of "just…" and are set on "talk?".
const TALK = {gather: T.talk - 0.45, exit: T.talk + 0.6};
const TALK_SPEC: TextSpec = {lines: ["talk."], font: `600 "${fonts.inter}"`, size: 220, color: WARM_WHITE, tracking: -0.045, ss: 2};
const TALK_D = 7.5;
const TALK_DIVE = Easing.bezier(0.38, 0, 0.72, 0.3);
const f2At = (t: number) => clamp01((t - (T.talk + 0.36)) / (T.write2End - (T.talk + 0.36)));

const useTalk = () =>
  useMemo(() => {
    const cam = s1BaseCam(TALK.gather + 0.6);
    const {pos, q} = inFront(cam, TALK_D);
    const frameW = 2 * TALK_D * TAN * (16 / 9);
    // A touch above the frame centre, clear of the sentence being written below.
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    const centre = pos.add(up.multiplyScalar(TALK_D * TAN * 0.24));
    return {layout: gatherLayout("talk.", TALK_SPEC, frameW * 0.42), centre, q};
  }, []);

/** How hard the writing pen glows as the letters arrive (0..1). */
const talkAbsorb = (t: number) => life(t, TALK.exit + 0.25, TALK.exit + 0.75, 0.12, 0.3);

const TalkWord: React.FC<{t: number}> = ({t}) => {
  const {layout, centre, q} = useTalk();
  const w2 = useMemo(() => analyse(S2_SPEC), []);
  if (t < TALK.gather || t > TALK.exit + 0.8) return null;
  const pen = toLocal(penState(w2, place2, f2At(t)).pos, centre, q);
  const exit = (i: number, _g: Glyph, st: GlyphState) => {
    const d0 = TALK.exit + i * 0.035;
    const k = seg(t, d0, d0 + 0.45, TALK_DIVE);
    if (k <= 0) return;
    st.pos.lerp(pen, k);
    st.scale *= 1 - 0.88 * k * k;
    st.heat = Math.max(st.heat, k * 1.2);
    st.opacity *= 1 - seg(t, d0 + 0.3, d0 + 0.45, ease.in);
  };
  return <GatherWord t={t} layout={layout} centre={centre} quaternion={q} t0={TALK.gather} t1={TALK.exit} seed={3} exit={exit} />;
};

const Discover: React.FC<{t: number}> = ({t}) => {
  const cards = useMemo(() => {
    const r = rng(9);
    return WALL.slice(0, 18).map(([f, aspect], i) => ({
      src: pic(f),
      aspect,
      pos: new THREE.Vector3(COMPOSER.x + (r() < 0.5 ? -1 : 1) * (14 + r() * 50), COMPOSER.y + 6 + (r() - 0.5) * 50, COMPOSER.z - 70 - r() * 80),
      delay: (i / 18) * 1.8,
    }));
  }, []);
  if (t < T.discover) return null;
  return (
    <group>
      {cards.map((c, i) => (
        <Card key={i} src={c.src} w={3.6 * c.aspect} h={3.6} position={c.pos} dim={0.24 * seg(t, T.discover + 0.2 + c.delay, T.discover + 1.4 + c.delay, ease.outSoft)} corner={0.08} />
      ))}
    </group>
  );
};

export const Turn: React.FC<{t: number}> = ({t}) => {
  const {track1, track2, caret} = useTurnTracks();
  const composer = useMemo(() => drawComposer(), []);
  const idea = useMemo(ideaTexture, []);
  const w2 = useMemo(() => analyse(S2_SPEC), []);
  if (t < T.free) return null;
  const f2 = clamp01((t - (T.talk + 0.36)) / (T.write2End - (T.talk + 0.36)));
  const p1 = track1.progressAt(t);
  const surface = seg(t, T.idea - 0.35, T.idea + 0.35, ease.outSoft);
  const blink = t >= T.home && Math.floor((t - T.home) / 0.53) % 2 === 0;
  const dive = seg(t, T.dive - 0.1, T.diveEnd, ease.in);
  void w2;
  return (
    <group>
      {/* The freed thread. Its pen slows on "just…", then its trail burns out. */}
      <GoldLine pts={track1.pts} progress={p1} start={seg(t, T.talk + 0.2, T.talk + 1.8, ease.in) * p1} radius={LINE_R} pen={t < T.talk + 0.36 ? 1 : 0} sparks={4} tailLen={9} />
      <TalkWord t={t} />
      {t >= T.talk + 0.36 ? <Written spec={S2_SPEC} place={place2} f={f2} tint={INK} pen={f2 < 1 ? 0.85 * (1 + 0.5 * talkAbsorb(t)) : 0} renderOrder={22} /> : null}
      {/* Composer: traced by the line, then its surface is born inside. */}
      {track2.map((sg, i) =>
        t >= sg.t0 ? (
          <GoldLine
            key={i}
            pts={sg.track.pts}
            progress={sg.track.progressAt(t)}
            radius={sg.kind === "frame" ? LINE_R * 0.42 : LINE_R * 0.7}
            color={GOLD.line.clone().multiplyScalar(sg.kind === "frame" ? 0.62 : 1)}
            pen={t < sg.t1 ? 0.85 : 0}
            sparks={3}
            tailLen={sg.kind === "link" ? 1.6 : 0}
            overrun={sg.track.overrunAt(t)}
            seed={i + 20}
          />
        ) : null,
      )}
      {surface > 0 ? <TexPlane tex={composer} w={CW * KC} h={CH * KC} position={COMPOSER} opacity={surface} renderOrder={5} /> : null}
      {CARDS.map((cc, i) => {
        const born = seg(t, [T.idea, T.product, T.photo][i] + 0.6, [T.idea, T.product, T.photo][i] + 1.1, ease.outSoft);
        if (born <= 0) return null;
        const lab = makeTextTexture(monoSpec(CARD_LABELS[i]));
        return (
          <group key={i}>
            {i === 0 ? (
              <TexPlane tex={idea} w={CARD_W} h={CARD_H} position={cc} corner={0.14} opacity={born} renderOrder={6} />
            ) : (
              <Card src={i === 1 ? M.yourProduct.src : M.yourPhoto.src} w={CARD_W} h={CARD_H} position={cc} corner={0.14} reveal={born} matte={i === 2 ? 1 : 0.35} renderOrder={6} />
            )}
            <TexPlane tex={lab.tex} w={lab.wPx * KC} h={lab.hPx * KC} position={[cc.x - CARD_W / 2 + (lab.wPx / 2 - lab.padPx) * KC, cc.y - CARD_H / 2 - 0.2, cc.z]} opacity={born} />
          </group>
        );
      })}
      {/* The cursor the pen became. */}
      {t >= T.home - 0.1 ? (
        <mesh position={caret} renderOrder={70}>
          <planeGeometry args={[0.032, 0.42]} />
          <meshBasicMaterial color={new THREE.Color(1.6, 1.45, 1.2)} transparent opacity={blink || dive > 0 ? 1 : 0} toneMapped={false} />
        </mesh>
      ) : null}
      {t >= T.home - 0.25 && t < T.home + 0.3 ? <Pen position={caret} size={0.7 * (1 - seg(t, T.home - 0.2, T.home + 0.3, ease.in))} sparks={0} /> : null}
      <Discover t={t} />
      {GOLD ? null : null}
    </group>
  );
};

export const caretOf = () => null;
