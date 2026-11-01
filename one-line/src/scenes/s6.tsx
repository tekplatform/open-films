import React, {useMemo} from "react";
import * as THREE from "three";
import {Easing} from "remotion";
import {fonts} from "../fonts";
import {LINE_R, WARM_WHITE} from "../looks";
import {AD, AD_LIVE, FITTING, M, ONE_PHOTO, pic, WALL, WARDROBE} from "../../pictures";
import {at as cueAt, clamp01, ease, end as cueEnd, lerp, seg} from "../timing";
import {Card} from "../world/Card";
import {GoldLine, Path, Pen} from "../world/Line";
import {GOLD, rng} from "../world/space";
import {blade, LightBlade, RETRACT, wipeAt} from "../world/LightBlade";
import {GatherWord, gatherLayout, type GlyphState} from "../world/GatherWord";
import type {Glyph} from "../world/Glyphs";
import {Strands, type StrandDef} from "../world/Strands";
import {camAt, float, glideKeys, LineTrack, type CamKey} from "../world/track";
import {type TextSpec} from "../world/Type";
import {VideoCard} from "../world/Video";
import {s5Camera, S5_KEYS} from "./s5";
import {BREATH, SECTION_AT} from "../script";
import {O6, S6_FIRST, S7_FIRST, S7_HOME, S7_SETTLE, STAR} from "./seams";
import {Wardrobe, WD_LOOK} from "./s6wardrobe";
import type {Scene} from "./types";

/**
 * S6 · one conversation (C6), without a single cut, always moving on to the
 * right and deeper. One photo opens into four films at four depths; a
 * screenshot's dress is cut out and carried onto a person, its other pieces go
 * to the wardrobe and are tried on; two editorials sweep past the lens; an ad
 * you admire is wiped into yours by the line, and a poster into another
 * language, which then comes alive as a clip and plays out.
 * Everything gathers into one constellation and, on
 * "Endless", the line bursts into hundreds of threads that each find a film.
 */

export {O6};
const T = {
  start: 165,
  photo: cueAt("c6.1"),
  open: cueAt("c6.1") + 1.35,
  fashion: cueAt("c6.2"),
  ad: cueAt("c6.3"),
  lang: cueAt("c6.3b"),
  screenshot: cueAt("c6.4"),
  idea: cueAt("c6.5"),
  convo: cueAt("c6.6"),
  endless: cueAt("c6.7"),
  end: SECTION_AT.C7,
};

const ONE_PHOTO_TO = [new THREE.Vector3(-5.4, 1.7, -3), new THREE.Vector3(4.9, 2.1, -6), new THREE.Vector3(-3.8, -2.5, -9), new THREE.Vector3(5.4, -2.2, -13)];
const ONE_PHOTO_CLIPS = ONE_PHOTO.clips.map((c, k) => ({...c, to: ONE_PHOTO_TO[k]}));
const FILM_ASPECT = ONE_PHOTO.clips[0].aspect;

const PHOTO = O6.clone().add(new THREE.Vector3(-0.2, 0.1, 0));
const PHOTO_H = 2.2;
const PHOTO_W = PHOTO_H * ONE_PHOTO.aspect;

const POSTER = O6.clone().add(new THREE.Vector3(37, 0.2, -34));
const POSTER_H = 4.7;
const POSTER_W = POSTER_H * AD.aspect;

// The two ads stand in a row, left to right: a lateral truck, and no card blocks the next.
const HK = POSTER.clone().add(new THREE.Vector3(7.8, 0.15, -2));
const HK_H = 4.4;
const HK_W = (HK_H * 16) / 9;
/**
 * No stretched posters: both show in portrait, through a centred window on the 16:9 card; on "And brought to life." the
 * window opens out like a cinema screen as the clip starts.
 */
const HK_WIN0 = 0.42;
const smoother5 = (a: number, b: number, x: number) => {
  const u = clamp01((x - a) / (b - a));
  return u * u * u * (u * (u * 6 - 15) + 10);
};
/**
 * The wipes: the pen reaches a card's top-left corner and strikes a blade of
 * light down its full height; the blade sweeps across (the new image behind
 * it, warm where it has just passed), then is drawn back up into the pen.
 */
const A_W = {strike: cueAt("c6.3") + 0.62, sweep0: cueAt("c6.3") + 0.74, sweep1: cueAt("c6.3") + 1.89};
const H_W = {strike: cueAt("c6.3b") + 0.6, sweep0: cueAt("c6.3b") + 0.72, sweep1: cueAt("c6.3b") + 1.67};
/** The clip then plays to its end, nearly full frame, and holds a breath before the camera pulls away to the constellation. */
export const HK_AD = {start: H_W.sweep1, end: H_W.sweep1 + 15.05};
const HK_LEAVE = HK_AD.end - 0.9 + BREATH;
const HK_OPEN = {t0: H_W.sweep1, t1: H_W.sweep1 + 0.9};
const hkWindow = (t: number) => HK_WIN0 + (1 - HK_WIN0) * smoother5(HK_OPEN.t0, HK_OPEN.t1, t);

