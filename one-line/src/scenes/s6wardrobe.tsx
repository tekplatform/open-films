import React, {useMemo} from "react";
import * as THREE from "three";
import {WARDROBE} from "../../pictures";
import {fonts} from "../fonts";
import {LINE_R} from "../looks";
import {at as cueAt, clamp01, ease, seg} from "../timing";
import {Card, TexPlane} from "../world/Card";
import {blade, LightBlade, wipeAt, type BladeWindow} from "../world/LightBlade";
import {GoldLine, Path} from "../world/Line";
import {LineTrack} from "../world/track";
import {makeTextTexture} from "../world/Type";
import {O6} from "./seams";

/**
 * The digital wardrobe (Fitting Room → Wardrobe → try-on), product truth:
 * "I separate the pieces and your wardrobe fills itself." The screenshot's
 * other pieces (clutch, heels) are cut out too; the camera follows them to the
 * Wardrobe view (segmented control, filter chips and labelled tiles as in the
 * product, dark tokens). A photo of an outfit is read piece by piece ("I found
 * 5 pieces"), each piece settling into its tile. Then "Your photo" tries the
 * pieces on: the chosen tiles glow, the pieces fly to the photo and strike the
 * light blade, which sweeps the try-on result over it — twice.
 */

const S = cueAt("c6.4");
/** "Every piece you photograph settles…" and "See it on you…": the wardrobe and the try-on hang on them. */
const B = cueAt("c6.4b");
const C = cueAt("c6.4c");

/** The station sits right of the fitting room and a little deeper. */
export const WD = O6.clone().add(new THREE.Vector3(25, 0.1, -20));
export const WD_LOOK = WD.clone().add(new THREE.Vector3(0.55, 0, 0));
const CARD_H = 4.4;
const CARD_W = CARD_H * (1024 / 1536);
const OUT = new THREE.Vector3(-4.85, 0, 0); // the outfit photo (local)
const YOU = new THREE.Vector3(5.95, 0, 0); // your photo (local)
const PANEL = new THREE.Vector3(0.55, 0, -0.02);
const PW = 6.4;
const PH = 5.0;
const PX = 1280; // panel canvas px
const PY = 1000;
const K = PW / PX;

// ------------------------------------------------------------------ the Wardrobe view (real tokens, dark)

type Tile = {x: number; y: number; w: number; h: number};
const GRID = (() => {
  const tiles: Tile[] = [];
  const x0 = 48;
  const y0 = 196;
  const gap = 16;
  const tw = (PX - 96 - 3 * gap) / 4;
  const th = (PY - y0 - 32 - 2 * gap) / 3;
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) tiles.push({x: x0 + c * (tw + gap), y: y0 + r * (th + gap), w: tw, h: th});
  return tiles;
})();

