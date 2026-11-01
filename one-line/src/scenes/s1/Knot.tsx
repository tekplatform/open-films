import React, {useMemo} from "react";
import * as THREE from "three";
import {fonts} from "../../fonts";
import {LINE_R, WARM_WHITE} from "../../looks";
import {clamp01, ease, lerp, seg} from "../../timing";
import {TexPlane} from "../../world/Card";
import {GatherWord, gatherLayout, type GlyphState} from "../../world/GatherWord";
import type {Glyph} from "../../world/Glyphs";
import {GoldLine, Path} from "../../world/Line";
import {makeTextTexture, type TextSpec} from "../../world/Type";
import {rng, TAN} from "../../world/space";
import {inFront, s1BaseCam} from "./camera";
import {ATTACK, T} from "./common";
import {RING_CENTRE} from "./Rings";

/**
 * C1: the rings collapse into a knot around the unfinished sentence. Each
 * discipline gathers on its word (the film's one-word family, quick here) and
 * then drifts back to hang from a strand of the knot; interface panels pile up
 * over the sentence; then everything stops.
 */

/**
 * Time that stands still between "Another learning curve." and the freed
 * thread, then runs on from where it stopped (it used to jump back to real
 * time at T.free: the knot snapped 16° and a half-open panel popped open).
 */
export const frozen = (t: number) => (t < T.still ? t : t < T.free ? T.still : t - (T.free - T.still));

// ------------------------------------------------------------------ knot

const makeKnot = () => {
  const r = rng(404);
  const out: Array<{pts: THREE.Vector3[]; t0: number; r: number; b: number}> = [];
  for (let i = 0; i < 30; i++) {
    const ctrl: THREE.Vector3[] = [];
    const loops = 5 + Math.floor(r() * 5);
    const ph = r() * Math.PI * 2;
    for (let k = 0; k <= loops; k++) {
      const q = ph + k * (1.9 + r() * 0.9);
      const rad = 0.6 + r() * 1.0;
      ctrl.push(new THREE.Vector3(1.2 + Math.cos(q) * rad * 2.9 + (r() - 0.5) * 1.0, 0.2 + Math.sin(q) * rad * 1.15 + (r() - 0.5) * 0.4, (r() - 0.5) * 3.6));
    }
    const p = new Path();
    p.pts.push(ctrl[0]);
    p.smooth(ctrl.slice(1), 12);
    out.push({pts: p.pts, t0: T.collapse + 0.4 + r() * 3.6, r: 0.004 + r() * 0.0045, b: 0.2 + r() * 0.32});
  }
  return out;
};

export const Knot: React.FC<{t: number}> = ({t}) => {
  const strands = useMemo(makeKnot, []);
  const tf = frozen(t);
  if (t < T.collapse) return null;
  const tighten = 1 - 0.14 * seg(tf, T.allAtOnce, T.allAtOnce + 1.2, ease.out);
  const rot = (tf - T.collapse) * 0.035;
  const undraw = seg(t, T.free + 0.2, T.free + 3.2, ease.in);
  const fade = 1 - seg(t, T.free + 1.6, T.just + 0.6, ease.in);
  if (fade <= 0) return null;
  // The knot dims a little while a word gathers, so the word reads clean.
  const dip = 1 - 0.35 * Math.max(...T.slams.map((ts) => Math.min(seg(t, ts - 0.3, ts, ease.outSoft), 1 - seg(t, ts + 0.35, ts + 0.95, ease.inOut))));
  return (
    <group position={[1.0, 0.2, 0]} rotation={[0, rot, 0]} scale={[tighten, tighten, tighten]}>
      <group position={[-1.0, -0.2, 0]}>
        {strands.map((s, i) => (
          <GoldLine
            key={i}
            pts={s.pts}
            progress={seg(tf, s.t0, s.t0 + 1.6, ease.out)}
            start={undraw}
            radius={s.r}
            color={ATTACK.clone().multiplyScalar(s.b * fade * dip)}
            pen={tf < s.t0 + 1.6 ? 0.25 : 0}
            sparks={0}
          />
        ))}
      </group>
    </group>
  );
};

// ------------------------------------------------------------------ slams

const WORDS = [
  {text: "PROMPT ENGINEERING", hang: new THREE.Vector3(-1.4, 1.75, -1.2), w: 3.4, yaw: 0.22},
  {text: "FILMMAKING", hang: new THREE.Vector3(3.9, 1.55, 0.6), w: 2.3, yaw: -0.3},
  {text: "DESIGN", hang: new THREE.Vector3(-0.6, -1.25, 1.3), w: 1.4, yaw: 0.18},
  {text: "EDITING", hang: new THREE.Vector3(4.2, -1.15, -1.6), w: 1.7, yaw: -0.25},
  {text: "PRODUCTION PIPELINES", hang: new THREE.Vector3(1.6, -2.15, -0.4), w: 3.6, yaw: 0.05},
];

