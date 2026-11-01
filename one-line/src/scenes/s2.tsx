import React, {useMemo} from "react";
import * as THREE from "three";
import {AbsoluteFill, Easing} from "remotion";
import {fonts} from "../fonts";
import {LINE_R, WARM_WHITE} from "../looks";
import {M} from "../../pictures";
import {at as cueAt, clamp01, ease, end as cueEnd, life, seg} from "../timing";
import {TexPlane} from "../world/Card";
import {useLoaded} from "../world/loader";
import {haloTexture} from "../world/Line";
import {GoldLine, Path, Pen} from "../world/Line";
import {camAt, float, LineTrack, type CamKey} from "../world/track";
import {makeTextTexture, type TextSpec} from "../world/Type";
import {splitWord, type Glyph} from "../world/Glyphs";
import {Dust, erosionField, flightBetween, flightInto, inkPoints} from "../world/Dust";
import {GatherWord, gatherLayout, type GlyphState} from "../world/GatherWord";
import {CAM_Z} from "../world/space";
import {T as T1} from "./s1/common";
import {drawComposer, CH, CW, KC} from "./s1/Turn";
import type {Scene} from "./types";

/**
 * S2 · the plan (C2, second half). Out of the white of the cursor the real
 * PlanCard opens: what the agent understood, before anything is made. The
 * tools it picked show for a breath and fold away. "You approve." The line
 * circles "Approve and create" and the card fills with light. Three sentences
 * are struck through by one stroke each; all that is left is the composer.
 */

export const O2 = new THREE.Vector3(0, 0, -400);
const S = 2.15; // product px → film px
const K = KC; // film px → world (camera at ~CAM_Z·0.92 frames 1:1)

const T = {
  open: T1.diveEnd,
  tools: cueAt("c2.10"),
  plan: cueAt("c2.11"),
  approve: cueAt("c2.12"),
  rest: cueAt("c2.13"),
  no1: cueAt("c2.14"),
  no2: cueAt("c2.15"),
  no3: cueAt("c2.16"),
  imagine: cueAt("c2.17"),
  conversation: cueAt("c2.18"),
  out: 90,
};

// ------------------------------------------------------------------ the plan card

const PLAN_HERO: PlanContent = {
  facts: ["Timeless Radiance", "15 s", "With sound"],
  brief: [
    "The stone's petrol blue becomes the film's colour, set in diagonal blocks of cream and peach.",
    "Eleven shots cut to music; the close-ups go to the earrings and the ring.",
    "The slogan is written on screen: Timeless Radiance.",
  ],
};

export type PlanContent = {facts: string[]; brief: string[]};
export type CardLayout = {tex: THREE.CanvasTexture; w: number; h: number; approve: {x: number; y: number; w: number; h: number}; toolsY: number; canvas: HTMLCanvasElement};

