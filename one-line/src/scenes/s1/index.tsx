import React from "react";
import * as THREE from "three";
import {AbsoluteFill} from "remotion";
import {ease, seg} from "../../timing";
import type {Cam} from "../../world/Stage";
import {project} from "../../world/track";
import {analyse, penState} from "../../world/Written";
import type {Scene} from "../types";
import {s1BaseCam} from "./camera";
import {SENTENCE_DONE, sentenceSpec, T} from "./common";
import {Knot, Panels, Slams} from "./Knot";
import {Opening} from "./Opening";
import {Rings} from "./Rings";
import {COMPOSER, KC, Turn} from "./Turn";

/** The cursor the pen becomes (after the period of sentence two). */
const caretWorld = () => {
  const spec = sentenceSpec(SENTENCE_DONE, 42);
  const w = analyse(spec);
  const CW = 1240;
  const place = {world: new THREE.Vector3(COMPOSER.x - (CW / 2) * KC + (12 + 36 + 13) * 2.3 * KC, COMPOSER.y, COMPOSER.z + 0.02), k: KC, left: true};
  return penState(w, place, 1).pos.add(new THREE.Vector3(0.16, 0.02, 0));
};

/** The camera, plus the dive into the cursor at "Behind the scenes". */
const camera = (t: number): Cam => {
  const base = s1BaseCam(t);
  if (t < T.dive - 0.1) return base;
  const caret = caretWorld();
  const k = seg(t, T.dive - 0.1, T.diveEnd, ease.push);
  const from = new THREE.Vector3(...base.position);
  const to = caret.clone().add(new THREE.Vector3(0, 0, 0.18));
  const p = from.lerp(to, k);
  const look = new THREE.Vector3(...base.target).lerp(caret, Math.min(1, k * 1.6));
  return {position: [p.x, p.y, p.z], target: [look.x, look.y, look.z], fov: 40 - 14 * k};
};

const World: React.FC<{t: number}> = ({t}) => (
  <group>
    <Opening t={t} />
    <Rings t={t} />
    <Knot t={t} />
    <Slams t={t} />
    <Panels t={t} />
    <Turn t={t} />
  </group>
);

const Overlay: React.FC<{t: number}> = ({t}) => {
  // White flood from the cursor's point on screen.
  const flood = Math.pow(seg(t, T.diveEnd - 1.0, T.diveEnd, ease.linear), 1.25);
  let floodEl: React.ReactNode = null;
  if (flood > 0) {
    const c = project(camera(t), caretWorld());
    const w = 40 + flood * 3900;
    const h = 120 + flood * 2200;
    floodEl = <div style={{position: "absolute", left: c.x - w / 2, top: c.y - h / 2, width: w, height: h, background: "#FBF7EF", borderRadius: 40 * (1 - flood), opacity: Math.min(1, 0.25 + flood * 1.6)}} />;
  }
  return (
    <AbsoluteFill>
      {floodEl}
    </AbsoluteFill>
  );
};

export const S1: Scene = {
  id: "s1",
  from: 0,
  to: T.diveEnd,
  camera,
  World,
  Overlay,
  dust: 0.6,
};
