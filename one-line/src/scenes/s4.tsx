import React, {useMemo} from "react";
import * as THREE from "three";
import {fonts} from "../fonts";
import {LINE_R} from "../looks";
import {CLIP_SECONDS, M} from "../../pictures";
import {at as cueAt, clamp01, ease, life, seg} from "../timing";
import {Card, TexPlane, useTexture} from "../world/Card";
import {GoldLine, Path} from "../world/Line";
import {GOLD, rng} from "../world/space";
import {camAt, float, LineTrack, type CamKey} from "../world/track";
import {makeButtonTexture, makeTextTexture, type TextSpec} from "../world/Type";
import {VideoCard} from "../world/Video";
import {HERO, HERO_H, HERO_POS, HERO_W, heroMedia, PUSH_D} from "./s3";
import {inFront} from "./s1/camera";
import {S5_FIRST} from "./seams";
import type {Scene} from "./types";

/**
 * S4 · the living template (C4). The card opens and its gold threads wind
 * into a helix. A cream paper interlude: the title card of the piece, in
 * the product's own light theme. The threads learn its movement, rhythm,
 * atmosphere and visual language, then wrap your photo, your product and
 * your story, and each becomes a film.
 */

const H = HERO_POS;
const T = {
  start: 115,
  living: cueAt("c4.1"),
  preset: cueAt("c4.2"),
  vision: cueAt("c4.3"),
  movement: cueAt("c4.4"),
  rhythm: cueAt("c4.5"),
  atmosphere: cueAt("c4.6"),
  language: cueAt("c4.7"),
  photo: cueAt("c4.8"),
  product: cueAt("c4.9"),
  story: cueAt("c4.10"),
  end: 142.5,
};

// ------------------------------------------------------------------ helix

const AXIS_A = H.clone().add(new THREE.Vector3(1.4, 0.1, -0.4));
const AXIS_B = H.clone().add(new THREE.Vector3(15.5, 0.9, -4.5));
const helixAt = (u: number, phase: number, R = 0.85, turns = 5.5) => {
  const p = AXIS_A.clone().lerp(AXIS_B, u);
  const ax = AXIS_B.clone().sub(AXIS_A).normalize();
  const n1 = new THREE.Vector3(0, 1, 0).sub(ax.clone().multiplyScalar(ax.y)).normalize();
  const n2 = ax.clone().cross(n1).normalize();
  const a = u * turns * Math.PI * 2 + phase;
  const r = R * (0.35 + 0.65 * Math.min(1, u * 6));
  return p.add(n1.multiplyScalar(Math.cos(a) * r)).add(n2.multiplyScalar(Math.sin(a) * r));
};

const useHelix = () =>
  useMemo(() => {
    const n = 520;
    const strands = [0, Math.PI].map((ph) => {
      const p = new Path();
      // Out of the card's right edge, then into the helix.
      p.pts.push(H.clone().add(new THREE.Vector3(HERO_W / 2, ph === 0 ? 0.6 : -0.6, 0.02)));
      p.smooth([H.clone().add(new THREE.Vector3(HERO_W / 2 + 0.5, ph === 0 ? 0.35 : -0.35, -0.1)), helixAt(0, ph)], 30);
      for (let i = 1; i <= n; i++) p.pts.push(helixAt(i / n, ph));
      return p.pts;
    });
    const rungs: Array<{a: THREE.Vector3; b: THREE.Vector3; u: number}> = [];
    for (let i = 4; i < 70; i++) {
      const u = i / 70;
      rungs.push({a: helixAt(u, 0), b: helixAt(u, Math.PI), u});
    }
    return {strands, rungs};
  }, []);

// ------------------------------------------------------------------ the title card (light theme = cream paper)