export const drawPlan = (thumb: HTMLImageElement | null, PLAN: PlanContent = PLAN_HERO, withTools = true): CardLayout => {
  const W = 430 * S;
  const pad = 16 * S;
  const c = document.createElement("canvas");
  const ctx0 = c.getContext("2d")!;
  // Wrap the brief at the card width (13px, line-height 1.6, padding-left 18).
  ctx0.font = `400 ${13 * S}px "${fonts.ui}"`;
  const maxW = W - pad * 2 - 18 * S;
  const lines: string[][] = PLAN.brief.map((b) => {
    const words = b.split(" ");
    const out: string[] = [];
    let cur = "";
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (ctx0.measureText(next).width > maxW && cur) {
        out.push(cur);
        cur = w;
      } else cur = next;
    }
    out.push(cur);
    return out;
  });
  const lh = 13 * 1.6 * S;
  const headerH = 64 * S;
  const gap = 14 * S;
  const briefH = lines.reduce((a, l) => a + l.length * lh, 0) + 8 * S * (lines.length - 1);
  const detailH = 18 * S;
  const toolsH = withTools ? 22 * S : 0;
  const btnH = 44 * S;
  const H = pad + headerH + gap + briefH + gap + detailH + gap + toolsH + gap + btnH + pad;
  const ss = 2;
  c.width = W * ss;
  c.height = H * ss;
  const g = c.getContext("2d")!;
  g.scale(ss, ss);
  // .card: canvas bg, 1px line border, radius 18.
  g.fillStyle = "#181818";
  g.strokeStyle = "#353535";
  g.lineWidth = S;
  g.beginPath();
  g.roundRect(S / 2, S / 2, W - S, H - S, 18 * S);
  g.fill();
  g.stroke();
  let y = pad;
  // header: thumb 52×64 r10, title 14/600 ink, facts 12 silver.
  if (thumb) {
    g.save();
    g.beginPath();
    g.roundRect(pad, y, 52 * S, 64 * S, 10 * S);
    g.clip();
    const ar = thumb.width / thumb.height;
    const tw = 52 * S;
    const th = 64 * S;
    const dw = ar > tw / th ? th * ar : tw;
    const dh = ar > tw / th ? th : tw / ar;
    g.drawImage(thumb, pad + (tw - dw) / 2, y + (th - dh) / 2, dw, dh);
    g.restore();
  }
  const tx = pad + 52 * S + 12 * S;
  g.fillStyle = "#EBEBEB";
  g.font = `600 ${14 * S}px "${fonts.ui}"`;
  g.textBaseline = "alphabetic";
  g.fillText("Production plan", tx, y + 27 * S);
  g.fillStyle = "#C4C4C4";
  g.font = `400 ${12 * S}px "${fonts.ui}"`;
  g.fillText(PLAN.facts.join(" · "), tx, y + 46 * S);
  y += headerH + gap;
  // brief: disc list, 13px silver.
  g.font = `400 ${13 * S}px "${fonts.ui}"`;
  lines.forEach((ls) => {
    g.beginPath();
    g.arc(pad + 6 * S, y + lh / 2 + 1 * S, 2.2 * S, 0, Math.PI * 2);
    g.fillStyle = "#C4C4C4";
    g.fill();
    ls.forEach((l) => {
      g.fillText(l, pad + 18 * S, y + lh * 0.72);
      y += lh;
    });
    y += 8 * S;
  });
  y += gap - 8 * S;
  // details summary, 12px silver.
  g.font = `400 ${12 * S}px "${fonts.ui}"`;
  g.fillStyle = "#C4C4C4";
  g.fillText("▸  Exact instruction sent to the model", pad, y + 13 * S);
  y += detailH + gap;
  const toolsY = y + toolsH / 2;
  y += toolsH + (withTools ? gap : 0);
  // actions: grid 1fr auto, gap 8. Primary: brand bg, on-brand 14/600, r12. Quiet: silver.
  g.font = `600 ${14 * S}px "${fonts.ui}"`;
  const cancelW = g.measureText("Cancel").width + 32 * S;
  const approveW = W - pad * 2 - cancelW - 8 * S;
  g.fillStyle = "#DEDEDE";
  g.beginPath();
  g.roundRect(pad, y, approveW, btnH, 12 * S);
  g.fill();
  g.fillStyle = "#0D0D0D";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("Approve and create", pad + approveW / 2, y + btnH / 2 + S);
  g.fillStyle = "#C4C4C4";
  g.font = `400 ${14 * S}px "${fonts.ui}"`;
  g.fillText("Cancel", W - pad - cancelW / 2, y + btnH / 2 + S);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.anisotropy = 8;
  return {tex, w: W, h: H, approve: {x: pad + approveW / 2 - W / 2, y: y + btnH / 2 - H / 2, w: approveW, h: btnH}, toolsY: toolsY - H / 2, canvas: c};
};

export const useImage = (src: string) =>
  useLoaded<HTMLImageElement>(`img ${src}`, () => new Promise((resolve) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.src = src;
  }));