// Now they gather like "talk." / "approve." / "mine.", quicker, smaller and lighter.
const wordSpec = (text: string): TextSpec => ({lines: [text], font: `600 "${fonts.inter}"`, size: 160, color: "#E9E2D6", tracking: -0.03, ss: 2});

/** Each word starts gathering this long before its spoken word, and is read on it. */
const LEAD = 0.3;
const GATHER = {dur: 0.5, stagger: 0.018};
/** The drift back into the knot. */
const FLY0 = 0.35;
const FLY1 = 1.25;

const Slam: React.FC<{t: number; i: number}> = ({t, i}) => {
  const word = WORDS[i];
  const ts = T.slams[i];
  // Laid out one world unit wide; the group scales it.
  const layout = useMemo(() => gatherLayout(word.text, wordSpec(word.text), 1), [word.text]);
  const aspect = useMemo(() => makeTextTexture(wordSpec(word.text)), [word.text]);
  const tf = frozen(t);
  if (t < ts - LEAD) return null;
  const capK = aspect.hPx / aspect.wPx;
  // Close to the lens while it gathers, then it drifts back to hang in the knot.
  const d = 3.2;
  const cam = s1BaseCam(t);
  const near = inFront(cam, d);
  const frameW = 2 * d * TAN * (16 / 9);
  // Short words a touch larger per letter, so the type size stays close across the five.
  const n = word.text.length;
  const wNear = frameW * Math.min(0.62, 0.036 * n * (1 + 0.4 * (1 - n / 20)));
  const fly = seg(t, ts + FLY0, ts + FLY1, ease.glide);
  const tighten = 1 - 0.14 * seg(tf, T.allAtOnce, T.allAtOnce + 1.2, ease.out);
  const hang = word.hang.clone().sub(new THREE.Vector3(1.0, 0.2, 0)).multiplyScalar(tighten).add(new THREE.Vector3(1.0, 0.2, 0));
  const pos = near.pos.clone().lerp(hang, fly);
  const qHang = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, word.yaw, 0));
  const q = near.q.clone().slerp(qHang, fly);
  const w = Math.exp(lerp(Math.log(wNear), Math.log(word.w), fly));
  const fade = 1 - seg(t, T.free + 0.4, T.free + 2.0, ease.in);
  // Near the lens the letters draw after the knot's lines (55), or their soft, blurred planes would
  // hide the lines behind them as dark squares; once hung in the knot they sort by depth again.
  const exit = (_i: number, _g: Glyph, st: GlyphState) => {
    st.opacity *= fade;
  };
  const top = hang.clone().add(new THREE.Vector3(0, (word.w * capK) / 2 + 0.06, 0).applyQuaternion(qHang));
  const thread = [top.clone().add(new THREE.Vector3(0, 0.9, 0)), top];
  return (
    <group>
      <group position={pos} quaternion={q} scale={[w, w, w]}>
        <GatherWord t={t} layout={layout} centre={new THREE.Vector3()} t0={ts - LEAD} t1={ts + FLY0} seed={11 + i} spread={1.5} depth={0.22} lift={0.22} exit={exit} renderOrder={fly < 0.6 ? 70 : 30} {...GATHER} />
      </group>
      {fly >= 1 ? <GoldLine pts={thread} progress={seg(t, ts + FLY1 - 0.05, ts + FLY1 + 0.35, ease.out)} radius={0.004} color={ATTACK.clone().multiplyScalar(0.7 * fade)} pen={0} /> : null}
    </group>
  );
};

export const Slams: React.FC<{t: number}> = ({t}) => (
  <group>
    {WORDS.map((_, i) => (
      <Slam key={i} t={t} i={i} />
    ))}
  </group>
);

// ------------------------------------------------------------------ panels

type PanelKind = "sliders" | "tabs" | "toggles" | "dropdown" | "curve" | "nodes" | "prompt" | "timeline" | "colour";