const FITTING_AT = O6.clone().add(new THREE.Vector3(14, 0.1, -14));
/** The two editorials sweep past the lens on the way from the wardrobe to the ads. It slides in from the side, stays in frame while it plays, and fades as it leaves, since it sits on the camera's way to the ads. */
const EDITORIAL_AT = O6.clone().add(new THREE.Vector3(34.5, 0.4, -21.6));
const editorialTime = (t: number) => t - cueAt("c6.2") + 4.09;
const CITY_AT = O6.clone().add(new THREE.Vector3(44, -0.8, -18.5));
/**
 * This card is behind the camera when everything gathers, and its way to the constellation runs straight through the lens.
 * It swings out to the right instead and sweeps in from the edge of the frame.
 */
const CITY_DETOUR = new THREE.Vector3(10, 0.6, 0);
/** Out of the wardrobe: pull back to its right first (never past your photo), then turn to the ads. */
const BRIDGE = O6.clone().add(new THREE.Vector3(39.5, 0.4, -14));
const KH = 4.4;
/** Fitting room: the person is "your photo", the same one the wardrobe dresses. Every card is 2:3. */
const KW = KH * (1024 / 1536);
const SHOT = FITTING_AT.clone().add(new THREE.Vector3(-2.7, 0, 0));
const PERSON = FITTING_AT.clone().add(new THREE.Vector3(2.7, 0, 0));

/** The constellation everything gathers into. */


// ------------------------------------------------------------------ camera

/**
 * Wardrobe → bridge → the first ad as one move (two spline segments dip in
 * speed at the key, so it is one curve through the three points, driven by a speed profile: soft ramp up,
 * a cruise, soft ramp down onto the poster). The gaze turns to the poster by
 * the time the camera reaches the bridge.
 */
function toAds(): CamKey[] {
  const t0 = T.fashion;
  const t1 = T.ad + 0.6;
  const wd = new THREE.Vector3(WD_LOOK.x + 0.2, WD_LOOK.y + 0.05, WD_LOOK.z + 11.6);
  const poster = new THREE.Vector3(POSTER.x, POSTER.y, POSTER.z + 8.6);
  const curve = new THREE.CatmullRomCurve3([wd, BRIDGE.clone(), poster], false, "centripetal");
  curve.arcLengthDivisions = 3000;
  const lengths = curve.getLengths();
  const L = lengths[lengths.length - 1];
  const sBridge = lengths[Math.round(lengths.length / 2)];
  const up = 1.3;
  const down = 1.5;
  const smoother = (x: number) => {
    const u = clamp01(x);
    return u * u * u * (u * (u * 6 - 15) + 10);
  };
  // Speed: smootherstep ramps (average half the cruise) around a constant cruise.
  const vmax = L / (t1 - t0 - 0.5 * (up + down));
  const speed = (t: number) => vmax * Math.min(smoother((t - t0) / up), smoother((t1 - t) / down));
  const out: CamKey[] = [];
  let s = 0;
  const h = 1 / 240;
  let t = t0;
  for (let k = 0; ; k++) {
    const tk = Math.min(t1, t0 + k * 0.1);
    while (t < tk - 1e-9) {
      const dt = Math.min(h, tk - t);
      s += speed(t + dt / 2) * dt;
      t += dt;
    }
    const p = curve.getPointAt(Math.min(1, s / L));
    const look = WD_LOOK.clone().lerp(POSTER, smoother(s / sBridge));
    out.push({t: tk, pos: [p.x, p.y, p.z], look: [look.x, look.y, look.z]});
    if (tk >= t1) break;
  }
  // Land exactly on the poster key.
  out[out.length - 1] = {t: t1, pos: [poster.x, poster.y, poster.z], look: [POSTER.x, POSTER.y, POSTER.z]};
  return out;
}

/**
 * The clip → the constellation → the far sparks → the pen ("You don't have to.") → rest, as one
 * move. The camera eases off the ad, glides through the constellation on "Endless", passes the
 * sparks and slows into the pen (`glideKeys`).
 */
