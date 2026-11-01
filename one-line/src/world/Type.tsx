import React, {useMemo} from "react";
import * as THREE from "three";
import {TexPlane, type CardLook} from "./Card";
import {at, px} from "./space";

/**
 * Type that lives in the 3D world: drawn once to a supersampled canvas (after
 * the font gate, so the real faces are used), shown on a plane sized so it
 * reads at exactly `size` px when it sits at depth z.
 */

export type TextSpec = {
  lines: string[];
  /** CSS font without size, e.g. `900 "Inter Tight"`, `italic 400 "Instrument Serif"`. */
  font: string;
  size: number;
  color: string;
  /** Tracking in em. */
  tracking?: number;
  lineHeight?: number;
  align?: "left" | "center" | "right";
  glow?: {color: string; blur: number};
  /** Supersampling factor of the canvas. */
  ss?: number;
};

export type TextTex = {tex: THREE.Texture; wPx: number; hPx: number; padPx: number; ascent: number; canvas: HTMLCanvasElement; ss: number; widths: number[]};

const TEXT_CACHE = new Map<string, TextTex>();

export const makeTextTexture = (spec: TextSpec): TextTex => {
  const key = JSON.stringify(spec);
  const hit = TEXT_CACHE.get(key);
  if (hit) return hit;
  const ss = spec.ss ?? 2;
  const lh = spec.lineHeight ?? 1.0;
  const c = document.createElement("canvas");
  const g = c.getContext("2d")!;
  const fontCss = (s: number) => {
    const parts = spec.font.trim().split(" ");
    const fam = spec.font.slice(spec.font.indexOf('"'));
    const pre = parts.filter((p) => !p.startsWith('"') && !p.endsWith('"')).join(" ");
    return `${pre} ${s}px ${fam}`;
  };
  g.font = fontCss(spec.size);
  (g as unknown as {letterSpacing: string}).letterSpacing = `${(spec.tracking ?? 0) * spec.size}px`;
  const widths = spec.lines.map((l) => g.measureText(l).width);
  const m = g.measureText("ÅgjÉ");
  const ascent = m.actualBoundingBoxAscent;
  const descent = m.actualBoundingBoxDescent;
  const pad = Math.ceil(spec.glow ? spec.glow.blur * 2.2 : spec.size * 0.12);
  const wPx = Math.ceil(Math.max(...widths) + pad * 2);
  const lineH = spec.size * lh;
  const hPx = Math.ceil(ascent + descent + lineH * (spec.lines.length - 1) + pad * 2);
  c.width = wPx * ss;
  c.height = hPx * ss;
  g.scale(ss, ss);
  g.font = fontCss(spec.size);
  (g as unknown as {letterSpacing: string}).letterSpacing = `${(spec.tracking ?? 0) * spec.size}px`;
  g.textBaseline = "alphabetic";
  const draw = () =>
    spec.lines.forEach((l, i) => {
      const w = widths[i];
      const x = spec.align === "center" ? (wPx - w) / 2 : spec.align === "right" ? wPx - pad - w : pad;
      g.fillText(l, x, pad + ascent + i * lineH);
    });
  if (spec.glow) {
    g.save();
    g.shadowColor = spec.glow.color;
    g.shadowBlur = spec.glow.blur * ss;
    g.fillStyle = spec.glow.color;
    draw();
    draw();
    g.restore();
  }
  g.fillStyle = spec.color;
  draw();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  const out = {tex, wPx, hPx, padPx: pad, ascent, canvas: c, ss, widths};
  TEXT_CACHE.set(key, out);
  return out;
};

/** Width in px of a string in a spec's font (for cutting a sentence mid-way). */
export const measure = (spec: TextSpec, text: string) => {
  const c = document.createElement("canvas").getContext("2d")!;
  const fam = spec.font.slice(spec.font.indexOf('"'));
  const pre = spec.font.slice(0, spec.font.indexOf('"')).trim();
  c.font = `${pre} ${spec.size}px ${fam}`;
  (c as unknown as {letterSpacing: string}).letterSpacing = `${(spec.tracking ?? 0) * spec.size}px`;
  return c.measureText(text).width;
};

export type Anchor = "center" | "left" | "right";

/**
 * Text placed by screen position: (x, y) is the anchor point in px of the
 * first line's baseline-ish centre for a camera at rest, z its depth.
 */
export const TextPlane: React.FC<
  {spec: TextSpec; x: number; y: number; z?: number; anchor?: Anchor; renderOrder?: number; rotation?: [number, number, number]} & CardLook
> = ({spec, x, y, z = 0, anchor = "center", renderOrder = 0, rotation, ...look}) => {
  const tt = useMemo(() => makeTextTexture(spec), [spec]);
  const cx = anchor === "center" ? x : anchor === "left" ? x - tt.padPx + tt.wPx / 2 : x + tt.padPx - tt.wPx / 2;
  // y is the vertical centre of the text block.
  const pos = at(cx, y, z);
  return <TexPlane tex={tt.tex} w={px(tt.wPx, z)} h={px(tt.hPx, z)} position={pos} rotation={rotation} renderOrder={renderOrder} {...look} />;
};

/** A button: light background, dark text, Albert Sans 600, a small icon. */
export const makeButtonTexture = (label: string, uiFamily: string, scale = 1.2, colors: {bg: string; fg: string} = {bg: "#DEDEDE", fg: "#0D0D0D"}) => {
  const ss = 3;
  const h = 54 * scale;
  const fs = 16 * scale;
  const icon = 18 * scale;
  const gap = 10 * scale;
  const padX = 34 * scale;
  const c = document.createElement("canvas");
  const g = c.getContext("2d")!;
  g.font = `600 ${fs}px "${uiFamily}"`;
  const tw = g.measureText(label).width;
  const w = Math.ceil(padX * 2 + icon + gap + tw);
  c.width = w * ss;
  c.height = Math.ceil(h * ss);
  g.scale(ss, ss);
  const r = 16 * scale;
  g.fillStyle = colors.bg;
  g.beginPath();
  g.roundRect(0, 0, w, h, r);
  g.fill();
  // lucide "shuffle" on a 24 grid, stroke 2, round caps.
  g.save();
  g.translate(padX, (h - icon) / 2);
  g.scale(icon / 24, icon / 24);
  g.strokeStyle = colors.fg;
  g.lineWidth = 2;
  g.lineCap = "round";
  g.lineJoin = "round";
  ["m18 14 4 4-4 4", "m18 2 4 4-4 4", "M2 18h1.973a4 4 0 0 0 3.3-1.7l5.454-8.6a4 4 0 0 1 3.3-1.7H22", "M2 6h1.972a4 4 0 0 1 3.6 2.2", "M22 18h-6.041a4 4 0 0 1-3.3-1.8l-.359-.45"].forEach((d) =>
    g.stroke(new Path2D(d)),
  );
  g.restore();
  g.fillStyle = colors.fg;
  g.font = `600 ${fs}px "${uiFamily}"`;
  g.textBaseline = "middle";
  g.fillText(label, padX + icon + gap, h / 2 + fs * 0.04);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.anisotropy = 8;
  return {tex, wPx: w, hPx: h};
};