// ------------------------------------------------------------------ pieces

/** px offsets from the card centre → world. */
const W2 = (x: number, y: number, z = 0) => new THREE.Vector3(O2.x + x * K, O2.y - y * K, O2.z + z);

const TOOLS = ["Veo 3.1", "Seedream 5", "Kling 3", "Nano Banana 2.1"];

// ------------------------------------------------------------------ "No …": dust

/**
 * Three burdens, one material. "No model hunting." gathers like the film's
 * other words; then each sentence burns away from the left at an ember edge,
 * and its ink rains down as fine gold dust that settles, texel by texel, into
 * the next sentence. On "Just your imagination." the last sentence's dust is
 * drawn into a single point, the pen, and on "And a conversation." the
 * composer is born around it.
 */
const NO = [
  {text: "No model hunting.", y: -190},
  {text: "No complicated pipelines.", y: 0},
  {text: "No prompt engineering required.", y: 190},
];
const noSpec = (s: string): TextSpec => ({lines: [s], font: `600 "${fonts.inter}"`, size: 108, color: WARM_WHITE, tracking: -0.03, ss: 2});
const SWEEP = 0.5;
const N = {
  gather: T.no1 - 0.15,
  set: T.no1 + 0.9, // glyphs → one plane (invisible swap)
  out: [T.no1 + 0.92, cueEnd("c2.15") - 0.4, cueEnd("c2.16") - 0.05],
  in: [0, T.no2 + 0.09, T.no3 - 0.05],
  f0: T.imagine - 0.05,
  f1: T.imagine + 0.85,
};
const CARET = W2(-CW / 2 + (12 + 36 + 13) * 2.3 - 6, 30, 0.02);
const PIVOT = CARET.clone().add(new THREE.Vector3(0, 0, 0.3));

const useNo = () =>
  useMemo(() => {
    const planes = NO.map((n, i) => {
      const tt = makeTextTexture(noSpec(n.text));
      const field = erosionField(tt, 11 + i * 7);
      const centre = W2(0, n.y, 0);
      const w = tt.wPx * K;
      const h = tt.hPx * K;
      return {tt, field, centre, w, h, ink: inkPoints(tt, field, centre, w, h, 1.5)};
    });
    // The first sentence gathers glyph by glyph; its word centre sits where the plane's ink is.
    const sw = splitWord(NO[0].text, noSpec(NO[0].text));
    const layout = gatherLayout(NO[0].text, noSpec(NO[0].text), sw.inkW * K);
    const tt0 = planes[0].tt;
    const off = new THREE.Vector3((tt0.wPx / 2 - tt0.padPx - sw.originX) * K, (tt0.padPx + tt0.ascent - tt0.hPx / 2 - sw.xHeight / 2) * K, 0);
    const gatherCentre = planes[0].centre.clone().sub(off);
    const flights = [
      flightBetween(planes[0].ink, planes[1].ink, N.out[0], N.in[1], SWEEP),
      flightBetween(planes[1].ink, planes[2].ink, N.out[1], N.in[2], SWEEP),
      flightInto(planes[2].ink, PIVOT, N.out[2], SWEEP, N.f0, N.f1),
    ];
    return {planes, layout, gatherCentre, flights};
  }, []);

// ------------------------------------------------------------------ "approve."

/**
 * Not a slam. The letters come out of depth as gold light, gather from wide
 * spacing into one word (outside in) while the card racks out of focus behind
 * them, and cool to warm white as they land. On "Your agent handles the rest."
 * the letters dive into "Approve and create" and the full stop becomes the
 * pen: it drops onto the button and circles it.
 */