function toStar(): CamKey[] {
  const V = (k: CamKey) => ({pos: new THREE.Vector3(...(k.pos as [number, number, number])), look: new THREE.Vector3(...(k.look as [number, number, number]))});
  return glideKeys(
    [
      {pos: new THREE.Vector3(HK.x + 0.15, HK.y + 0.03, HK.z + 6.2), look: new THREE.Vector3(HK.x + 0.1, HK.y, HK.z)},
      {pos: STAR.clone().add(new THREE.Vector3(-1, 1.2, 24)), look: STAR.clone()},
      V(S7_FIRST),
      V(S7_HOME),
      V(S7_SETTLE),
    ],
    [
      {at: 0, t: HK_LEAVE, v: 0.05},
      {at: 1, t: T.endless + 0.2, v: 2.4},
      {at: 3, t: S7_HOME.t, v: 1.45},
      {at: 4, t: S7_SETTLE.t, v: 0},
    ],
  );
}

/** The end of S6's camera and the start of S7's: one move (see `toStar`). */
export const S6_TO_S7 = toStar();

export const S6_KEYS: CamKey[] = [
  {t: T.start, ...(() => {
    const c = s5Camera(T.start);
    return {pos: c.position, look: c.target};
  })()},
  S6_FIRST,
  {t: T.open + 0.4, pos: [O6.x + 0.2, O6.y + 0.2, O6.z + 11.0], look: [O6.x, O6.y, O6.z - 2]},
  // The four films hold for the end of the line, then on to the fitting room.
  {t: T.open + 0.85, pos: [O6.x + 0.45, O6.y + 0.25, O6.z + 11.4], look: [O6.x + 0.2, O6.y, O6.z - 2]},
  {t: T.screenshot + 1.1, pos: [FITTING_AT.x, FITTING_AT.y, FITTING_AT.z + 10.4], look: [FITTING_AT.x, FITTING_AT.y, FITTING_AT.z]},
  // Hold while the dress is worn, then follow the pieces right to the wardrobe and stay there.
  {t: T.screenshot + 3.6, pos: [FITTING_AT.x + 0.35, FITTING_AT.y, FITTING_AT.z + 10.2], look: [FITTING_AT.x, FITTING_AT.y, FITTING_AT.z]},
  {t: T.screenshot + 6.3, pos: [WD_LOOK.x - 0.2, WD_LOOK.y, WD_LOOK.z + 12.0], look: [WD_LOOK.x, WD_LOOK.y, WD_LOOK.z]},
  // On between the two editorials to the ads: one move, no dip at the bridge (dense keys, see `toAds`).
  ...toAds(),
  {t: T.lang - 0.6, pos: [POSTER.x + 0.35, POSTER.y, POSTER.z + 8.3], look: [POSTER.x, POSTER.y, POSTER.z]},
  // A lateral truck to the clip on "In your language.", then in until the film nearly fills the
  // frame (the whole card in view), a slow drift while it plays to its end, and on to the constellation.
  {t: T.lang + 0.8, pos: [HK.x - 0.3, HK.y, HK.z + 9.6], look: [HK.x - 0.2, HK.y, HK.z]},
  {t: HK_AD.start + 2.4, pos: [HK.x, HK.y, HK.z + 6.6], look: [HK.x, HK.y, HK.z]},
  {t: HK_LEAVE, pos: [HK.x + 0.15, HK.y + 0.03, HK.z + 6.2], look: [HK.x + 0.1, HK.y, HK.z]},
  ...S6_TO_S7,
];
const KEYS: CamKey[] = [S5_KEYS[S5_KEYS.length - 2], ...S6_KEYS];
export const s6Camera = (t: number) => float(camAt(KEYS, t), t, 0.03);


// ------------------------------------------------------------------ the line

const rect = (p: Path, c: THREE.Vector3, hw: number, hh: number, r: number) => {
  const z = c.z;
  const P = (x: number, y: number) => new THREE.Vector3(x, y, z);
  p.lineTo(P(c.x + hw - r, c.y + hh), 30);
  p.arc(P(c.x + hw - r, c.y + hh - r), r, Math.PI / 2, 0, 8);
  p.lineTo(P(c.x + hw, c.y - hh + r), 30);
  p.arc(P(c.x + hw - r, c.y - hh + r), r, 0, -Math.PI / 2, 8);
  p.lineTo(P(c.x - hw + r, c.y - hh), 30);
  p.arc(P(c.x - hw + r, c.y - hh + r), r, -Math.PI / 2, -Math.PI, 8);
  p.lineTo(P(c.x - hw, c.y + hh - r), 30);
  p.arc(P(c.x - hw + r, c.y + hh - r), r, Math.PI, Math.PI / 2, 8);
};

