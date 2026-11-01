import React, {useMemo} from "react";
import {Easing} from "remotion";
import * as THREE from "three";
import {fonts} from "../fonts";
import {LINE_R, WARM_WHITE} from "../looks";
import {CLIP_SECONDS, M, pic, WALL} from "../../pictures";
import {at as cueAt, clamp01, ease, life, seg} from "../timing";
import {Card, TexPlane} from "../world/Card";
import {GoldLine, haloTexture, Path} from "../world/Line";
import {at, CAM_Z, GOLD, px, rng, TAN} from "../world/space";
import {camAt, float, LineTrack, TimedTrack, type CamKey} from "../world/track";
import {GatherWord, gatherLayout, type GlyphState} from "../world/GatherWord";
import type {Glyph} from "../world/Glyphs";
import {makeButtonTexture, type TextSpec} from "../world/Type";
import {VideoCard} from "../world/Video";
import {O2, S2_COMPOSER} from "./s2";
import type {Scene} from "./types";

/**
 * S3 · Discover (C3). The camera leaves the composer for the dark; far points
 * become cards; the wall of cards plays at every depth (near: big and soft,
 * far: small and sharp). The line leads, leaving a gold halo on what it
 * touches. On "Make it your own." it frames the hero card, the button
 * speaks three languages, and the camera pushes into the card.
 */

export const O3 = new THREE.Vector3(0, 0, -470);
const T = {
  start: 90,
  leave: 90.7,
  inspire: cueAt("c3.1"),
  discover: cueAt("c3.2"),
  own: cueAt("c3.3"),
  mine: cueAt("c3.3") + 0.95,
  tr: cueAt("c3.3") + 2.05,
  es: cueAt("c3.3") + 3.15,
  push: cueAt("c3.3") + 3.9,
  end: 115,
};

// ------------------------------------------------------------------ the wall (relative to O3, camera-at-rest coordinates)

type Spec = {poster: string; video?: string; aspect: number; x: number; y: number; z: number; h: number; rotY?: number; t0?: number};

export const HERO: Spec = {poster: M.hero.poster, video: M.hero.video, aspect: M.hero.aspect, x: 700, y: 495, z: 0, h: 540, t0: 12.2};

/**
 * The hero clip's media time, if the slot has a clip. Its loop seam falls under the pen's wipe at 110.85, so we go inside
 * it from its first frame, and its phase can put the clip's own cuts on our moments.
 */
export const heroMedia = (t: number) => t - 111.17;
/**
 * The clip's loop seam (its last frame → its first, at t = 111.17) on the
 * framed hero just before the push: the line crosses the card and the first
 * shot is wiped in behind the pen (the same wipe as S6's ads). The outgoing shot
 * holds its last frame under the wipe, the incoming one its first.
 */
const CUT = {media: 0, wipe0: 111.12, wipe1: 111.62};
const LAST_OUT = CUT.media - 1 / 60;
const FIRST_IN = CUT.media + 1 / 60;

const HEROES: Spec[] = [
  {poster: M.nearWide.poster, video: M.nearWide.video, aspect: 1.5, x: 40, y: 30, z: 6.6, h: 380, t0: 2},
  {poster: M.poster.poster, aspect: 9 / 16, x: 1870, y: 930, z: 7.6, h: 700},
  {poster: M.editorial.poster, video: M.editorial.video, aspect: 16 / 9, x: 1440, y: 860, z: -4.5, h: 250, rotY: -0.14, t0: 3},
  {poster: M.product.poster, video: M.product.video, aspect: 9 / 16, x: 250, y: 560, z: -6, h: 330, rotY: 0.16, t0: 1},
  {poster: M.street.poster, video: M.street.video, aspect: 1.5, x: 1440, y: 175, z: -11, h: 175, rotY: -0.12, t0: 4},
  {poster: M.nearTall.poster, video: M.nearTall.video, aspect: 9 / 16, x: 1815, y: 235, z: -9, h: 225, rotY: -0.2, t0: 5},
  {poster: M.nearPortrait.poster, video: M.nearPortrait.video, aspect: 2 / 3, x: 1060, y: 150, z: -15, h: 150, rotY: 0.1, t0: 7},
];

const toWorld = (s: Spec) => at(s.x, s.y, s.z).add(O3);
const heightW = (s: Spec) => px(s.h, s.z);

export const HERO_POS = toWorld(HERO);
export const HERO_H = heightW(HERO);
export const HERO_W = HERO_H * HERO.aspect;