const drawPanel = (kind: PanelKind) => {
  const W = 460;
  const H = 300;
  const ss = 2;
  const c = document.createElement("canvas");
  c.width = W * ss;
  c.height = H * ss;
  const g = c.getContext("2d")!;
  g.scale(ss, ss);
  const ink = "rgba(246,240,230,0.96)";
  const dim = "rgba(243,237,227,0.55)";
  g.fillStyle = "rgba(8,9,14,0.86)";
  g.strokeStyle = ink;
  g.lineWidth = 2;
  g.beginPath();
  g.roundRect(1, 1, W - 2, H - 2, 14);
  g.fill();
  g.stroke();
  // title bar
  g.strokeStyle = dim;
  g.beginPath();
  g.moveTo(1, 44);
  g.lineTo(W - 1, 44);
  g.stroke();
  [0, 1, 2].forEach((k) => {
    g.beginPath();
    g.arc(22 + k * 18, 22, 5, 0, Math.PI * 2);
    g.stroke();
  });
  g.font = `500 14px "${fonts.mono}"`;
  g.fillStyle = ink;
  (g as unknown as {letterSpacing: string}).letterSpacing = "1.5px";
  const label = (s: string, x: number, y: number, col = ink) => {
    g.fillStyle = col;
    g.fillText(s, x, y);
  };
  const titles: Record<PanelKind, string> = {sliders: "PARAMETERS", tabs: "WORKSPACE", toggles: "RENDER", dropdown: "MODEL", curve: "MOTION CURVE", nodes: "PIPELINE", prompt: "NEGATIVE PROMPT", timeline: "TIMELINE", colour: "GRADE"};
  label(titles[kind], 86, 27);
  g.strokeStyle = ink;
  g.fillStyle = ink;
  if (kind === "sliders") {
    ["STEPS", "GUIDANCE", "STRENGTH", "SEED"].forEach((s, i) => {
      const y = 82 + i * 52;
      label(s, 24, y, dim);
      g.beginPath();
      g.moveTo(150, y - 5);
      g.lineTo(390, y - 5);
      g.stroke();
      const k = [0.62, 0.35, 0.8, 0.5][i];
      g.beginPath();
      g.arc(150 + 240 * k, y - 5, 8, 0, Math.PI * 2);
      g.stroke();
      label(["30", "7.5", "0.8", "4821"][i], 402, y, dim);
    });
  } else if (kind === "tabs") {
    ["IMAGE", "VIDEO", "AUDIO", "EDIT"].forEach((s, i) => {
      label(s, 24 + i * 104, 78, i === 1 ? ink : dim);
      if (i === 1) {
        g.beginPath();
        g.moveTo(128, 88);
        g.lineTo(186, 88);
        g.stroke();
      }
    });
    for (let i = 0; i < 6; i++) {
      g.strokeStyle = dim;
      g.beginPath();
      g.moveTo(24, 124 + i * 28);
      g.lineTo(24 + [380, 300, 340, 220, 360, 260][i], 124 + i * 28);
      g.stroke();
    }
  } else if (kind === "toggles") {
    ["UPSCALE", "SEED LOCK", "HDR", "LOOP"].forEach((s, i) => {
      const y = 84 + i * 52;
      label(s, 24, y, dim);
      g.strokeStyle = ink;
      g.beginPath();
      g.roundRect(350, y - 18, 64, 26, 13);
      g.stroke();
      g.beginPath();
      g.arc(i % 2 ? 401 : 363, y - 5, 8, 0, Math.PI * 2);
      g.stroke();
    });
  } else if (kind === "dropdown") {
    g.beginPath();
    g.roundRect(24, 62, 412, 40, 8);
    g.stroke();
    label("MODEL 5 TURBO", 40, 88);
    label("▾", 410, 88);
    ["MODEL 4.1", "MODEL 5 PRO", "MODEL 5 TURBO", "MODEL 6 PREVIEW"].forEach((s, i) => label(s, 40, 136 + i * 36, i === 2 ? ink : dim));
  } else if (kind === "curve") {
    g.strokeStyle = dim;
    for (let i = 0; i <= 4; i++) {
      g.beginPath();
      g.moveTo(24, 70 + i * 50);
      g.lineTo(436, 70 + i * 50);
      g.stroke();
    }
    g.strokeStyle = ink;
    g.beginPath();
    g.moveTo(24, 260);
    g.bezierCurveTo(140, 255, 160, 80, 300, 90);
    g.bezierCurveTo(380, 95, 400, 160, 436, 150);
    g.stroke();
    [[24, 260], [300, 90], [436, 150]].forEach(([x, y]) => {
      g.beginPath();
      g.rect(x - 5, y - 5, 10, 10);
      g.stroke();
    });
  } else if (kind === "nodes") {
    const box = (x: number, y: number, s: string) => {
      g.strokeStyle = ink;
      g.beginPath();
      g.roundRect(x, y, 112, 46, 8);
      g.stroke();
      label(s, x + 12, y + 28, dim);
    };
    box(24, 80, "LOAD");
    box(170, 150, "SAMPLER");
    box(316, 80, "DECODE");
    box(316, 220, "UPSCALE");
    g.strokeStyle = dim;
    g.beginPath();
    g.moveTo(136, 103);
    g.bezierCurveTo(160, 103, 150, 173, 170, 173);
    g.moveTo(282, 173);
    g.bezierCurveTo(300, 173, 300, 103, 316, 103);
    g.moveTo(282, 173);
    g.bezierCurveTo(300, 173, 300, 243, 316, 243);
    g.stroke();
  } else if (kind === "prompt") {
    g.beginPath();
    g.roundRect(24, 62, 412, 212, 8);
    g.stroke();
    const words = ["blurry", "extra fingers", "watermark", "low quality", "deformed", "bad anatomy", "jpeg artifacts", "text"];
    words.forEach((s, i) => label(`${s},`, 40 + (i % 2) * 196, 96 + Math.floor(i / 2) * 40, dim));
  } else if (kind === "timeline") {
    for (let i = 0; i < 4; i++) {
      g.strokeStyle = dim;
      g.beginPath();
      g.moveTo(24, 90 + i * 50);
      g.lineTo(436, 90 + i * 50);
      g.stroke();
      g.strokeStyle = ink;
      const a = [40, 120, 70, 200][i];
      const b = [180, 300, 260, 400][i];
      g.beginPath();
      g.roundRect(a, 70 + i * 50, b - a, 30, 5);
      g.stroke();
    }
    g.strokeStyle = ink;
    g.beginPath();
    g.moveTo(250, 60);
    g.lineTo(250, 280);
    g.stroke();
  } else {
    g.beginPath();
    g.arc(130, 170, 92, 0, Math.PI * 2);
    g.stroke();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      g.strokeStyle = dim;
      g.beginPath();
      g.moveTo(130, 170);
      g.lineTo(130 + Math.cos(a) * 92, 170 + Math.sin(a) * 92);
      g.stroke();
    }
    ["LIFT", "GAMMA", "GAIN"].forEach((s, i) => {
      label(s, 260, 112 + i * 56, dim);
      g.strokeStyle = ink;
      g.beginPath();
      g.moveTo(330, 107 + i * 56);
      g.lineTo(430, 107 + i * 56);
      g.stroke();
    });
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.anisotropy = 8;
  return tex;
};