const useTracks = () =>
  useMemo(() => {
    // 1 · draw the photo's frame.
    const a = new Path();
    const start = O6.clone().add(new THREE.Vector3(-8.5, 1.4, 0.6));
    a.pts.push(start);
    const tl = PHOTO.clone().add(new THREE.Vector3(-PHOTO_W / 2 + 0.08, PHOTO_H / 2 + 0.02, 0.02));
    a.smooth([start.clone().lerp(tl, 0.55).add(new THREE.Vector3(0, 0.55, 0.2)), tl.clone().add(new THREE.Vector3(-0.6, 0.12, 0.05)), tl], 20);
    rect(a, PHOTO.clone().setZ(PHOTO.z + 0.02), PHOTO_W / 2 + 0.02, PHOTO_H / 2 + 0.02, 0.08);
    const frame = new LineTrack([{pts: a.pts, t0: T.start + 0.3, t1: T.photo + 0.15, ease: ease.inOut, turnCost: 0.15}]);
    // 2 · the first ad: to the top-left corner, then along the top edge riding the blade.
    const pz = POSTER.z + 0.05;
    const aTL = new THREE.Vector3(POSTER.x - POSTER_W / 2, POSTER.y + POSTER_H / 2 + 0.18, pz);
    const aTR = new THREE.Vector3(POSTER.x + POSTER_W / 2, POSTER.y + POSTER_H / 2 + 0.18, pz);
    const b = new Path();
    b.pts.push(new THREE.Vector3(POSTER.x - POSTER_W / 2 - 1.8, POSTER.y + POSTER_H / 2 + 1.1, pz + 0.5));
    b.smooth([aTL.clone().add(new THREE.Vector3(-0.45, 0.12, 0.1)), aTL], 20);
    const bi = b.pts.length - 1;
    b.lineTo(aTR, 30);
    const wipe = new LineTrack([
      {pts: b.pts.slice(0, bi + 1), t0: T.ad + 0.25, t1: A_W.strike, ease: ease.inOut},
      {pts: b.pts.slice(bi), t0: A_W.sweep0, t1: A_W.sweep1, ease: ease.inOut, turnCost: 0},
    ]);
    // 2b · on to the clip, across it the same way, then away.
    const hz = HK.z + 0.05;
    // The blade crosses the portrait window, not the whole 16:9 card.
    const hTL = new THREE.Vector3(HK.x - (HK_W * HK_WIN0) / 2, HK.y + HK_H / 2 + 0.18, hz);
    const hTR = new THREE.Vector3(HK.x + (HK_W * HK_WIN0) / 2, HK.y + HK_H / 2 + 0.18, hz);
    const h = new Path();
    h.pts.push(aTR.clone());
    h.smooth([aTR.clone().lerp(hTL, 0.5).add(new THREE.Vector3(0, 0.8, 1.2)), hTL.clone().add(new THREE.Vector3(-0.5, 0.1, 0.1)), hTL], 20);
    const hi = h.pts.length - 1;
    h.lineTo(hTR, 30);
    const hj = h.pts.length - 1;
    h.smooth([hTR.clone().add(new THREE.Vector3(0.6, 0.3, 0.4)), hTR.clone().add(new THREE.Vector3(1.3, 0.9, 1.0))], 20);
    const lang = new LineTrack([
      {pts: h.pts.slice(0, hi + 1), t0: A_W.sweep1 + 0.1, t1: H_W.strike, ease: ease.inOut},
      {pts: h.pts.slice(hi, hj + 1), t0: H_W.sweep0, t1: H_W.sweep1, ease: ease.inOut, turnCost: 0},
      {pts: h.pts.slice(hj), t0: H_W.sweep1 + RETRACT, t1: H_W.sweep1 + RETRACT + 0.45, ease: ease.out},
    ]);
    const wipeT0 = A_W.sweep0;
    // 3 · lasso the dress on the screenshot.
    const c = new Path();
    const dz = SHOT.z + 0.05;
    const lasso = (k: number) => {
      const q = k * Math.PI * 2.15 + 1.4;
      return new THREE.Vector3(SHOT.x + Math.cos(q) * 0.72 - 0.01, SHOT.y + 0.15 + Math.sin(q) * 1.2, dz);
    };
    c.pts.push(SHOT.clone().add(new THREE.Vector3(-2.2, 2.6, 0.6)));
    c.smooth([lasso(0)], 20);
    for (let i = 1; i <= 60; i++) c.pts.push(lasso(i / 60));
    const cut = new LineTrack([{pts: c.pts, t0: T.screenshot + 0.1, t1: T.screenshot + 1.6, ease: ease.inOut, turnCost: 0.05}]);
    return {frame, wipe, wipeT0, lang, cut};
  }, []);


// ------------------------------------------------------------------ the burst

/**
 * On "You don't have to." every thread is pulled back into the one point it
 * came from: the far ends run home, accelerating, and each film lets go as its
 * thread leaves it. The last ones land on "You".
 */
export const RETRACT0 = cueAt("c7.3") - 0.95;
const RETRACT_DUR = 0.6;