/** Cards the camera flies past on the way in, and the far wall behind the heroes. */
const useField = () =>
  useMemo(() => {
    const r = rng(31);
    const corridor: Array<{src: string; aspect: number; pos: THREE.Vector3; h: number; rotY: number}> = [];
    let i = 0;
    while (corridor.length < 26 && i < 4000) {
      i++;
      const [f, aspect] = WALL[corridor.length % WALL.length];
      const z = -408 - r() * 44;
      const x = (r() - 0.5) * 30;
      const y = (r() - 0.5) * 15;
      // Keep a clear tube for the camera (it drifts around x≈0..1.5, y≈0..0.8).
      if (Math.hypot(x - 0.6, y - 0.4) < 2.9) continue;
      if (corridor.some((c) => c.pos.distanceTo(new THREE.Vector3(x, y, z)) < 5.4)) continue;
      corridor.push({src: pic(f), aspect, pos: new THREE.Vector3(x, y, z), h: 2.6 + r() * 1.4, rotY: (r() - 0.5) * 0.7});
    }
    const far: typeof corridor = [];
    i = 0;
    while (far.length < 26 && i < 6000) {
      i++;
      const [f, aspect] = WALL[(far.length + 7) % WALL.length];
      const z = -(20 + Math.pow(r(), 0.85) * 86);
      const spread = (CAM_Z - z) * TAN;
      const pos = new THREE.Vector3((r() * 2 - 1) * spread * 1.9, (r() * 2 - 1) * spread * 1.05, z);
      // Keep clear of the hero, its button and the slam (screen space at rest).
      const sx = (pos.x / (spread * 1.7778) / 2 + 0.5) * 1920;
      const sy = (0.5 - pos.y / spread / 2) * 1080;
      if (sx > 420 && sx < 980 && sy > 140 && sy < 960) continue;
      if (sx > 960 && sx < 1860 && sy > 290 && sy < 650) continue;
      if (far.some((c) => c.pos.distanceTo(pos) < 6)) continue;
      far.push({src: pic(f), aspect, pos: pos.add(O3), h: 3.6 + r() * 1.2, rotY: (r() - 0.5) * 0.5});
    }
    return {corridor, far};
  }, []);

// ------------------------------------------------------------------ camera

/**
 * The flight through the corridor never stops: it cruises at ~5 units/s, then
 * brakes along an exponential (5 → 0.4 u/s, τ = 1.4 s) so it arrives at the
 * wall still drifting in, keeps drifting through "Make it your own" and
 * "mine.", and the push grows out of that drift. (It used to brake into a
 * full stop at 101.9 and hold for 4 s, which read as the film slowing down.)
 */
/**
 * Where the push ends: the whole card in frame, its height ~90% of the frame
 * (it used to end 2.75 away, inside the card, a 2.7× crop of the film).
 */
export const PUSH_D = HERO_H / (0.9 * 2 * TAN);

const DRIFT = {t0: T.discover + 4.5, t1: T.push - 0.2, v0: 4.6, v1: 0.4, tau: 1.4};
const dist = (t: number) => DRIFT.v1 * (t - DRIFT.t0) + (DRIFT.v0 - DRIFT.v1) * DRIFT.tau * (1 - Math.exp(-(t - DRIFT.t0) / DRIFT.tau));
const approachKeys = (): CamKey[] => {
  const endPos = new THREE.Vector3(O3.x + 0.12, O3.y - 0.05, O3.z + CAM_Z - 0.9);
  const endLook = new THREE.Vector3(O3.x - 0.1, O3.y, O3.z);
  const total = dist(DRIFT.t1);
  // Start of the approach: on the straight line back from the end, offset like the old key.
  const startPos = endPos.clone().add(new THREE.Vector3(-1.0, 0.4, total));
  const startLook = new THREE.Vector3(-0.8, 0.3, -470);
  const keys: CamKey[] = [];
  for (const dt of [0, 0.5, 1.0, 1.6, 2.3, 3.1, 4.0, 5.2, 6.6, DRIFT.t1 - DRIFT.t0]) {
    const t = DRIFT.t0 + dt;
    const k = dist(t) / total;
    const pos = startPos.clone().lerp(endPos, k);
    const look = startLook.clone().lerp(endLook, Math.min(1, k * 1.15));
    keys.push({t, pos: [pos.x, pos.y, pos.z], look: [look.x, look.y, look.z]});
  }
  return keys;
};
const APPROACH = approachKeys();
const KEYS: CamKey[] = [
  {t: T.start, pos: [O2.x, O2.y, O2.z + CAM_Z * 0.92], look: [O2.x, O2.y, O2.z]},
  {t: T.leave, pos: [O2.x, O2.y + 0.05, O2.z + CAM_Z * 0.9], look: [O2.x, O2.y + 0.05, O2.z - 1.2]},
  {t: T.inspire, pos: [0.2, 0.9, -396], look: [0.3, 0.6, -430]},
  {t: T.discover, pos: [1.4, 0.6, (-396 + APPROACH[0].pos[2]) / 2 - 1.5], look: [0.6, 0.3, -460]},
  ...APPROACH,
  {t: T.end, pos: [HERO_POS.x, HERO_POS.y, HERO_POS.z + PUSH_D], look: [HERO_POS.x, HERO_POS.y, HERO_POS.z]},
];
export const s3Camera = (t: number) => float(camAt(KEYS, t), t, 0.03 * (1 - seg(t, T.push - 0.6, T.push + 0.4, ease.inOut)));

