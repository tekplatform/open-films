import * as THREE from "three";
import {fonts} from "../../fonts";
import {at as cueAt} from "../../timing";
import type {TextSpec} from "../../world/Type";
import {GOLD} from "../../world/space";

/** "Your sentence": the prompt the line writes, loses in the tangle and finishes later. */
export const SENTENCE = "Turn this photo into an editorial ad, like a magazine cover";
export const SENTENCE_DONE = `${SENTENCE}.`;
/** Where the first attempt is cut off by the tangle. */
export const CUT_PREFIX = "Turn this photo into an editorial ad, like a magazine co";

export const sentenceSpec = (text: string, size = 44): TextSpec => ({
  lines: [text],
  font: `italic 400 "${fonts.serif}"`,
  size,
  color: "#FFFFFF",
  tracking: 0.004,
  ss: 3,
});

/** Line ink: the glyphs glow like the line. */
export const INK = new THREE.Color(1.75, 1.08, 0.42);
/** Attacking lines: paler, colder gold, thinner. */
export const ATTACK = new THREE.Color(1.35, 0.98, 0.58);

export const T = {
  breathe: 0,
  leadIn: 1.5,
  write: 2.35,
  catch: 8.0,
  accel: cueAt("c0.2"),
  ringsIn: cueAt("c0.3") - 0.4,
  batch2: cueAt("c0.4"),
  batch3: cueAt("c0.5"),
  honest: cueAt("c0.6"),
  keepUp: cueAt("c0.7"),
  collapse: 22.5,
  slams: ["c1.2", "c1.3", "c1.4", "c1.5"].map((c) => cueAt(c)).concat(cueAt("c1.6") + 0.55),
  allAtOnce: cueAt("c1.7"),
  panels: cueAt("c1.8"),
  arrives: cueAt("c1.9"),
  workflow: cueAt("c1.10"),
  iface: cueAt("c1.11"),
  curve: cueAt("c1.12"),
  still: cueAt("c1.12") + 1.05,
  hard: cueAt("c1.13"),
  free: cueAt("c2.1"),
  just: cueAt("c2.2"),
  talk: cueAt("c2.3"),
  tell: cueAt("c2.4"),
  idea: cueAt("c2.5"),
  product: cueAt("c2.6"),
  photo: cueAt("c2.7"),
  discover: cueAt("c2.8"),
  dive: cueAt("c2.9"),
  /** Sentence two is written in 2.6 s after the line reaches it. */
  write2End: cueAt("c2.3") + 0.36 + 2.6,
  /** The pen settles into the composer as its cursor. */
  home: cueAt("c2.7") + 1.95,
  /** The dive through the cursor ends in white; S2 opens from it. */
  diveEnd: cueAt("c2.9") + 0.82,
} as const;

export const ATTACK_GOLD = GOLD.line;
