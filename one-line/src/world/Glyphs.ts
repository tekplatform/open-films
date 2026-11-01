import {makeTextTexture, measure, type TextSpec, type TextTex} from "./Type";

/**
 * A word split into glyphs that can move on their own in 3D, each on its own
 * plane, placed by the word's own kerning (prefix widths), so when every glyph
 * is home the word reads exactly as one line of set type.
 *
 * Coordinates are in canvas px with the origin at the word's optical centre:
 * x at the middle of the ink, y at the middle of the x-height (lowercase words
 * sit on it, so the centre is where the eye puts it).
 */

export type Glyph = {
  ch: string;
  tt: TextTex;
  /** Plane centre relative to the word centre (px, y up). */
  x: number;
  y: number;
  /** Ink centre relative to the word centre (px, y up), e.g. for the full stop. */
  inkX: number;
  inkY: number;
  inkW: number;
  inkH: number;
};

type Ink = {left: number; right: number; top: number; bottom: number};

/** Ink bounds in canvas px (unscaled) of a glyph texture, from its alpha. */
const inkOf = (tt: TextTex): Ink | null => {
  const g = tt.canvas.getContext("2d")!;
  const {width: w, height: h} = tt.canvas;
  const d = g.getImageData(0, 0, w, h).data;
  let l = w;
  let r = -1;
  let t = h;
  let b = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (d[(y * w + x) * 4 + 3] > 40) {
        if (x < l) l = x;
        if (x > r) r = x;
        if (y < t) t = y;
        if (y > b) b = y;
      }
  if (r < 0) return null;
  return {left: l / tt.ss, right: (r + 1) / tt.ss, top: t / tt.ss, bottom: (b + 1) / tt.ss};
};

const CACHE = new Map<string, {glyphs: Glyph[]; inkW: number; xHeight: number; originX: number}>();

export const splitWord = (text: string, spec: TextSpec) => {
  const key = text + JSON.stringify(spec);
  const hit = CACHE.get(key);
  if (hit) return hit;
  const chars = [...text];
  const raw = chars.map((ch, i) => {
    const tt = makeTextTexture({...spec, lines: [ch], align: "left"});
    const left = measure(spec, chars.slice(0, i).join(""));
    const ink = inkOf(tt);
    const baseline = tt.padPx + tt.ascent; // from the plane's top, px
    return {ch, tt, left, ink, baseline};
  });
  // Word ink extents along x (word coords: x from the first glyph's pen origin).
  const inkL = Math.min(...raw.filter((g) => g.ink).map((g) => g.left - g.tt.padPx + g.ink!.left));
  const inkR = Math.max(...raw.filter((g) => g.ink).map((g) => g.left - g.tt.padPx + g.ink!.right));
  const cx = (inkL + inkR) / 2;
  // x-height from an "x"-height glyph (o, a, e, x…), else 0.53 em.
  const xg = raw.find((g) => g.ink && "aceomnorsuvwxz".includes(g.ch));
  const xHeight = xg ? xg.baseline - xg.ink!.top : spec.size * 0.53;
  const glyphs: Glyph[] = raw.map((g) => {
    const planeCx = g.left - g.tt.padPx + g.tt.wPx / 2;
    // Plane centre above the baseline (px, y up).
    const planeCy = g.baseline - g.tt.hPx / 2;
    const ink = g.ink ?? {left: 0, right: 0, top: g.baseline, bottom: g.baseline};
    return {
      ch: g.ch,
      tt: g.tt,
      x: planeCx - cx,
      y: planeCy - xHeight / 2,
      inkX: g.left - g.tt.padPx + (ink.left + ink.right) / 2 - cx,
      inkY: g.baseline - (ink.top + ink.bottom) / 2 - xHeight / 2,
      inkW: ink.right - ink.left,
      inkH: ink.bottom - ink.top,
    };
  });
  // originX: the ink centre in pen coordinates (from the first glyph's origin).
  const out = {glyphs, inkW: inkR - inkL, xHeight, originX: cx};
  CACHE.set(key, out);
  return out;
};