const A = {gather: T.approve - 0.12, dock: T.rest - 0.02};
const APPROVE_SPEC: TextSpec = {lines: ["approve."], font: `600 "${fonts.inter}"`, size: 220, color: WARM_WHITE, tracking: -0.045, ss: 2};
const WORD_W = 5.0; // ink width, world units
const WORD_Y = 0.2;
const WORD_Z = 4.0; // in front of the card
// Where each glyph sets off from (beyond its home spread ×2.3): y and depth.
const SCATTER = [0.55, -0.7, 0.35, 0.8, -0.45, 0.6, -0.75, 0.3].map((y, i) => ({y, z: [2.4, -1.9, 1.1, -2.6, 1.8, -1.2, 2.8, -0.8][i]}));
const DIVE = Easing.bezier(0.38, 0, 0.72, 0.3);
const LOOP_R = LINE_R * 0.8;
const PEN = (0.9 * LOOP_R) / 0.02;

const useApprove = (card: CardLayout) =>
  useMemo(() => {
    const layout = gatherLayout("approve.", APPROVE_SPEC, WORD_W);
    const {s} = layout;
    const a = card.approve;
    const c = W2(a.x, a.y, 0.03);
    const hw = (a.w / 2 + 14) * K;
    const hh = (a.h / 2 + 14) * K;
    const r = 26 * K;
    const R = c.x + hw;
    const L = c.x - hw;
    const top = c.y + hh;
    const bot = c.y - hh;
    // The word sits so its full stop hangs right above the button's right edge.
    const dot = layout.glyphs[layout.glyphs.length - 1];
    const centre = new THREE.Vector3(R - dot.inkX * s, O2.y + WORD_Y, O2.z + WORD_Z);
    const D = centre.clone().add(new THREE.Vector3(dot.inkX * s, dot.inkY * s, 0));
    const P = (x: number, y: number) => new THREE.Vector3(x, y, c.z);
    const p = new Path();
    p.pts.push(D.clone());
    // The drop: out of the word, down through depth, onto the right edge heading down.
    p.smooth([new THREE.Vector3(R + 0.12, D.y + (top - D.y) * 0.55, D.z + (c.z - D.z) * 0.72), P(R, top - r - 0.3)], 26);
    const join = p.pts.length - 1;
    p.lineTo(P(R, bot + r), 30);
    p.arc(P(R - r, bot + r), r, 0, -Math.PI / 2, 10);
    p.lineTo(P(L + r, bot), 30);
    p.arc(P(L + r, bot + r), r, -Math.PI / 2, -Math.PI, 10);
    p.lineTo(P(L, top - r), 30);
    p.arc(P(L + r, top - r), r, Math.PI, Math.PI / 2, 10);
    p.lineTo(P(R - r, top), 30);
    p.arc(P(R - r, top - r), r, Math.PI / 2, 0, 10);
    p.lineTo(P(R, top - r - 0.5), 30);
    let dropLen = 0;
    for (let i = 1; i <= join; i++) dropLen += p.pts[i].distanceTo(p.pts[i - 1]);
    const track = new LineTrack([{pts: p.pts, t0: A.dock + 0.05, t1: A.dock + 1.3, ease: ease.glide, turnCost: 0.12}]);
    const fracDrop = dropLen / track.length;
    let tJoin = track.end;
    for (let x = A.dock; x < track.end; x += 1 / 240)
      if (track.progressAt(x) >= fracDrop) {
        tJoin = x;
        break;
      }
    return {layout, s, centre, D, track, fracDrop, tJoin, c, hw};
  }, [card]);

type Approve = ReturnType<typeof useApprove>;

