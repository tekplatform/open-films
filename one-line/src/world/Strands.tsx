import React, {useMemo} from "react";
import * as THREE from "three";

/**
 * Hundreds of fine gold lines in one draw call (the "Endless" burst). Each
 * strand is a polyline drawn as 1 px GL segments; it grows from its start by
 * its own delay and duration, may keep a comet tail, and fades out by index
 * (down to a floor). Each strand can be pulled back home: its far end runs
 * back to the start, accelerating, with a hot tip (`retract`).
 */

export type StrandDef = {pts: THREE.Vector3[]; delay: number; dur: number; bright: number; retract?: number};

const VS = /* glsl */ `
  attribute float aT;
  attribute float aDelay;
  attribute float aDur;
  attribute float aBright;
  attribute float aIndex;
  attribute float aRetract;
  uniform float uTime;
  uniform float uRetractDur;
  uniform float uFloor;
  uniform float uTail;
  uniform float uFadeFrom;
  uniform float uFadeSpan;
  varying float vA;
  varying float vHead;
  void main() {
    float p = clamp((uTime - aDelay) / aDur, 0.0, 1.0);
    // Pulled home: the far end runs back to the start, accelerating.
    float rk = clamp((uTime - aRetract) / uRetractDur, 0.0, 1.0);
    float q = min(p, 1.0 - pow(rk, 2.2));
    float tail = uTail > 0.0 ? smoothstep(q - uTail, q, aT) : 1.0;
    float shown = step(aT, q) * step(0.0001, q);
    float fade = mix(1.0, uFloor, clamp((uTime - (uFadeFrom + aIndex * uFadeSpan)) / 0.6, 0.0, 1.0));
    vHead = smoothstep(q - 0.04, q, aT) * step(q, 0.999);
    // The tip running home burns hot.
    vA = shown * tail * aBright * fade * (1.0 + 3.0 * vHead * step(0.0001, rk));
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const FS = /* glsl */ `
  uniform vec3 uColor;
  varying float vA;
  varying float vHead;
  void main() {
    if (vA < 0.003) discard;
    gl_FragColor = vec4(uColor * vA * (1.0 + 2.5 * vHead), 1.0);
  }
`;

export const Strands: React.FC<{defs: StrandDef[]; time: number; tail?: number; color?: THREE.Color; fadeFrom?: number; fadeSpan?: number; floor?: number; retractDur?: number; renderOrder?: number}> = ({
  defs,
  time,
  tail = 0,
  color = new THREE.Color(2.2, 1.35, 0.5),
  fadeFrom = 1e9,
  fadeSpan = 0.01,
  floor = 0,
  retractDur = 0.6,
  renderOrder = 15,
}) => {
  const geom = useMemo(() => {
    const pos: number[] = [];
    const tt: number[] = [];
    const delay: number[] = [];
    const dur: number[] = [];
    const bright: number[] = [];
    const index: number[] = [];
    const retract: number[] = [];
    defs.forEach((d, si) => {
      const n = d.pts.length;
      let total = 0;
      const cum = [0];
      for (let i = 1; i < n; i++) cum.push((total += d.pts[i].distanceTo(d.pts[i - 1])));
      for (let i = 0; i < n - 1; i++) {
        for (const k of [i, i + 1]) {
          pos.push(d.pts[k].x, d.pts[k].y, d.pts[k].z);
          tt.push(total > 0 ? cum[k] / total : 0);
          delay.push(d.delay);
          dur.push(d.dur);
          bright.push(d.bright);
          index.push(si);
          retract.push(d.retract ?? 1e9);
        }
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("aT", new THREE.Float32BufferAttribute(tt, 1));
    g.setAttribute("aDelay", new THREE.Float32BufferAttribute(delay, 1));
    g.setAttribute("aDur", new THREE.Float32BufferAttribute(dur, 1));
    g.setAttribute("aBright", new THREE.Float32BufferAttribute(bright, 1));
    g.setAttribute("aIndex", new THREE.Float32BufferAttribute(index, 1));
    g.setAttribute("aRetract", new THREE.Float32BufferAttribute(retract, 1));
    return g;
  }, [defs]);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VS,
        fragmentShader: FS,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {uTime: {value: 0}, uTail: {value: 0}, uColor: {value: new THREE.Color()}, uFadeFrom: {value: 1e9}, uFadeSpan: {value: 0.01}, uFloor: {value: 0}, uRetractDur: {value: 0.6}},
      }),
    [],
  );
  mat.uniforms.uTime.value = time;
  mat.uniforms.uTail.value = tail;
  mat.uniforms.uColor.value.copy(color);
  mat.uniforms.uFadeFrom.value = fadeFrom;
  mat.uniforms.uFadeSpan.value = fadeSpan;
  mat.uniforms.uFloor.value = floor;
  mat.uniforms.uRetractDur.value = retractDur;
  return <lineSegments geometry={geom} material={mat} frustumCulled={false} renderOrder={renderOrder} />;
};