// ------------------------------------------------------------------ the line

const useLine = () =>
  useMemo(() => {
    // Frame-trace entry, as in the Gate 2 frame: in along the bottom edge from the left.
    const L = HERO.x - (HERO.h * HERO.aspect) / 2 - 4;
    const B = HERO.y + HERO.h / 2 + 4;
    const entry = at(L - 120, B + 6, -0.8).add(O3);
    const lead = new TimedTrack(
      (tau) => {
        const c = s3Camera(tau);
        const p = new THREE.Vector3(...c.position);
        const f = new THREE.Vector3(...c.target).sub(p).normalize();
        const side = new THREE.Vector3(Math.sin(tau * 0.85) * 1.35, Math.cos(tau * 0.62) * 0.55 - 0.15, 0);
        const ahead = p.add(f.multiplyScalar(8.5)).add(side);
        const start = S2_COMPOSER.caret.clone();
        const a = seg(tau, T.leave - 0.2, T.leave + 1.6, ease.inOut);
        const b = seg(tau, T.own - 2.8, T.own, ease.inOut);
        return start.lerp(ahead, a).lerp(entry, b);
      },
      T.leave - 0.2,
      T.own,
    );
    const hc = at(HERO.x, HERO.y, 0.02).add(O3);
    const hw = px((HERO.h * HERO.aspect) / 2 + 4);
    const hh = px(HERO.h / 2 + 4);
    const r = px(12);
    const p = new Path();
    p.pts.push(entry.clone());
    p.smooth([at(L - 40, B + 1, -0.1).add(O3), at(L - 6, B, 0.02).add(O3)], 26);
    p.frameCCW(hc, hw, hh, r);
    const btn = {x: 700, y: 852, w: 0, h: 0};
    return {lead, frame: p.pts, btn, hc};
  }, []);

// ------------------------------------------------------------------ world

const LABELS = [
  {label: "Make it mine", lang: "en" as const, at: T.own},
  {label: "Bana Uyarla", lang: "tr" as const, at: T.tr},
  {label: "Hazlo mío", lang: "es" as const, at: T.es},
];

// ------------------------------------------------------------------ "mine."

/**
 * The family of one-word moments (world/GatherWord): "mine." gathers out of
 * depth beside the hero card, then its letters dive into "Make it mine";
 * the button takes them in, warms, and starts speaking Turkish.
 */
const MINE = {gather: T.mine - 0.12, exit: T.tr - 0.42};
const MINE_SPEC: TextSpec = {lines: ["mine."], font: `600 "${fonts.inter}"`, size: 220, color: WARM_WHITE, tracking: -0.045, ss: 2};
const MINE_Z = -3.2;
const MINE_CENTRE = at(1395, 450, MINE_Z).add(O3);
const BUTTON_AT = at(700, 852, 0).add(O3);
const MINE_DIVE = Easing.bezier(0.38, 0, 0.72, 0.3);
const mineLayout = () => gatherLayout("mine.", MINE_SPEC, px(690, MINE_Z));
/** The button glows as the letters land in it (0..1). */
const mineAbsorb = (t: number) => life(t, MINE.exit + 0.3, MINE.exit + 0.95, 0.12, 0.45);

const MineWord: React.FC<{t: number; fade: number}> = ({t, fade}) => {
  const layout = useMemo(mineLayout, []);
  if (t < MINE.gather || t > MINE.exit + 0.8) return null;
  const target = BUTTON_AT.clone().sub(MINE_CENTRE);
  const exit = (i: number, g: Glyph, st: GlyphState) => {
    st.opacity *= fade;
    const d0 = MINE.exit + i * 0.035;
    const k = seg(t, d0, d0 + 0.45, MINE_DIVE);
    if (k <= 0) return;
    st.pos.lerp(target.clone().add(new THREE.Vector3(g.x * layout.s * 0.18, 0, 0.05)), k);
    st.scale *= 1 - 0.85 * k * k;
    st.heat = Math.max(st.heat, k * 1.2);
    st.opacity *= 1 - seg(t, d0 + 0.3, d0 + 0.45, ease.in);
  };
  return <GatherWord t={t} layout={layout} centre={MINE_CENTRE} t0={MINE.gather} t1={MINE.exit} seed={7} spread={1.6} depth={1.4} exit={exit} />;
};