const drawTitleCard = (button: HTMLCanvasElement) => {
  const W = 760;
  const Hh = 980;
  const ss = 2;
  const c = document.createElement("canvas");
  c.width = W * ss;
  c.height = Hh * ss;
  const g = c.getContext("2d")!;
  g.scale(ss, ss);
  // Light canvas oklch(97% .012 95), radius 28; faint paper grain.
  g.fillStyle = "#F7F4EC";
  g.beginPath();
  g.roundRect(0, 0, W, Hh, 28);
  g.fill();
  const r = rng(5);
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = `rgba(60,50,30,${0.015 + r() * 0.03})`;
    g.fillRect(r() * W, r() * Hh, 1, 1);
  }
  const ink = "#1C1A15";
  const silver = "#4D493F";
  const stone = "#77736A";
  const line = "#D3CFC4";
  let y = 64;
  g.textBaseline = "alphabetic";
  g.fillStyle = stone;
  g.font = `500 17px "${fonts.mono}"`;
  (g as unknown as {letterSpacing: string}).letterSpacing = "2px";
  g.fillText("MADE BY YOU  ·  PRODUCT AD", 48, y);
  (g as unknown as {letterSpacing: string}).letterSpacing = "0px";
  y += 86;
  g.fillStyle = ink;
  g.font = `600 92px "${fonts.caps}"`;
  g.fillText("TIMELESS RADIANCE", 46, y);
  y += 52;
  // You bring → You get
  g.font = `400 21px "${fonts.ui}"`;
  g.fillStyle = silver;
  g.fillText("You bring", 48, y);
  g.fillText("You get", 400, y);
  y += 34;
  g.fillStyle = ink;
  g.font = `600 27px "${fonts.ui}"`;
  g.fillText("Your product photo", 48, y);
  g.fillText("A 15 s ad film", 400, y);
  g.strokeStyle = silver;
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(312, y - 9);
  g.lineTo(368, y - 9);
  g.moveTo(358, y - 17);
  g.lineTo(368, y - 9);
  g.lineTo(358, y - 1);
  g.stroke();
  y += 44;
  g.font = `400 21px "${fonts.ui}"`;
  g.fillStyle = silver;
  g.fillText("15 s  ·  Vertical  ·  Sound on", 48, y);
  // Film palette
  ["#e3e0d2", "#013641", "#bd9075"].forEach((col, i) => {
    g.fillStyle = col;
    g.beginPath();
    g.arc(560 + i * 50, y - 8, 17, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = line;
    g.lineWidth = 1.5;
    g.stroke();
  });
  y += 40;
  g.strokeStyle = line;
  g.beginPath();
  g.moveTo(48, y);
  g.lineTo(W - 48, y);
  g.stroke();
  y += 60;
  const section = (title: string, body: string[]) => {
    g.fillStyle = ink;
    g.font = `600 25px "${fonts.ui}"`;
    g.fillText(title, 48, y);
    y += 42;
    g.fillStyle = silver;
    g.font = `400 24px "${fonts.ui}"`;
    body.forEach((l) => {
      g.fillText(l, 48, y);
      y += 37;
    });
    y += 30;
  };
  section("How it was made", ["The stone's teal becomes the colour of the whole film.", "Diagonal colour blocks, close-ups of the ring and", "earrings, and a model carry a quiet luxury campaign."]);
  section("Where it works", ["Jewelry brand  ·  Instagram Reels  ·  E-commerce product page"]);
  // The button in the light theme: brand teal, ivory label, a small icon.
  const bx = 48;
  const bw = W - 96;
  const bh = 80;
  const by = Hh - 56 - bh;
  g.fillStyle = "#005E58";
  g.beginPath();
  g.roundRect(bx, by, bw, bh, 24);
  g.fill();
  g.font = `600 27px "${fonts.ui}"`;
  const label = "Make it mine";
  const tw = g.measureText(label).width;
  const icon = 27;
  const x0 = bx + (bw - (icon + 14 + tw)) / 2;
  g.save();
  g.translate(x0, by + (bh - icon) / 2);
  g.scale(icon / 24, icon / 24);
  g.strokeStyle = "#FBF9F3";
  g.lineWidth = 2;
  g.lineCap = "round";
  g.lineJoin = "round";
  ["m18 14 4 4-4 4", "m18 2 4 4-4 4", "M2 18h1.973a4 4 0 0 0 3.3-1.7l5.454-8.6a4 4 0 0 1 3.3-1.7H22", "M2 6h1.972a4 4 0 0 1 3.6 2.2", "M22 18h-6.041a4 4 0 0 1-3.3-1.8l-.359-.45"].forEach((d) => g.stroke(new Path2D(d)));
  g.restore();
  g.fillStyle = "#FBF9F3";
  g.textBaseline = "middle";
  g.fillText(label, x0 + icon + 14, by + bh / 2 + 1);
  g.textBaseline = "alphabetic";
  g.fillStyle = stone;
  g.font = `400 19px "${fonts.ui}"`;
  g.textAlign = "center";
  g.fillText("Add your product photo; we'll take it from there.", W / 2, Hh - 22);
  g.textAlign = "left";
  void button;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.anisotropy = 8;
  return {tex, w: W, h: Hh};
};