const ApproveWord: React.FC<{t: number; ap: Approve}> = ({t, ap}) => {
  if (t < A.gather || t > A.dock + 0.9) return null;
  const {layout, s, centre} = ap;
  const n = layout.glyphs.length;
  const exit = (i: number, g: Glyph, st: GlyphState) => {
    if (i === n - 1) {
      // The full stop ignites and hands over to the pen.
      st.heat = Math.max(st.heat, 1.3 * seg(t, A.dock - 0.22, A.dock, ease.in));
      st.opacity *= 1 - seg(t, A.dock - 0.04, A.dock + 0.1, ease.outSoft);
      return;
    }
    // The letters dive into "Approve and create".
    const d0 = A.dock + i * 0.028;
    const q = seg(t, d0, d0 + 0.44, DIVE);
    if (q <= 0) return;
    const target = new THREE.Vector3(ap.c.x + ((g.x * s) / (WORD_W / 2)) * ap.hw * 0.45, ap.c.y, ap.c.z + 0.02).sub(centre);
    st.pos.lerp(target, q);
    st.scale *= 1 - 0.8 * q * q;
    st.heat = Math.max(st.heat, q);
    st.opacity *= 1 - seg(t, d0 + 0.28, d0 + 0.44, ease.in);
  };
  return (
    <group>
      <GatherWord t={t} layout={layout} centre={centre} t0={A.gather} t1={A.dock} scatter={SCATTER} exit={exit} />
      {t > A.dock - 0.14 && ap.track.progressAt(t) <= 0 ? (
        <Pen position={ap.D.clone().add(new THREE.Vector3(0, 0, 0.06))} tangent={new THREE.Vector3(0, -1, 0)} size={PEN * seg(t, A.dock - 0.14, A.dock + 0.05, ease.out)} sparks={4} />
      ) : null}
    </group>
  );
};

// ------------------------------------------------------------------ camera

const KEYS: CamKey[] = [
  {t: T.open, pos: [O2.x, O2.y, O2.z + CAM_Z * 0.42], look: [O2.x, O2.y, O2.z]},
  {t: T.open + 1.1, pos: [O2.x + 0.2, O2.y + 0.1, O2.z + CAM_Z * 0.93], look: [O2.x, O2.y, O2.z], ease: ease.out},
  {t: T.approve - 0.2, pos: [O2.x - 0.4, O2.y + 0.2, O2.z + CAM_Z * 0.86], look: [O2.x, O2.y, O2.z], ease: ease.linear},
  {t: T.rest + 0.6, pos: [O2.x + 0.3, O2.y - 0.7, O2.z + CAM_Z * 0.78], look: [O2.x + 0.15, O2.y - 0.9, O2.z], ease: ease.glide},
  {t: T.no1 - 0.1, pos: [O2.x - 0.3, O2.y + 0.2, O2.z + CAM_Z * 1.0], look: [O2.x, O2.y, O2.z], ease: ease.glide},
  {t: T.imagine, pos: [O2.x + 0.25, O2.y - 0.1, O2.z + CAM_Z * 0.95], look: [O2.x, O2.y, O2.z], ease: ease.linear},
  {t: T.out, pos: [O2.x, O2.y, O2.z + CAM_Z * 0.92], look: [O2.x, O2.y, O2.z], stop: true},
];
const camera = (t: number) => float(camAt(KEYS, t), t, 0.03);

// ------------------------------------------------------------------ world