const World: React.FC<{t: number}> = ({t}) => {
  const {corridor, far} = useField();
  const {lead, frame} = useLine();
  const buttons = useMemo(() => LABELS.map((l) => makeButtonTexture(l.label, fonts.ui, 1.45)), []);
  const leadPts = lead.pts;
  const frameTrack = useMemo(() => new LineTrack([{pts: frame, t0: T.own, t1: T.own + 1.25, ease: ease.inOut, turnCost: 0.2}]), [frame]);
  // The pen crosses the card a little below its middle, leaving off the right.
  const sweep = useMemo(() => {
    const y = HERO_POS.y - HERO_H * 0.08;
    const z = HERO_POS.z + 0.05;
    const p = new Path();
    p.pts.push(new THREE.Vector3(HERO_POS.x - HERO_W / 2 - 0.22, y + 0.02, z));
    p.lineTo(new THREE.Vector3(HERO_POS.x + HERO_W / 2, y, z), 40);
    p.smooth([new THREE.Vector3(HERO_POS.x + HERO_W / 2 + 0.45, y + 0.12, z + 0.25), new THREE.Vector3(HERO_POS.x + HERO_W / 2 + 0.9, y + 0.4, z + 0.6)], 30);
    return new LineTrack([{pts: p.pts, t0: CUT.wipe0, t1: CUT.wipe1, ease: ease.inOut, turnCost: 0}]);
  }, []);

  // Gold halos on the corridor cards the pen passed close to.
  const halos = useMemo(
    () =>
      corridor.map((c) => {
        let d = Infinity;
        for (let i = 0; i < leadPts.length; i += 3) d = Math.min(d, leadPts[i].distanceTo(c.pos));
        return d < 3.2 ? 1 - d / 3.2 : 0;
      }),
    [corridor, leadPts],
  );

  const wallIn = (z: number) => seg(t, T.leave + 0.8 + (Math.abs(z + 408) / 44) * 5.5, T.leave + 2.0 + (Math.abs(z + 408) / 44) * 5.5, ease.outSoft);
  // The lights go down round the film over the whole push (the camera stops
  // with the card in frame now, so the wall must be gone by then, not snap off).
  const lightsDown = seg(t, T.push - 0.3, T.end - 0.1, ease.inOut);
  const others = 1 - lightsDown;

  // The button: speaks three languages.
  const idx = t >= T.es ? 2 : t >= T.tr ? 1 : 0;
  const swap = (k: number) => seg(t, LABELS[k].at - 0.12, LABELS[k].at + 0.25, ease.out);
  const btnBorn = seg(t, T.own + 0.9, T.own + 1.3, ease.outSoft);

  return (
    <group>
      {/* Corridor: far points that become cards as the camera arrives. */}
      {corridor.map((c, i) => {
        // A far point of light first; it unfolds into the card as the camera nears.
        const b = wallIn(c.pos.z);
        const k = 0.04 + 0.96 * b;
        return (
          <group key={`c${i}`}>
            {b < 1 ? (
              <sprite position={c.pos} scale={[0.5 + 0.6 * b, 0.5 + 0.6 * b, 1]} renderOrder={58}>
                <spriteMaterial map={haloTexture()} color={GOLD.halo.clone().multiplyScalar(0.9 * (1 - b) * seg(t, T.leave - 0.6, T.leave + 0.4))} blending={THREE.AdditiveBlending} depthWrite={false} transparent toneMapped={false} />
              </sprite>
            ) : null}
            <Card src={c.src} w={c.h * c.aspect * k} h={c.h * k} position={c.pos} rotation={[0, c.rotY, 0]} corner={c.h * 0.03 * k} dim={0.72} opacity={Math.min(1, b * 1.6) * others} rim={halos[i] * 0.9} rimWidth={0.02} />
          </group>
        );
      })}
      {far.map((c, i) => (
        <Card key={`f${i}`} src={c.src} w={c.h * c.aspect} h={c.h} position={c.pos} rotation={[0, c.rotY, 0]} corner={c.h * 0.02} dim={Math.max(0.09, Math.exp((c.pos.z - O3.z + 2) * 0.036))} opacity={seg(t, T.discover - 3, T.discover + 1, ease.outSoft) * others} />
      ))}
      {HEROES.map((s, i) => {
        const pos = toWorld(s);
        const h = heightW(s);
        const look = {w: h * s.aspect, h, position: pos, rotation: [0, s.rotY ?? 0, 0] as [number, number, number], blur: s.z > 0 ? s.z * 0.02 : 0, corner: px(8, s.z), dim: s.z > 0 ? 0.6 : Math.max(0.09, Math.exp((s.z + 2) * 0.036)), opacity: seg(t, T.discover - 2.5, T.discover + 0.8, ease.outSoft) * others};
        return s.video ? <VideoCard key={`h${i}`} src={s.video} poster={s.poster} time={t - T.discover + (s.t0 ?? 0)} {...look} /> : <Card key={`h${i}`} src={s.poster} {...look} />;
      })}
      {/* The hero: the line frames it, then the camera goes in. */}
      {(() => {
        const look = {w: HERO_W, h: HERO_H, corner: px(8), opacity: seg(t, T.discover - 1.5, T.discover + 1, ease.outSoft), rim: seg(t, T.own + 1.2, T.own + 1.6, ease.outSoft) * 0.6 * (1 - lightsDown), rimWidth: 0.015};
        const media = heroMedia(t);
        // Wipe position: where the pen is across the card (0 left edge, 1 right edge).
        const u = clamp01((sweep.pointAtLength(sweep.lengthAt(t)).x - (HERO_POS.x - HERO_W / 2)) / HERO_W);
        const wiping = t >= CUT.wipe0 && u < 1;
        if (!wiping) return <VideoCard src={HERO.video} poster={HERO.poster} time={t < CUT.wipe0 ? media : Math.max(media, FIRST_IN)} duration={CLIP_SECONDS} position={HERO_POS} {...look} />;
        return (
          <>
            <VideoCard src={HERO.video} poster={HERO.poster} time={Math.min(media, LAST_OUT)} duration={CLIP_SECONDS} position={HERO_POS} {...look} />
            <VideoCard src={HERO.video} poster={HERO.poster} time={Math.max(media, FIRST_IN)} duration={CLIP_SECONDS} position={HERO_POS.clone().add(new THREE.Vector3(0, 0, 0.004))} wipe={u} wipeSoft={0.012} renderOrder={1} {...look} rim={0} />
          </>
        );
      })()}
      {t >= CUT.wipe0 && t < CUT.wipe1 + 0.5 ? <GoldLine pts={sweep.pts} progress={sweep.progressAt(t)} radius={LINE_R} pen={t < CUT.wipe1 ? seg(t, CUT.wipe0, CUT.wipe0 + 0.1, ease.out) : 0} sparks={4} tailLen={1.1} overrun={sweep.overrunAt(t)} /> : null}
      {btnBorn > 0
        ? LABELS.map((l, k) => {
            const vis = k === idx ? swap(k) : k === idx - 1 ? 1 - swap(idx) : 0;
            if (vis <= 0) return null;
            const b = buttons[k];
            return <TexPlane key={k} tex={b.tex} w={px(b.wPx)} h={px(b.hPx)} position={at(700, 852 + (k === idx ? (1 - vis) * 10 : -(1 - vis) * 10), 0).add(O3)} opacity={vis * btnBorn * others} tint={new THREE.Color(1 + 0.32 * mineAbsorb(t), 1 + 0.22 * mineAbsorb(t), 1 + 0.06 * mineAbsorb(t))} renderOrder={8} />;
          })
        : null}
      <MineWord t={t} fade={others} />
      {/* The line: leads the camera in, then frames the card. */}
      {t >= T.leave - 0.2 ? <GoldLine pts={leadPts} progress={lead.progressAt(t)} radius={LINE_R} pen={t < T.own ? 1 : 0} sparks={5} tailLen={6} overrun={Math.max(0, t - T.own) * 8} /> : null}
      {t >= T.own ? <GoldLine pts={frame} progress={frameTrack.progressAt(t)} radius={LINE_R} pen={t < T.own + 1.3 ? 1 : 0} sparks={4} opacity={1 - lightsDown} /> : null}
    </group>
  );
};

/** World group helper: the slam is placed in O3's frame. */
const WorldInFrame: React.FC<{t: number}> = ({t}) => <World t={t} />;

export const S3: Scene = {
  id: "s3",
  from: T.start,
  to: T.end,
  camera: s3Camera,
  World: WorldInFrame,
  dust: 0.7,
};

export const S3_TIMES = T;
export {clamp01 as _c};