// ------------------------------------------------------------------ camera

export const S4_KEYS: CamKey[] = [
  {t: T.start, pos: [H.x, H.y, H.z + PUSH_D], look: [H.x, H.y, H.z]},
  {t: T.living + 0.3, pos: [H.x + 0.3, H.y + 0.05, H.z + PUSH_D + 0.35], look: [H.x + 0.2, H.y, H.z]},
  {t: T.preset - 0.2, pos: [H.x + 3.2, H.y + 0.6, H.z + 10.5], look: [H.x + 3.6, H.y + 0.2, H.z - 1.0], ease: ease.glide},
  {t: T.vision, pos: [H.x + 3.6, H.y + 0.5, H.z + 9.6], look: [H.x + 3.9, H.y + 0.2, H.z - 1.0], ease: ease.linear},
  {t: T.language + 0.8, pos: [H.x + 7.6, H.y + 1.3, H.z + 7.2], look: [H.x + 8.6, H.y + 0.5, H.z - 2.4], ease: ease.glide},
  {t: T.photo + 0.4, pos: [H.x + 9.2, H.y + 0.6, H.z + 5.6], look: [H.x + 9.6, H.y + 0.5, H.z - 2.6], ease: ease.glide},
  {t: T.story + 1.2, pos: [H.x + 9.6, H.y + 0.55, H.z + 4.9], look: [H.x + 9.7, H.y + 0.5, H.z - 2.6], ease: ease.linear},
  {t: T.end, pos: [H.x + 13.5, H.y + 0.2, H.z + 6.4], look: [H.x + 17, H.y - 0.3, H.z - 4]},
];
const KEYS: CamKey[] = [...S4_KEYS, S5_FIRST];
export const s4Camera = (t: number) => float(camAt(KEYS, t), t, 0.03);

// ------------------------------------------------------------------ world

const LABELS: Array<{text: string; at: number; u: number; side: 1 | -1}> = [
  {text: "movement", at: T.movement, u: 0.3, side: 1},
  {text: "rhythm", at: T.rhythm, u: 0.4, side: -1},
  {text: "atmosphere", at: T.atmosphere, u: 0.5, side: 1},
  {text: "visual language", at: T.language, u: 0.6, side: -1},
];
const labelSpec = (s: string): TextSpec => ({lines: [s], font: `italic 400 "${fonts.serif}"`, size: 64, color: "#F3EDE3"});

/** Where the photo sits inside the helix. */
const NEST = helixAt(0.58, 0).lerp(helixAt(0.58, Math.PI), 0.5).add(new THREE.Vector3(0, 0, 0.6));

const SWAPS = [
  {at: T.photo + 0.2, src: M.yourPhoto.src, aspect: M.yourPhoto.aspect, film: M.hero, filmAt: T.photo + 1.9},
  {at: T.product, src: M.yourProduct.src, aspect: M.yourProduct.aspect, film: M.product, filmAt: T.product + 0.55},
  {at: T.story, src: M.yourPortrait.src, aspect: 1, film: M.editorial, filmAt: T.story + 0.5},
];