const drawPanel = () => {
  const ss = 2;
  const c = document.createElement("canvas");
  c.width = PX * ss;
  c.height = PY * ss;
  const g = c.getContext("2d")!;
  g.scale(ss, ss);
  g.fillStyle = "#181818";
  g.strokeStyle = "#353535";
  g.lineWidth = 2;
  g.beginPath();
  g.roundRect(1, 1, PX - 2, PY - 2, 36);
  g.fill();
  g.stroke();
  // Views: Fitting room · Wardrobe · My looks (Wardrobe selected).
  const tabs = ["Fitting room", "Wardrobe", "My looks"];
  g.font = `600 30px "${fonts.ui}"`;
  const tw = tabs.map((s) => g.measureText(s).width + 60);
  const total = tw.reduce((a, b) => a + b, 0) + 8;
  let x = (PX - total) / 2;
  g.fillStyle = "#242424";
  g.beginPath();
  g.roundRect(x - 4, 30, total, 70, 35);
  g.fill();
  tabs.forEach((s, i) => {
    if (i === 1) {
      g.fillStyle = "#DEDEDE";
      g.beginPath();
      g.roundRect(x, 34, tw[i], 62, 31);
      g.fill();
    }
    g.fillStyle = i === 1 ? "#0D0D0D" : "#C4C4C4";
    g.textBaseline = "middle";
    g.fillText(s, x + 30, 66);
    x += tw[i];
  });
  // Filter chips: All + the groups present (product EN group labels).
  const chips = ["All", "Outerwear", "Tops", "Bottoms", "Eveningwear", "Footwear", "Bags"];
  g.font = `500 25px "${fonts.ui}"`;
  const cw = chips.map((s) => g.measureText(s).width + 38);
  const ctotal = cw.reduce((a, b) => a + b, 0) + 12 * (chips.length - 1);
  x = (PX - ctotal) / 2;
  chips.forEach((s, i) => {
    const w = cw[i];
    g.fillStyle = i === 0 ? "#DEDEDE" : "#2A2A2A";
    g.beginPath();
    g.roundRect(x, 118, w, 50, 25);
    g.fill();
    g.fillStyle = i === 0 ? "#0D0D0D" : "#C9C9C9";
    g.fillText(s, x + 19, 144);
    x += w + 12;
  });
  // Empty tiles (the pieces are their own planes, so they can arrive).
  // Tiles: a little lighter than the panel, with a soft light behind the piece (dark pieces read).
  GRID.forEach((t) => {
    g.save();
    g.beginPath();
    g.roundRect(t.x, t.y, t.w, t.h, 20);
    g.clip();
    g.fillStyle = "#2B2B2B";
    g.fillRect(t.x, t.y, t.w, t.h);
    const r = g.createRadialGradient(t.x + t.w / 2, t.y + t.h * 0.42, 6, t.x + t.w / 2, t.y + t.h * 0.42, t.w * 0.62);
    r.addColorStop(0, "rgba(120,116,110,0.55)");
    r.addColorStop(1, "rgba(120,116,110,0)");
    g.fillStyle = r;
    g.fillRect(t.x, t.y, t.w, t.h);
    g.restore();
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.anisotropy = 8;
  return tex;
};

/** Tile centre (local, world units) and the box a piece is fitted into. */
const tileAt = (i: number) => {
  const t = GRID[i];
  const cx = PANEL.x + (t.x + t.w / 2 - PX / 2) * K;
  const cy = PANEL.y + (PY / 2 - (t.y + t.h / 2 - 14)) * K;
  return {pos: new THREE.Vector3(cx, cy, PANEL.z + 0.02), w: t.w * K * 0.78, h: (t.h - 40) * K * 0.86, tile: t};
};

// ------------------------------------------------------------------ the pieces

type Piece = {src: string; aspect: number; label: string; tile: number; from: "person" | "shot" | "photo" | "pre"; at: number; lift?: number; box?: [number, number, number, number]; shot?: [number, number]};

// Boxes on the outfit photo (u0, v0, u1, v1).
const P = WARDROBE.pieces;
const PIECES: Piece[] = [
  // From the fitting room's screenshot.
  {...P[0], label: "Eveningwear", tile: 0, from: "person", at: S + 3.55, lift: S + 3.4},
  {...P[1], label: "Bags", tile: 1, from: "shot", at: S + 3.65, lift: S + 2.35, shot: [0.33, 0.5]},
  {...P[2], label: "Footwear", tile: 2, from: "shot", at: S + 3.8, lift: S + 2.95, shot: [0.47, 0.88]},
  {...P[3], label: "Outerwear", tile: 3, from: "pre", at: 0},
  {...P[4], label: "Outerwear", tile: 4, from: "photo", at: B + 2.3, box: [0.29, 0.17, 0.71, 0.49]},
  {...P[5], label: "Tops", tile: 5, from: "photo", at: B + 2.7, box: [0.49, 0.18, 0.64, 0.4]},
  {...P[6], label: "Bottoms", tile: 6, from: "photo", at: B + 3.1, box: [0.4, 0.38, 0.67, 0.8]},
  {...P[7], label: "Bags", tile: 7, from: "photo", at: B + 3.5, box: [0.25, 0.18, 0.44, 0.49]},
  {...P[8], label: "Footwear", tile: 8, from: "photo", at: B + 3.9, box: [0.43, 0.75, 0.57, 0.92]},
  {...P[9], label: "Tops", tile: 9, from: "pre", at: 0},
  {...P[10], label: "Bottoms", tile: 10, from: "pre", at: 0},
  {...P[11], label: "Footwear", tile: 11, from: "pre", at: 0},
];
const FLY = 0.85;
const LOOK1 = [4, 5, 6, 7, 8]; // leather jacket look
const LOOK2 = [9, 10, 11]; // knit, jeans, loafers
/**
 * The try-on: the chosen pieces fly from their tiles onto
 * the person the way they flew into the wardrobe, in dressing order, each
 * landing where it is worn and at its size (measured on the try-on
 * photos); when all are on, the blade sweeps and the try-on shows,
 * absorbing the pieces as it passes. The second look is the same, quicker.
 */
type Try = {pulse: number; order: number[]; lift0: number; stagger: number; flight: number; blade: BladeWindow};
const makeTry = (pulse: number, order: number[], stagger: number, flight: number, sweep: number): Try => {
  const landed = pulse + 0.2 + (order.length - 1) * stagger + 0.12 + flight;
  const strike = landed + 0.17;
  return {pulse, order, lift0: pulse + 0.2, stagger, flight, blade: {strike, sweep0: strike + 0.12, sweep1: strike + 0.12 + sweep}};
};
// Shirt, skirt, jacket, shoes, bag; then knit, jeans, loafers.
const TRY1 = makeTry(C - 0.4, [5, 6, 4, 8, 7], 0.27, 0.8, 0.85);
const TRY2 = makeTry(TRY1.blade.sweep1 + 0.3, [9, 10, 11], 0.25, 0.7, 0.7);
/** Where each piece is worn on "your photo" (u, v on the card; width as a fraction of the card). */
const BODY: Record<number, {u: number; v: number; w: number}> = {
  4: {u: 0.49, v: 0.355, w: 0.45}, // jacket (collar at the try-on's collar, not the chin)
  5: {u: 0.51, v: 0.335, w: 0.3}, // shirt
  6: {u: 0.51, v: 0.62, w: 0.4}, // skirt
  7: {u: 0.335, v: 0.4, w: 0.17}, // bag, from the shoulder
  8: {u: 0.495, v: 0.93, w: 0.19}, // trainers
  9: {u: 0.51, v: 0.33, w: 0.37}, // knit
  10: {u: 0.52, v: 0.66, w: 0.3}, // jeans
  11: {u: 0.49, v: 0.905, w: 0.26}, // loafers
};

const fit = (aspect: number, w: number, h: number) => (aspect > w / h ? {w, h: w / aspect} : {w: h * aspect, h});

const pillSpec = (s: string) => makeTextTexture({lines: [s], font: `500 "${fonts.ui}"`, size: 27, color: "rgba(226,226,226,0.95)", tracking: 0.01});
const credit = (s: string) => makeTextTexture({lines: [s], font: `500 "${fonts.mono}"`, size: 12, color: "rgba(240,232,218,0.62)", tracking: 0.14});

/** A piece in flight: from a world point and size to its tile, lifted toward the lens mid-way. */
const flight = (q: number, from: THREE.Vector3, to: THREE.Vector3, w0: number, w1: number) => {
  const e = ease.inOut(q);
  const p = from.clone().lerp(to, e);
  p.z += Math.sin(Math.PI * q) * 0.9;
  p.y += Math.sin(Math.PI * q) * 0.35;
  return {pos: p, w: w0 + (w1 - w0) * e};
};

const HOT = new THREE.Color(1.7, 1.15, 0.6);
const heatTint = (k: number) => new THREE.Color(1, 1, 1).lerp(HOT, k);

// ------------------------------------------------------------------ the station

export const Wardrobe: React.FC<{
  t: number;
  /** World positions of the fitting room's two cards (pieces leave from them). */
  shot: THREE.Vector3;
  person: THREE.Vector3;
  kw: number;
  kh: number;
  /** 0..1 gather into the constellation, its node, and the scene's fade. */
  gather: number;
  node: THREE.Vector3;
  fade: number;
}> = ({t, shot, person, kw, kh, gather, node, fade}) => {
  const panel = useMemo(drawPanel, []);
  // Pen: from the dress lasso on to the clutch, then the heels.
  const lasso = useMemo(() => {
    const z = shot.z + 0.05;
    const P = (u: number, v: number) => new THREE.Vector3(shot.x + (u - 0.5) * kw, shot.y + (0.5 - v) * kh, z);
    const loop = (u: number, v: number, rx: number, ry: number, from: number) => {
      const c = P(u, v);
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 40; i++) {
        const a = from + (i / 40) * Math.PI * 2.1;
        pts.push(new THREE.Vector3(c.x + Math.cos(a) * rx, c.y + Math.sin(a) * ry, z));
      }
      return pts;
    };
    const p = new Path();
    const dressEnd = new THREE.Vector3(shot.x + Math.cos(2.15 * Math.PI * 1 + 1.4) * 0.62 + 0.05, shot.y - 0.35 + Math.sin(2.15 * Math.PI + 1.4) * 1.55, z);
    p.pts.push(dressEnd);
    const clutch = loop(0.3, 0.52, 0.2, 0.16, Math.PI * 0.6);
    p.smooth([clutch[0]], 24);
    const ci = p.pts.length - 1;
    clutch.slice(1).forEach((q) => p.pts.push(q));
    const cj = p.pts.length - 1;
    const heels = loop(0.47, 0.92, 0.22, 0.13, Math.PI * 0.5);
    p.smooth([heels[0]], 24);
    const hi = p.pts.length - 1;
    heels.slice(1).forEach((q) => p.pts.push(q));
    return new LineTrack([
      {pts: p.pts.slice(0, ci + 1), t0: S + 1.7, t1: S + 1.86, ease: ease.inOut},
      {pts: p.pts.slice(ci, cj + 1), t0: S + 1.86, t1: S + 2.32, ease: ease.inOut, turnCost: 0},
      {pts: p.pts.slice(cj, hi + 1), t0: S + 2.32, t1: S + 2.5, ease: ease.inOut},
      {pts: p.pts.slice(hi), t0: S + 2.5, t1: S + 2.94, ease: ease.inOut, turnCost: 0},
    ]);
  }, [shot, kw, kh]);

  // Detection boxes on the outfit photo.
  const boxes = useMemo(
    () =>
      PIECES.filter((pc) => pc.box).map((pc) => {
        const [u0, v0, u1, v1] = pc.box!;
        const c = new THREE.Vector3(OUT.x + ((u0 + u1) / 2 - 0.5) * CARD_W, OUT.y + (0.5 - (v0 + v1) / 2) * CARD_H, OUT.z + 0.04);
        const hw = ((u1 - u0) / 2) * CARD_W;
        const hh = ((v1 - v0) / 2) * CARD_H;
        const p = new Path();
        p.pts.push(new THREE.Vector3(c.x - hw + 0.06, c.y + hh, c.z));
        p.roundRect(c, hw, hh, 0.06);
        return {pc, c, hw, hh, pts: p.pts};
      }),
    [],
  );

  const born = seg(t, S + 1.6, S + 2.95, ease.outSoft);
  if (born <= 0 || fade <= 0) return null;
  const local = (v: THREE.Vector3) => v.clone();
  const groupPos = WD.clone().lerp(node, gather);
  groupPos.z -= 0.35 * WD.distanceTo(node) * Math.sin(Math.PI * gather);
  const scale = 1 - 0.78 * gather;
  const toWorld = (v: THREE.Vector3) => v.clone().multiplyScalar(scale).add(groupPos);

  const pieces = PIECES.map((pc, i) => {
    const tile = tileAt(pc.tile);
    const f = fit(pc.aspect, tile.w, tile.h);
    let q = 1;
    let from = tile.pos;
    let w0 = f.w;
    if (pc.from !== "pre") {
      q = seg(t, pc.at, pc.at + FLY, ease.linear);
      if (pc.from === "person") {
        from = person.clone().add(new THREE.Vector3(0, -0.3, 0.3)).sub(WD);
        w0 = 1.25;
      } else if (pc.from === "shot") {
        const [u, v] = pc.shot!;
        from = new THREE.Vector3(shot.x + (u - 0.5) * kw, shot.y + (0.5 - v) * kh, shot.z + 0.15).sub(WD);
        w0 = 0.42;
      } else {
        const [u0, v0, u1, v1] = pc.box!;
        from = new THREE.Vector3(OUT.x + ((u0 + u1) / 2 - 0.5) * CARD_W, OUT.y + (0.5 - (v0 + v1) / 2) * CARD_H, OUT.z + 0.08);
        w0 = Math.max((u1 - u0) * CARD_W, ((v1 - v0) * CARD_H) * pc.aspect) * 1.05;
      }
    }
    // Try-on: the chosen tiles glow, and a copy of each flies to your photo's top-left corner.
    const tryK = LOOK1.includes(i) ? 1 : LOOK2.includes(i) ? 2 : 0;
    const tr = tryK === 1 ? TRY1 : TRY2;
    const glow = tryK ? Math.sin(clamp01((t - tr.pulse) / 1.0) * Math.PI) : 0;
    return {pc, i, tile, f, q, from, w0, glow};
  });

  const b1 = blade(t, TRY1.blade);
  const b2 = blade(t, TRY2.blade);
  const u1 = seg(t, TRY1.blade.sweep0, TRY1.blade.sweep1, ease.inOut);
  const u2 = seg(t, TRY2.blade.sweep0, TRY2.blade.sweep1, ease.inOut);
  const cardIn = seg(t, S + 1.9, S + 3.25, ease.outSoft);
  const found = seg(t, B + 1.9, B + 2.3, ease.outSoft);
  const ready = seg(t, C - 0.5, C - 0.1, ease.outSoft);

  const credits: Array<{s: string; at: THREE.Vector3; o: number}> = [
    {s: "PHOTO OF AN OUTFIT", at: OUT, o: cardIn * (1 - found)},
    {s: "I FOUND 5 PIECES", at: OUT, o: found},
    {s: "PIECES READY IN YOUR WARDROBE", at: PANEL.clone().add(new THREE.Vector3(0, -PH / 2 + CARD_H / 2, 0)), o: ready},
    {s: "YOUR PHOTO", at: YOU, o: cardIn * (1 - seg(u1, 0.6, 1, ease.out))},
    {s: "TRY-ON RESULT", at: YOU, o: seg(u1, 0.6, 1, ease.out)},
  ];

  return (
    <group>
      {/* The pen cuts the clutch and the heels out of the screenshot too. */}
      {t > S + 1.68 && t < S + 4.0 ? <GoldLine pts={lasso.pts} progress={lasso.progressAt(t)} radius={LINE_R * 0.8} pen={t < S + 2.96 ? 0.9 : 0} sparks={3} tailLen={1.6} overrun={lasso.overrunAt(t, 4)} seed={31} /> : null}
      <group position={groupPos} scale={scale}>
        {/* The outfit photo, the Wardrobe view, your photo. */}
        <Card src={WARDROBE.outfit} w={CARD_W} h={CARD_H} position={local(OUT)} corner={0.06} renderOrder={6} opacity={cardIn * fade} />
        <TexPlane tex={panel} w={PW} h={PH} position={local(PANEL)} renderOrder={5} opacity={cardIn * fade} />
        <Card src={WARDROBE.you} w={CARD_W} h={CARD_H} position={local(YOU)} corner={0.06} matte={0.6} renderOrder={6} opacity={cardIn * fade} />
        {t >= TRY1.blade.sweep0 ? <Card src={WARDROBE.tryOnA} w={CARD_W} h={CARD_H} position={local(YOU).add(new THREE.Vector3(0, 0, 0.01))} corner={0.06} wipe={wipeAt(t, TRY1.blade, u1)} wipeSoft={0.006} wipeGlow={0.22} rim={0.35 * u1 * (1 - u2)} rimWidth={0.014} renderOrder={7} opacity={fade} /> : null}
        {t >= TRY2.blade.sweep0 ? <Card src={WARDROBE.tryOnB} w={CARD_W} h={CARD_H} position={local(YOU).add(new THREE.Vector3(0, 0, 0.02))} corner={0.06} wipe={wipeAt(t, TRY2.blade, u2)} wipeSoft={0.006} wipeGlow={0.22} rim={0.35 * u2} rimWidth={0.014} renderOrder={8} opacity={fade} /> : null}
        {/* Detection: a frame round each piece, then the piece lifts out. */}
        {boxes.map((b, k) => {
          const tb = b.pc.at - 0.3;
          if (t < tb || t > b.pc.at + 1.0) return null;
          const o = 1 - seg(t, b.pc.at + 0.35, b.pc.at + 0.95, ease.inOut);
          return <GoldLine key={`b${k}`} pts={b.pts} progress={seg(t, tb, tb + 0.22, ease.out)} radius={0.0065} pen={0} opacity={o * fade} />;
        })}
        {/* Pieces at home in their tiles, with their labels. */}
        {pieces.map((p) => {
          if (p.q < 1) return null;
          const tex = pillSpec(p.pc.label);
          const tl = p.tile.tile;
          const pillPos = new THREE.Vector3(PANEL.x + (tl.x + 16 + (tex.wPx - 2 * tex.padPx) / 2 - PX / 2) * K, PANEL.y + (PY / 2 - (tl.y + tl.h - 28)) * K, PANEL.z + 0.03);
          const landed = p.pc.from === "pre" ? cardIn : seg(t, p.pc.at + FLY - 0.05, p.pc.at + FLY + 0.3, ease.outSoft);
          return (
            <group key={`p${p.i}`}>
              <Card src={p.pc.src} w={p.f.w} h={p.f.w / p.pc.aspect} position={p.tile.pos} renderOrder={9} opacity={fade * (p.pc.from === "pre" ? cardIn : 1)} tint={heatTint(0.5 * (1 - landed) * (p.pc.from === "pre" ? 0 : 1)).multiplyScalar(1 + 0.25 * p.glow)} />
              <TexPlane tex={tex.tex} w={tex.wPx * K} h={tex.hPx * K} position={pillPos} renderOrder={10} opacity={landed * fade} />
            </group>
          );
        })}
        {/* Selected for the try-on: a thin gold ring round each chosen tile. */}
        {pieces.map((p) => {
          const tr = LOOK1.includes(p.i) ? TRY1 : LOOK2.includes(p.i) ? TRY2 : null;
          if (!tr || t < tr.pulse - 0.05) return null;
          const end = tr === TRY1 ? TRY2.pulse : TRY2.blade.sweep1 + 0.6;
          const o = 1 - seg(t, end - 0.2, end + 0.3, ease.inOut);
          if (o <= 0) return null;
          const tl = p.tile.tile;
          const c = new THREE.Vector3(PANEL.x + (tl.x + tl.w / 2 - PX / 2) * K, PANEL.y + (PY / 2 - (tl.y + tl.h / 2)) * K, PANEL.z + 0.035);
          const ring = new Path();
          ring.pts.push(new THREE.Vector3(c.x - (tl.w / 2) * K + 0.1, c.y + (tl.h / 2) * K, c.z));
          ring.roundRect(c, (tl.w / 2) * K, (tl.h / 2) * K, 20 * K);
          return <GoldLine key={`r${p.i}`} pts={ring.pts} progress={seg(t, tr.pulse - 0.05 + (p.i % 5) * 0.03, tr.pulse + 0.2 + (p.i % 5) * 0.03, ease.out)} radius={0.0075} pen={0} opacity={o * fade} />;
        })}
        {/* The try-on: each chosen piece lifts out of its tile, flies onto the person and is worn. */}
        {[{tr: TRY1, u: u1}, {tr: TRY2, u: u2}].map(({tr, u}) =>
          tr.order.map((i, k) => {
            const p = pieces[i];
            const lift = tr.lift0 + k * tr.stagger;
            if (t < lift || u >= 1) return null;
            const body = BODY[i];
            const to = new THREE.Vector3(YOU.x + (body.u - 0.5) * CARD_W, YOU.y + (0.5 - body.v) * CARD_H, YOU.z + 0.07 + 0.01 * k);
            const q = seg(t, lift + 0.12, lift + 0.12 + tr.flight, ease.linear);
            const hover = seg(t, lift, lift + 0.12, ease.outSoft);
            const fl = flight(q, p.tile.pos.clone().add(new THREE.Vector3(0, 0, 0.05 + 0.06 * hover)), to, p.f.w * (1 + 0.06 * hover * (1 - q)), body.w * CARD_W);
            // Worn: a short warm glow as it lands; then the blade takes it into the photo.
            const landed = seg(t, lift + 0.12 + tr.flight - 0.05, lift + 0.12 + tr.flight + 0.35, ease.outSoft);
            // Light warmth only, so a white shirt still reads white in flight.
            const heat = q < 1 ? 0.1 + 0.25 * Math.sin(Math.PI * q) : 0.25 * (1 - landed);
            const absorbed = seg(u, body.u - 0.06, body.u + 0.1, ease.inOut);
            return <Card key={`w${i}`} src={p.pc.src} w={fl.w} h={fl.w / p.pc.aspect} position={fl.pos} renderOrder={12 + k} opacity={fade * hover * (1 - absorbed)} tint={heatTint(heat)} />;
          }),
        )}
        {[{b: b1, u: u1}, {b: b2, u: u2}].map(({b, u}, k) =>
          b.on ? (
            <LightBlade key={`l${k}`} top={new THREE.Vector3(YOU.x - CARD_W / 2 + u * CARD_W, YOU.y + CARD_H / 2 + 0.18, YOU.z + 0.07)} bottom={new THREE.Vector3(YOU.x - CARD_W / 2 + u * CARD_W, YOU.y - CARD_H / 2 - 0.22, YOU.z + 0.07)} time={t} to={b.to} intensity={fade} seed={19 + k} />
          ) : null,
        )}
        {gather < 1
          ? credits.map((c, k) => {
              if (c.o <= 0.002) return null;
              const tt = credit(c.s);
              return <TexPlane key={`k${k}`} tex={tt.tex} w={tt.wPx * 0.0092} h={tt.hPx * 0.0092} position={c.at.clone().add(new THREE.Vector3(0, -CARD_H / 2 - 0.32, 0))} opacity={c.o * fade * (1 - gather)} />;
            })
          : null}
      </group>
      {/* Pieces in flight (world space): from the screenshot, the person and the outfit photo to their tiles. */}
      {pieces.map((p) => {
        if (p.pc.from === "pre" || p.q >= 1) return null;
        // Lifted out where it was found, then flown home.
        const lift = p.pc.lift ?? p.pc.at - 0.12;
        if (t < lift) return null;
        const hover = p.q <= 0 ? seg(t, lift, lift + 0.3, ease.outSoft) : 1;
        const fl = flight(p.q, p.from.clone().add(WD).add(new THREE.Vector3(0, 0.06 * hover, 0.12 * hover)), toWorld(p.tile.pos), p.w0, p.f.w * scale);
        const appear = seg(t, lift, lift + 0.2, ease.outSoft);
        return <Card key={`f${p.i}`} src={p.pc.src} w={fl.w} h={fl.w / p.pc.aspect} position={fl.pos} renderOrder={11} opacity={appear * fade} tint={heatTint(0.55 * Math.sin(Math.PI * p.q))} />;
      })}
    </group>
  );
};

export const WARDROBE_TIMES = {S, TRY1, TRY2};