const World: React.FC<{t: number}> = ({t}) => {
  const thumb = useImage(M.yourPhoto.src);
  const card = useMemo(() => drawPlan(thumb), [thumb]);
  const no = useNo();
  const composer = useMemo(() => drawComposer("What would you like to create?"), []);

  const ap = useApprove(card);
  const loop = ap.track;
  const born = seg(t, T.open + 0.05, T.open + 1.0, ease.outSoft);
  const recede = seg(t, loop.end + 0.1, T.no1 - 0.1, ease.inOut);
  const cardOpacity = born * (1 - recede);
  const cardPos = W2(0, 0, -recede * 5);
  // Rack focus: the card goes soft and dark behind "approve.", sharp again as the letters dive in.
  const focus = seg(t, A.gather - 0.05, A.gather + 0.4, ease.outSoft) * (1 - seg(t, A.dock + 0.12, A.dock + 0.62, ease.inOut));

  // The tools the agent picked: shown for a breath, then folded away.
  const toolsOpen = seg(t, T.tools + 0.15, T.tools + 0.55, ease.out);
  const toolsFold = seg(t, T.tools + 1.5, T.tools + 2.1, ease.in);

  // The button takes the letters in (a warm pulse); the pen closes round it; the card warms.
  const press = life(t, A.dock + 0.3, A.dock + 1.0, 0.12, 0.55);
  const light = life(t, loop.end - 0.25, T.no1 - 0.3, 0.5, 0.9);
  const warm = new THREE.Color(1 + 0.14 * light, 1 + 0.05 * light, 1 - 0.06 * light);
  const btnShape = useMemo(() => {
    const w = card.approve.w * K;
    const h = card.approve.h * K;
    const r = 12 * S * K;
    const sh = new THREE.Shape();
    sh.moveTo(-w / 2 + r, -h / 2);
    sh.lineTo(w / 2 - r, -h / 2);
    sh.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
    sh.lineTo(w / 2, h / 2 - r);
    sh.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
    sh.lineTo(-w / 2 + r, h / 2);
    sh.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
    sh.lineTo(-w / 2, -h / 2 + r);
    sh.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
    return new THREE.ShapeGeometry(sh, 8);
  }, [card]);

  // The composer stays when everything else is gone.
  const compBorn = seg(t, T.conversation - 0.6, T.conversation + 0.3, ease.outSoft);
  const blink = t >= T.conversation + 0.3 && Math.floor((t - T.conversation) / 0.53) % 2 === 0;
  const compPos = W2(0, 30, 0);
  const caret = W2(-CW / 2 + (12 + 36 + 13) * 2.3 - 6, 30, 0.02);

  return (
    <group>
      {cardOpacity > 0 ? (
        <group>
          <TexPlane tex={card.tex} w={card.w * K} h={card.h * K} position={cardPos} opacity={cardOpacity} reveal={born} corner={18 * S * K} rim={1.1 * light} rimWidth={0.012} blur={0.075 * focus} dim={1 - 0.55 * focus} tint={warm} renderOrder={5} />
          {/* "Approve and create" takes the letters in: a warm pulse that keeps its label readable. */}
          {press > 0 ? (
            <mesh geometry={btnShape} position={W2(card.approve.x, card.approve.y, 0.01 - recede * 5)} scale={1 + 0.015 * press} renderOrder={6}>
              <meshBasicMaterial color={new THREE.Color(0.3, 0.18, 0.06)} transparent opacity={press} blending={THREE.AdditiveBlending} toneMapped={false} depthWrite={false} />
            </mesh>
          ) : null}
          {/* The card fills with light: a warm backlight round it (behind, so the button stays legible). */}
          {light > 0 ? (
            <sprite position={W2(card.approve.x * 0.5, card.approve.y * 0.4, -0.35 - recede * 5)} scale={[card.w * K * (1.2 + 1.2 * light), card.h * K * (1.1 + 1.3 * light), 1]} renderOrder={4}>
              <spriteMaterial map={haloTexture()} color={new THREE.Color(0.75, 0.45, 0.16)} opacity={light * 0.5 * (1 - recede)} blending={THREE.AdditiveBlending} depthWrite={false} transparent toneMapped={false} />
            </sprite>
          ) : null}
          {toolsOpen > 0 && toolsFold < 1
            ? TOOLS.map((n, i) => {
                const spec = (m: string): TextSpec => ({lines: [m.toUpperCase()], font: `500 "${fonts.mono}"`, size: 11 * S, color: "rgba(240,232,218,0.55)", tracking: 0.1});
                const tt = makeTextTexture(spec(n));
                const x = -card.w / 2 + 16 * S + TOOLS.slice(0, i).reduce((a, m) => a + makeTextTexture(spec(m)).wPx - makeTextTexture(spec(m)).padPx * 2 + 16 * S, 0);
                const fold = clamp01(toolsFold * 1.6 - (TOOLS.length - 1 - i) * 0.15);
                return (
                  <TexPlane key={n} tex={tt.tex} w={tt.wPx * K} h={tt.hPx * K * Math.max(0.02, 1 - fold)} position={W2(x + tt.wPx / 2 - tt.padPx, card.toolsY, 0.02)} opacity={toolsOpen * (1 - fold)} renderOrder={8} />
                );
              })
            : null}
        </group>
      ) : null}
      <ApproveWord t={t} ap={ap} />
      {t > loop.end - 1.25 && t < T.no1 ? (
        <GoldLine
          pts={loop.pts}
          progress={loop.progressAt(t)}
          start={ap.fracDrop * seg(t, ap.tJoin + 0.05, ap.tJoin + 0.5, ease.inOut)}
          radius={LOOP_R}
          pen={0.9 * (1 - seg(t, loop.end - 0.1, loop.end + 0.15, ease.in))}
          opacity={1 - recede}
          sparks={4}
        />
      ) : null}
      {/* "No …": the first sentence gathers; each one burns to dust that becomes the next. */}
      {t >= N.gather && t < N.set ? <GatherWord t={t} layout={no.layout} centre={no.gatherCentre} t0={N.gather} t1={N.set} seed={5} spread={1.35} depth={1.2} lift={0.8} /> : null}
      {no.planes.map((p, i) => {
        const inL = i === 0 ? 2 : (t - N.in[i]) / SWEEP;
        const outL = (t - N.out[i]) / SWEEP;
        const born = i === 0 ? t >= N.set : inL > -0.02;
        if (!born || outL > 1.05) return null;
        return <TexPlane key={i} tex={p.tt.tex} w={p.w} h={p.h} position={p.centre} erode={{map: p.field.tex, out: outL, in: inL, glow: 1.2}} renderOrder={20} />;
      })}
      {no.flights.map((f, i) => (
        <Dust key={i} flight={f} t={t} intensity={0.85} vortex={i === 2 ? {pivot: PIVOT, spin: -2.4} : undefined} />
      ))}
      {compBorn > 0 ? (
        <group>
          <TexPlane tex={composer} w={CW * K} h={CH * K} position={compPos} opacity={compBorn} reveal={compBorn} renderOrder={5} />
          <mesh position={caret} renderOrder={70}>
            <planeGeometry args={[0.032, 0.42]} />
            <meshBasicMaterial color={new THREE.Color(1.6, 1.45, 1.2)} transparent opacity={blink ? 1 : 0} toneMapped={false} />
          </mesh>
        </group>
      ) : null}
      {/* The dust becomes one point: the pen, then the composer's cursor. */}
      {t > N.f0 - 0.15 && t < T.conversation + 0.35 ? (
        <Pen position={PIVOT} size={0.62 * (0.2 + 0.8 * seg(t, N.f0 - 0.15, N.f1 + 0.1, ease.inOut)) * (1 - seg(t, T.conversation - 0.1, T.conversation + 0.35, ease.in))} breathe={t > N.f1 ? 1 : 0} sparks={t < N.f1 ? 3 : 0} />
      ) : null}
    </group>
  );
};

/** The white of the cursor, receding as the card opens. */
const Overlay: React.FC<{t: number}> = ({t}) => {
  const white = 1 - seg(t, T.open, T.open + 1.05, ease.outSoft);
  return <AbsoluteFill>{white > 0 ? <div style={{position: "absolute", inset: 0, background: "#FBF7EF", opacity: white}} /> : null}</AbsoluteFill>;
};

export const S2: Scene = {
  id: "s2",
  from: T.open,
  to: T.out,
  camera,
  World,
  Overlay,
  post: 6,
  dust: 0.45,
};

export const S2_COMPOSER = {pos: W2(0, 30, 0), caret: W2(-CW / 2 + (12 + 36 + 13) * 2.3 - 6, 30, 0.02)};
export {M as _M};