const useBurst = () =>
  useMemo(() => {
    const r = rng(2026);
    const rr = rng(99);
    const defs: StrandDef[] = [];
    const targets: Array<{pos: THREE.Vector3; at: number; src: string; aspect: number; retract: number}> = [];
    for (let i = 0; i < 280; i++) {
      const end = new THREE.Vector3(STAR.x + 16 + r() * 80, STAR.y + (r() - 0.5) * 34, STAR.z - 6 - r() * 70);
      const c1 = STAR.clone().add(new THREE.Vector3(2 + r() * 6, (r() - 0.5) * 8, (r() - 0.5) * 8));
      const c2 = end.clone().add(new THREE.Vector3(-8 - r() * 10, (r() - 0.5) * 6, 4 + r() * 6));
      const curve = new THREE.CubicBezierCurve3(STAR.clone(), c1, c2, end);
      const delay = T.endless + 0.05 + r() * 0.55;
      const dur = 0.9 + r() * 1.1;
      const retract = RETRACT0 + rr() * 0.35;
      defs.push({pts: curve.getPoints(40), delay, dur, bright: 0.35 + r() * 0.65, retract});
      if (i % 5 === 0) {
        const [f, aspect] = WALL[(i / 5) % WALL.length];
        targets.push({pos: end, at: delay + dur, src: pic(f), aspect, retract});
      }
    }
    return {defs, targets};
  }, []);

// ------------------------------------------------------------------ "Fitting Room"

/**
 * The name of the screenshot → wearing step, set above the two cards in the film's serif italic with the
 * one-word family's gather; when everything gathers into the constellation its
 * letters go there too.
 */
const ROOM_SPEC: TextSpec = {lines: ["Fitting Room"], font: `italic 400 "${fonts.serif}"`, size: 220, color: WARM_WHITE, tracking: 0, ss: 2};
const ROOM_AT = FITTING_AT.clone().add(new THREE.Vector3(0, KH / 2 + 0.78, 0.35));
const ROOM_DIVE = Easing.bezier(0.38, 0, 0.72, 0.3);

const FittingRoom: React.FC<{t: number}> = ({t}) => {
  const layout = useMemo(() => gatherLayout("Fitting Room", ROOM_SPEC, 3.9), []);
  const t0 = T.screenshot + 0.2;
  // It leaves as the camera leaves: its letters go into the person now wearing the dress.
  const t1 = T.screenshot + 3.0;
  if (t < t0 || t > t1 + 1.2) return null;
  const home = PERSON.clone().add(new THREE.Vector3(0, 0.4, 0.2)).sub(ROOM_AT);
  const exit = (i: number, _g: Glyph, st: GlyphState) => {
    const d0 = t1 + i * 0.025;
    const k = seg(t, d0, d0 + 0.7, ROOM_DIVE);
    if (k <= 0) return;
    st.pos.lerp(home, k);
    st.scale *= 1 - 0.85 * k * k;
    st.heat = Math.max(st.heat, k * 1.2);
    st.opacity *= 1 - seg(t, d0 + 0.5, d0 + 0.7, ease.in);
  };
  return <GatherWord t={t} layout={layout} centre={ROOM_AT} t0={t0} t1={t1} seed={11} spread={1.5} depth={1.2} exit={exit} />;
};

// ------------------------------------------------------------------ world