const PANELS: Array<{kind: PanelKind; at: number; pos: [number, number, number]; yaw: number; w: number}> = [
  {kind: "sliders", at: T.panels + 0.25, pos: [0.0, 0.85, 2.2], yaw: 0.22, w: 1.45},
  {kind: "tabs", at: T.panels + 1.1, pos: [3.0, -0.45, 1.6], yaw: -0.28, w: 1.5},
  // Clear of the caught caret (line two of the prompt), which the still frame looks at.
  {kind: "dropdown", at: T.arrives + 0.25, pos: [-1.05, -0.88, 1.2], yaw: 0.32, w: 1.4},
  {kind: "nodes", at: T.workflow + 0.15, pos: [1.9, 1.05, 3.2], yaw: -0.12, w: 1.15},
  {kind: "timeline", at: T.workflow + 0.6, pos: [3.6, 0.8, 0.6], yaw: -0.38, w: 1.55},
  {kind: "toggles", at: T.iface + 0.15, pos: [0.9, -1.0, 3.4], yaw: 0.1, w: 1.05},
  {kind: "prompt", at: T.iface + 0.6, pos: [-0.3, 1.3, -0.4], yaw: 0.28, w: 1.5},
  {kind: "curve", at: T.curve + 0.15, pos: [2.6, 0.05, 3.9], yaw: -0.2, w: 0.95},
  {kind: "colour", at: T.curve + 0.55, pos: [3.9, -1.3, 1.4], yaw: -0.42, w: 1.25},
];

export const panelsVisible = (t: number) => {
  const tf = frozen(t);
  return PANELS.filter((p, i) => tf >= p.at && t < T.free + 0.4 + i * 0.32).length;
};

export const Panels: React.FC<{t: number}> = ({t}) => {
  const texes = useMemo(() => PANELS.map((p) => drawPanel(p.kind)), []);
  const tf = frozen(t);
  return (
    <group>
      {PANELS.map((p, i) => {
        if (tf < p.at) return null;
        const open = seg(tf, p.at, p.at + 0.95, ease.outSoft);
        // Windows arrive from the side and swing gently into place.
        const side = (i % 2 === 0 ? -1 : 1) * (1 - open);
        const closeAt = T.free + 0.4 + i * 0.32;
        const close = seg(t, closeAt, closeAt + 0.8, ease.inOut);
        if (close >= 1) return null;
        const h = p.w * (300 / 460);
        const sy = Math.max(0.02, open * (1 - close));
        return (
          <group key={i} position={[p.pos[0] + side * 1.0, p.pos[1] - close * 1.1, p.pos[2] + (1 - open) * 0.5]} rotation={[0, p.yaw + side * 0.28, 0]}>
            <TexPlane tex={texes[i]} w={p.w} h={h * sy} position={[0, 0, 0]} opacity={clamp01(open * 1.4) * (1 - close)} renderOrder={25} />
          </group>
        );
      })}
    </group>
  );
};

/** Sentence-one pen fades when it frees itself (the freed thread takes over). */
export const knotCentre = RING_CENTRE;
export const LINE = LINE_R;