const World: React.FC<{t: number}> = ({t}) => {
  const {strands, rungs} = useHelix();
  const button = useMemo(() => {
    const b = makeButtonTexture("Make it mine", fonts.ui, 3 * 1.2, {bg: "#005E58", fg: "#FBF9F3"});
    return b.tex.image as HTMLCanvasElement;
  }, []);
  const titleCard = useMemo(() => drawTitleCard(button), [button]);
  const portrait = useTexture(M.yourPortrait.src);
  void portrait;

  // The card: full frame, then it eases back and turns a little as the threads leave it.
  const back = seg(t, T.living - 0.2, T.preset - 0.3, ease.inOut);
  const cardGone = seg(t, T.vision + 1.0, T.movement + 0.6, ease.inOut);
  const cardPos = H.clone().add(new THREE.Vector3(-0.4 * back, 0, -1.2 * back));
  const draw = seg(t, T.living + 0.3, T.preset + 0.4, ease.glide);
  const unwind = seg(t, T.story + 1.3, T.end - 0.6, ease.in);

  // The paper interlude.
  const paperIn = seg(t, T.preset - 0.25, T.preset + 0.5, ease.out);
  const paperOut = seg(t, T.vision - 0.35, T.vision + 0.35, ease.in);
  // Held in front of the lens while it is read; slides up from below, leaves upward.
  const camNow = s4Camera(t);
  const front = inFront(camNow, 7.2);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(front.q);
  const paperPos = front.pos.clone().add(up.multiplyScalar(-8 * (1 - paperIn) + 8 * paperOut));
  const paperRot = new THREE.Euler().setFromQuaternion(front.q.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -0.05, 0.012 * (1 - paperIn))))).toArray().slice(0, 3) as [number, number, number];
  const paperH = 4.55;

  // The photo nest: arrives, gets wrapped, becomes a film; then a product; then a story.
  const swapIdx = t >= SWAPS[2].at ? 2 : t >= SWAPS[1].at ? 1 : 0;
  const sw = SWAPS[swapIdx];
  // A soft bell: the card turns edge-on and back with no corner in its speed.
  const flip = (k: number) => 0.5 + 0.5 * Math.cos(Math.PI * clamp01(Math.abs(t - SWAPS[k].at) / 0.3));
  const flipY = swapIdx > 0 ? Math.PI * 0.5 * flip(swapIdx) : 0;
  const nestIn = seg(t, T.photo - 0.2, T.photo + 0.9, ease.out);
  const nestH = 3.0;
  const nestW = Math.min(nestH * sw.aspect, nestH * 0.8);
  const filmK = seg(t, sw.filmAt, sw.filmAt + 0.6, ease.inOut);
  const nestPos = NEST.clone().add(new THREE.Vector3(0, 0, -6 * (1 - nestIn)));
  const wrap = useMemo(() => {
    // A rectangular coil of thread closing round the photo.
    const p = new Path();
    const turns = 3;
    for (let i = 0; i <= turns * 4 * 12; i++) {
      const u = i / (turns * 4 * 12);
      const q = u * turns * Math.PI * 2;
      const rr = 1.0 - 0.18 * u;
      const x = Math.sign(Math.cos(q)) * Math.pow(Math.abs(Math.cos(q)), 0.25) * (nestW / 2 + 0.25) * rr;
      const y = Math.sign(Math.sin(q)) * Math.pow(Math.abs(Math.sin(q)), 0.25) * (nestH / 2 + 0.25) * rr;
      p.pts.push(NEST.clone().add(new THREE.Vector3(x, y, 0.05 + Math.sin(q * 2) * 0.08)));
    }
    return new LineTrack([{pts: p.pts, t0: T.photo + 0.6, t1: T.photo + 1.9, ease: ease.inOut, turnCost: 0.0}]);
  }, [nestW]);

  return (
    <group>
      {/* The card we pushed into. */}
      {cardGone < 1 ? (
        <VideoCard src={HERO.video} poster={HERO.poster} time={heroMedia(t)} duration={CLIP_SECONDS} w={HERO_W} h={HERO_H} position={cardPos} rotation={[0, -0.32 * back, 0]} corner={0.08} opacity={1 - cardGone} rim={0.5 * back * (1 - cardGone)} rimWidth={0.015} />
      ) : null}
      {/* The helix: two threads and their rungs. */}
      {strands.map((pts, i) => (
        <GoldLine key={i} pts={pts} progress={draw} start={unwind} radius={LINE_R * 0.75} pen={draw < 1 ? 0.8 : 0} sparks={3} seed={i + 40} />
      ))}
      {rungs.map((r, i) =>
        draw > r.u + 0.04 && unwind < r.u ? (
          <GoldLine key={`r${i}`} pts={[r.a, r.b]} progress={seg(draw, r.u + 0.04, r.u + 0.12, ease.out)} radius={0.0035} color={GOLD.line.clone().multiplyScalar(0.55)} pen={0} />
        ) : null,
      )}
      {/* What the agent reads: born on the threads with each word. */}
      {LABELS.map((l, i) => {
        const tt = makeTextTexture(labelSpec(l.text));
        const born = seg(t, l.at - 0.05, l.at + 0.45, ease.outSoft);
        const gone = seg(t, T.photo - 0.2, T.photo + 0.6, ease.in);
        if (born <= 0 || gone >= 1) return null;
        const anchor = helixAt(l.u, l.side > 0 ? 0 : Math.PI);
        const pos = anchor.clone().add(new THREE.Vector3(0.25, l.side * 1.35, 0.4));
        const k = 0.0068;
        return (
          <group key={i}>
            <GoldLine pts={[anchor, pos.clone().add(new THREE.Vector3(-0.05, -l.side * 0.28, 0))]} progress={born} radius={0.003} color={GOLD.line.clone().multiplyScalar(0.6)} pen={0} opacity={1 - gone} />
            <TexPlane tex={tt.tex} w={tt.wPx * k * (0.95 + 0.05 * born)} h={tt.hPx * k * (0.95 + 0.05 * born)} position={pos.clone().add(new THREE.Vector3((tt.wPx / 2 - tt.padPx) * k, 0, 0))} opacity={born * (1 - gone)} renderOrder={30} />
          </group>
        );
      })}
      {/* The original vision keeps playing small beside the threads. */}
      {t > T.vision && t < T.photo + 0.8 ? (
        <VideoCard src={HERO.video} poster={HERO.poster} time={t - 100 + (HERO.t0 ?? 0)} w={1.0} h={1.5} position={helixAt(0.22, 0).add(new THREE.Vector3(-0.6, -1.9, 0.4))} corner={0.05} opacity={life(t, T.vision + 0.4, T.photo + 0.6, 0.5, 0.5)} rim={0.4} rimWidth={0.01} />
      ) : null}
      {/* Cream paper: the title card. */}
      {paperIn > 0 && paperOut < 1 ? <TexPlane tex={titleCard.tex} w={(paperH * titleCard.w) / titleCard.h} h={paperH} position={paperPos} rotation={paperRot} renderOrder={50} /> : null}
      {/* Your photo, your product, your story. */}
      {nestIn > 0 && unwind < 0.95 ? (
        <group position={nestPos} rotation={[0, flipY, 0]}>
          <Card src={sw.src} w={nestW} h={nestH} position={[0, 0, 0]} corner={0.06} matte={1} opacity={(1 - filmK) * (1 - unwind)} renderOrder={12} />
          {filmK > 0 ? <VideoCard src={sw.film.video} poster={sw.film.poster} time={t - sw.filmAt} w={nestW} h={nestH} position={[0, 0, 0.01]} corner={0.06} opacity={filmK * (1 - unwind)} rim={0.6} rimWidth={0.012} renderOrder={13} /> : null}
        </group>
      ) : null}
      {t > T.photo + 0.6 ? <GoldLine pts={wrap.pts} progress={wrap.progressAt(t)} start={seg(t, T.photo + 2.2, T.product, ease.in)} radius={LINE_R * 0.6} pen={t < T.photo + 1.95 ? 0.8 : 0} sparks={3} /> : null}
    </group>
  );
};

export const S4: Scene = {
  id: "s4",
  from: T.start,
  to: T.end,
  camera: s4Camera,
  World,
  dust: 0.6,
};

export const S4_TIMES = T;
export const S4_EXIT = AXIS_B;