const World: React.FC<{t: number}> = ({t}) => {
  const {frame, wipe, wipeT0, lang, cut} = useTracks();
  const {defs, targets} = useBurst();

  // Everything gathers into one constellation on "One idea".
  const gather = seg(t, T.idea - 0.2, T.convo + 0.4, ease.inOut);
  const starPos = (i: number, n: number) => {
    const a = (i / n) * Math.PI * 2 + 0.3;
    return STAR.clone().add(new THREE.Vector3(Math.cos(a) * 7.5, Math.sin(a) * 3.4, Math.sin(a * 2) * 3 - 2));
  };
  // Far things come in from the distance (a deep arc), never past the lens. Things behind the camera
  // when the gather starts also swing wide (`detour`) and come in from the edge of the frame.
  const toStar = (p: THREE.Vector3, i: number, n = 11, detour?: THREE.Vector3) => {
    const target = starPos(i, n);
    const q = p.clone().lerp(target, gather);
    q.z -= 0.35 * p.distanceTo(target) * Math.sin(Math.PI * gather);
    if (detour) q.addScaledVector(detour, Math.sin(Math.PI * gather));
    return q;
  };
  const starScale = lerp(1, 0.55, gather);

  const photoIn = seg(t, T.photo - 0.4, T.photo + 0.4, ease.outSoft);
  const opened = (k: number) => seg(t, T.open + k * 0.16, T.open + 0.95 + k * 0.16, ease.out);

  // Where each blade is across its card (0 left edge, 1 right edge): the pen rides its top end.
  const uA = t < A_W.sweep0 ? 0 : clamp01((wipe.pointAtLength(wipe.lengthAt(t)).x - (POSTER.x - POSTER_W / 2)) / POSTER_W);
  const wipeK = uA;
  const bA = blade(t, A_W);
  const PW = HK_W * HK_WIN0;
  const hkU = t < H_W.sweep0 ? 0 : clamp01((lang.pointAtLength(lang.lengthAt(t)).x - (HK.x - PW / 2)) / PW);
  // The same position in the card's own (16:9) coordinates, for the wipe.
  const hkUCard = 0.5 - HK_WIN0 / 2 + hkU * HK_WIN0;
  const hkWin = hkWindow(t);
  const hkRim = 0.35 * seg(t, H_W.sweep1 - 0.3, H_W.sweep1 + 0.3, ease.outSoft);
  const bH = blade(t, H_W);
  const hkIn = seg(t, T.ad + 1.2, T.lang, ease.outSoft);

  // The dress: lifted from the screenshot, carried onto the person.
  const lift = seg(t, T.screenshot + 1.6, T.screenshot + 1.95, ease.out);
  const carry = seg(t, T.screenshot + 1.85, T.screenshot + 2.95, ease.inOut);
  const worn = seg(t, T.screenshot + 2.75, T.screenshot + 3.5, ease.inOut);
  // It leaves the screenshot at the size it has there and lands at the size it has on you (the result).
  const dressPos = SHOT.clone().add(new THREE.Vector3(-0.01, 0.15, 0.3 + lift * 0.6)).lerp(PERSON.clone().add(new THREE.Vector3(0.02, -0.02, 0.4)), carry);
  const dressH = 2.49 + (2.83 - 2.49) * carry;
  dressPos.y += Math.sin(carry * Math.PI) * 1.1;

  const burstFade = 1 - seg(t, RETRACT0, RETRACT0 + 0.5, ease.in);
  // Everything we made settles away when the models start changing again.
  const F = 1 - seg(t, cueAt("c7.1") + 0.6, cueAt("c7.3") - 0.4, ease.inOut);
  // Mounted until the last thread is home.
  if (F <= 0 && t > RETRACT0 + 0.35 + RETRACT_DUR + 0.05) return null;
  const constellation = seg(t, T.convo - 0.1, T.convo + 0.9, ease.out);

  // The 9 outputs, at their places and in the constellation.
  const outs: Array<{pos: THREE.Vector3; idx: number}> = [];
  ONE_PHOTO_CLIPS.forEach((_, k) => outs.push({pos: PHOTO.clone().lerp(O6.clone().add(ONE_PHOTO_CLIPS[k].to), opened(k)), idx: k}));
  const shown = (p: THREE.Vector3, i: number) => toStar(p, i);

  return (
    <group>
      {/* 1 · one photograph */}
      {t < T.idea + 1 ? <Card src={ONE_PHOTO.src} w={PHOTO_W} h={PHOTO_H} position={PHOTO} corner={0.06} matte={1} reveal={photoIn} opacity={(1 - gather) * seg(t, T.photo - 0.55, T.photo - 0.25, ease.outSoft)} renderOrder={6} /> : null}
      <GoldLine pts={frame.pts} progress={frame.progressAt(t)} radius={LINE_R * 0.8} pen={t < T.photo + 0.2 ? 0.9 : 0} sparks={4} opacity={1 - seg(t, T.screenshot - 0.4, T.screenshot + 0.6, ease.in)} />
      {ONE_PHOTO_CLIPS.map((f, k) => {
        const o = opened(k);
        if (o <= 0) return null;
        const p = shown(outs[k].pos, k);
        const h = lerp(PHOTO_H, 2.7, o) * starScale;
        return (
          <group key={k}>
            <VideoCard src={f.video} poster={f.poster} time={t - T.open + k * 1.3} w={h * FILM_ASPECT} h={h} position={p} rotation={[0, -0.18 * (f.to.x / 5) * o, 0]} corner={0.06} rim={0.45 * o} rimWidth={0.012} opacity={Math.min(1, o * 3) * F} renderOrder={7} />
            {gather < 0.5 ? <GoldLine pts={[PHOTO.clone(), p.clone()]} progress={o} radius={0.004} color={GOLD.line.clone().multiplyScalar(0.55)} pen={0} opacity={1 - gather * 2} /> : null}
          </group>
        );
      })}
      {/* 2 · a fashion image becomes a moving editorial: two of them sweep past the lens. */}
      {t > T.fashion - 1.6 ? <VideoCard src={M.editorial.video} poster={M.editorial.poster} time={editorialTime(t)} w={7.4 * starScale} h={(7.4 / M.editorial.aspect) * starScale} position={toStar(EDITORIAL_AT, 4)} rotation={[0, 0.25 * (1 - gather), 0]} corner={0.08} rim={0.3} rimWidth={0.015} opacity={F * seg(t, T.fashion + 0.1, T.fashion + 0.7, ease.outSoft) * Math.max(1 - seg(t, T.fashion + 2.95, T.fashion + 3.5, ease.inOut), seg(t, T.idea - 0.4, T.idea + 0.3, ease.outSoft))} /> : null}
      {t > T.fashion - 1.6 ? <VideoCard src={M.street.video} poster={M.street.poster} time={t - T.fashion + 3.36} w={6.2 * starScale} h={(6.2 / M.street.aspect) * starScale} position={toStar(CITY_AT, 5, 11, CITY_DETOUR)} rotation={[0, -0.25 * (1 - gather), 0]} corner={0.08} rim={0.3} rimWidth={0.015} opacity={F * seg(t, T.fashion - 0.4, T.fashion + 0.4, ease.outSoft)} /> : null}
      {/* 3 · the ad you admire becomes yours: the line wipes it. */}
      <group>
        <Card src={AD.before} w={POSTER_W * starScale} h={POSTER_H * starScale} position={toStar(POSTER, 6)} corner={0.05} renderOrder={6} opacity={F * seg(t, T.fashion + 0.8, T.ad - 0.6, ease.outSoft)} />
        <Card src={AD.after} w={POSTER_W * starScale} h={POSTER_H * starScale} position={toStar(POSTER, 6).add(new THREE.Vector3(0, 0, 0.01))} corner={0.05} wipe={t >= wipeT0 ? wipeAt(t, A_W, uA) : -1} wipeSoft={0.006} wipeGlow={0.22} renderOrder={7} rim={0.35 * wipeK} rimWidth={0.015} opacity={F} />
        {bA.on ? (
          <LightBlade top={new THREE.Vector3(POSTER.x - POSTER_W / 2 + uA * POSTER_W, POSTER.y + POSTER_H / 2 + 0.18, POSTER.z + 0.06)} bottom={new THREE.Vector3(POSTER.x - POSTER_W / 2 + uA * POSTER_W, POSTER.y - POSTER_H / 2 - 0.22, POSTER.z + 0.06)} time={t} to={bA.to} intensity={F} seed={3} />
        ) : null}
        {t > T.ad + 0.25 && t < A_W.sweep1 + 1.0 ? <GoldLine pts={wipe.pts} progress={wipe.progressAt(t)} radius={LINE_R} pen={t < A_W.sweep1 + 0.1 ? 1 : 0} sparks={5} tailLen={0.9} overrun={Math.max(0, t - A_W.sweep1) * 6} /> : null}
      </group>
      {/* 3b · in your language: the poster changes, then comes alive as a clip. */}
      {hkIn > 0 ? (
        <group>
          {t < H_W.sweep1 + 0.7 ? <Card src={AD_LIVE.before} w={HK_W * starScale} h={HK_H * starScale} position={toStar(HK, 9)} corner={0.06} window={hkWin} renderOrder={6} opacity={hkIn * F} /> : null}
          {/* The second poster, wiped in by the blade. */}
          {t >= H_W.sweep0 && t < HK_OPEN.t0 + 0.35 ? (
            <Card src={AD_LIVE.after} w={HK_W * starScale} h={HK_H * starScale} position={toStar(HK, 9).add(new THREE.Vector3(0, 0, 0.01))} corner={0.06} window={hkWin} wipe={wipeAt(t, H_W, hkUCard)} wipeSoft={0.006} wipeGlow={0.22} renderOrder={7} rim={hkRim} rimWidth={0.015} opacity={F} />
          ) : null}
          {/* "And brought to life.": the clip starts on the poster, and the window opens out to 16:9. */}
          {t >= HK_OPEN.t0 ? (
            <VideoCard src={AD_LIVE.clip.video} poster={AD_LIVE.clip.poster} time={Math.min(Math.max(0, t - H_W.sweep1), 15.05)} duration={AD_LIVE.clipSeconds} w={HK_W * starScale} h={HK_H * starScale} position={toStar(HK, 9).add(new THREE.Vector3(0, 0, 0.02))} corner={0.06} window={hkWin} renderOrder={8} rim={hkRim} rimWidth={0.015} opacity={F * seg(t, HK_OPEN.t0, HK_OPEN.t0 + 0.25, ease.outSoft)} />
          ) : null}
          {bH.on ? (
            <LightBlade top={new THREE.Vector3(HK.x - PW / 2 + hkU * PW, HK.y + HK_H / 2 + 0.18, HK.z + 0.06)} bottom={new THREE.Vector3(HK.x - PW / 2 + hkU * PW, HK.y - HK_H / 2 - 0.22, HK.z + 0.06)} time={t} to={bH.to} intensity={F} seed={7} />
          ) : null}
          {t > A_W.sweep1 + 0.08 && t < H_W.sweep1 + 1.4 ? <GoldLine pts={lang.pts} progress={lang.progressAt(t)} radius={LINE_R} pen={t < H_W.sweep1 + RETRACT + 0.4 ? 1 : 0} sparks={5} tailLen={1.0} overrun={lang.overrunAt(t)} seed={12} /> : null}
        </group>
      ) : null}
      {/* 4 · a screenshot becomes something you're wearing: the Fitting Room. */}
      <FittingRoom t={t} />
      {/* 4b · …and every piece settles into the wardrobe; then see it on you. */}
      <Wardrobe t={t} shot={SHOT} person={PERSON} kw={KW} kh={KH} gather={gather} node={starPos(10, 11)} fade={F} />
      <Card src={FITTING.screenshot} w={KW * starScale} h={KH * starScale} position={toStar(SHOT, 7)} corner={0.18} renderOrder={6} opacity={(1 - gather) * seg(t, T.screenshot - 1.2, T.screenshot - 0.3, ease.outSoft)} />
      {/* The screenshot's place in the constellation goes to the first try-on from the wardrobe. */}
      {gather > 0 ? <Card src={WARDROBE.tryOnA} w={KW * starScale} h={KH * starScale} position={toStar(SHOT, 7).add(new THREE.Vector3(0, 0, 0.01))} corner={0.06} rim={0.4} rimWidth={0.014} renderOrder={7} opacity={F * seg(gather, 0.15, 0.6, ease.outSoft)} /> : null}
      <Card src={FITTING.person} w={KW * starScale} h={KH * starScale} position={toStar(PERSON, 8)} corner={0.06} matte={1} renderOrder={6} opacity={F * seg(t, T.screenshot - 1.0, T.screenshot - 0.1, ease.outSoft)} />
      <Card src={FITTING.worn} w={KW * starScale} h={KH * starScale} position={toStar(PERSON, 8).add(new THREE.Vector3(0, 0, 0.01))} corner={0.06} opacity={worn * F} rim={0.4 * worn} rimWidth={0.014} renderOrder={7} />
      {lift > 0 && worn < 1 ? <Card src={FITTING.piece} w={dressH * FITTING.pieceAspect} h={dressH} position={dressPos} renderOrder={9} opacity={1 - worn} /> : null}
      {t > T.screenshot && t < T.idea + 0.4 ? <GoldLine pts={cut.pts} progress={cut.progressAt(t)} radius={LINE_R * 0.8} pen={t < T.screenshot + 1.65 ? 0.9 : 0} sparks={4} tailLen={2.4} overrun={cut.overrunAt(t, 3)} /> : null}
      {/* One conversation: the threads between them. */}
      {constellation > 0 && burstFade > 0
        ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => (
            <GoldLine key={`k${i}`} pts={[STAR.clone(), starPos(i, 11)]} progress={seg(constellation, i / 12, i / 12 + 0.4, ease.out)} radius={0.0045} color={GOLD.line.clone().multiplyScalar(0.6 * burstFade)} pen={0} />
          ))
        : null}
      {t > T.convo - 0.3 && t < T.end ? <Pen position={STAR} size={0.9 * seg(t, T.convo - 0.3, T.convo + 0.3, ease.out)} breathe={t < T.endless ? 1 : 0.4} sparks={t > T.endless ? 8 : 3} /> : null}
      {/* Endless: the line bursts into hundreds of threads, each finding a film far away. */}
      {t > T.endless ? <Strands defs={defs} time={t} tail={0.0} fadeFrom={cueAt("c7.1")} fadeSpan={0.008} floor={0.32} retractDur={RETRACT_DUR} /> : null}
      {targets.map((g, i) => {
        // Each film lets go as its thread leaves it.
        const go = seg(t, g.retract, g.retract + 0.24, ease.in);
        if (t <= g.at - 0.1 || go >= 1) return null;
        const k = 1 - 0.45 * go;
        return <Card key={`g${i}`} src={g.src} w={2.6 * g.aspect * k} h={2.6 * k} position={g.pos} corner={0.05} opacity={seg(t, g.at - 0.1, g.at + 0.4, ease.outSoft) * (1 - go) * (1 - 0.35 * seg(t, cueAt("c7.1"), RETRACT0, ease.inOut))} rim={0.5} rimWidth={0.03} />;
      })}
    </group>
  );
};

export const S6: Scene = {
  id: "s6",
  from: T.start,
  to: T.end,
  camera: s6Camera,
  World,
  post: 8,
  dust: 0.6,
};

export const S6_STAR = STAR;
export const S6_TIMES = T;
