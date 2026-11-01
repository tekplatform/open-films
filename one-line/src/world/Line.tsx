import React, {useMemo} from "react";
import * as THREE from "three";
import {useCurrentFrame, useVideoConfig} from "remotion";
import {GOLD, rng} from "./space";

/**
 * The one line. A tube along a dense polyline in real 3D (so it passes in front
 * of and behind cards), drawn by drawRange so `progress` is arc length. The pen
 * is a white-hot core with a warm halo and a few deterministic sparks.
 */

// ------------------------------------------------------------------ path builder

export class Path {
  pts: THREE.Vector3[] = [];

  private push(p: THREE.Vector3) {
    const last = this.pts[this.pts.length - 1];
    if (!last || last.distanceToSquared(p) > 1e-8) this.pts.push(p.clone());
  }

  /** Smooth Catmull-Rom through control points, sampled densely. */
  smooth(ctrl: THREE.Vector3[], perUnit = 18, tension = 0.5) {
    const all = this.pts.length ? [this.pts[this.pts.length - 1], ...ctrl] : ctrl;
    const curve = new THREE.CatmullRomCurve3(all, false, "catmullrom", tension);
    const n = Math.max(8, Math.ceil(curve.getLength() * perUnit));
    for (let i = 0; i <= n; i++) this.push(curve.getPointAt(i / n));
    return this;
  }

  lineTo(p: THREE.Vector3, perUnit = 18) {
    const a = this.pts[this.pts.length - 1] ?? p;
    const n = Math.max(1, Math.ceil(a.distanceTo(p) * perUnit));
    for (let i = 1; i <= n; i++) this.push(a.clone().lerp(p, i / n));
    return this;
  }

  /** Quarter arc from the current point turning around `center`. */
  arc(center: THREE.Vector3, radius: number, from: number, to: number, steps = 10) {
    for (let i = 0; i <= steps; i++) {
      const a = from + ((to - from) * i) / steps;
      this.push(new THREE.Vector3(center.x + Math.cos(a) * radius, center.y + Math.sin(a) * radius, center.z));
    }
    return this;
  }

  /**
   * Trace a rounded rectangle (centre, half sizes, corner radius) clockwise in
   * screen terms starting at the top-left corner's end of the top edge.
   * `turns` < 1 stops early (0.25 per side).
   */
  roundRect(c: THREE.Vector3, hw: number, hh: number, r: number, startCorner: "tl" | "bl" = "tl", turns = 1) {
    const seq: Array<() => void> = [];
    const z = c.z;
    const P = (x: number, y: number) => new THREE.Vector3(x, y, z);
    const top = () => {
      this.lineTo(P(c.x + hw - r, c.y + hh));
      this.arc(P(c.x + hw - r, c.y + hh - r), r, Math.PI / 2, 0);
    };
    const right = () => {
      this.lineTo(P(c.x + hw, c.y - hh + r));
      this.arc(P(c.x + hw - r, c.y - hh + r), r, 0, -Math.PI / 2);
    };
    const bottom = () => {
      this.lineTo(P(c.x - hw + r, c.y - hh));
      this.arc(P(c.x - hw + r, c.y - hh + r), r, -Math.PI / 2, -Math.PI);
    };
    const left = () => {
      this.lineTo(P(c.x - hw, c.y + hh - r));
      this.arc(P(c.x - hw + r, c.y + hh - r), r, Math.PI, Math.PI / 2);
    };
    if (startCorner === "tl") seq.push(top, right, bottom, left);
    else seq.push(left, top, right, bottom);
    const sides = Math.round(turns * 4);
    for (let i = 0; i < sides; i++) seq[i % 4]();
    return this;
  }

  /**
   * Counter-clockwise rounded rectangle in world terms, entering at the
   * bottom-left corner heading right and leaving it heading down: the
   * bottom edge, right, top, left, then straight through the corner.
   */
  frameCCW(c: THREE.Vector3, hw: number, hh: number, r: number) {
    const z = c.z;
    const P = (x: number, y: number) => new THREE.Vector3(x, y, z);
    const L = c.x - hw;
    const R = c.x + hw;
    const T = c.y + hh;
    const B = c.y - hh;
    this.lineTo(P(L, B), 30);
    this.lineTo(P(R - r, B), 30);
    this.arc(P(R - r, B + r), r, -Math.PI / 2, 0);
    this.lineTo(P(R, T - r), 30);
    this.arc(P(R - r, T - r), r, 0, Math.PI / 2);
    this.lineTo(P(L + r, T), 30);
    this.arc(P(L + r, T - r), r, Math.PI / 2, Math.PI);
    this.lineTo(P(L, B), 30);
    return this;
  }

  get last() {
    return this.pts[this.pts.length - 1];
  }
}

// ------------------------------------------------------------------ textures

let haloTex: THREE.Texture | null = null;
export const haloTexture = () => {
  if (haloTex) return haloTex;
  const s = 256;
  const c = document.createElement("canvas");
  c.width = s;
  c.height = s;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.08, "rgba(255,255,255,0.85)");
  grd.addColorStop(0.22, "rgba(255,255,255,0.32)");
  grd.addColorStop(0.5, "rgba(255,255,255,0.08)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, s, s);
  haloTex = new THREE.CanvasTexture(c);
  haloTex.colorSpace = THREE.NoColorSpace;
  return haloTex;
};

// ------------------------------------------------------------------ the line

export type LineProps = {
  pts: THREE.Vector3[];
  /** 0..1 of arc length drawn. */
  progress?: number;
  /** Tube radius in world units (0.02 ≈ 4 px wide on the focal plane). */
  radius?: number;
  color?: THREE.Color;
  opacity?: number;
  /** Pen size multiplier; 0 hides the pen. */
  pen?: number;
  /** Breathing 0..1 of the pen (it pulses when the line rests). */
  breathe?: number;
  sparks?: number;
  /** Fade the oldest part of the line: 0 none, 1 the tail fully fades. */
  tailFade?: number;
  /** Comet tail: the line fades out this far (world units) behind the pen. 0 = permanent trail. */
  tailLen?: number;
  /** 0..1 of arc length erased from the start (the line un-draws behind). */
  start?: number;
  /** World units the pen has run past the end: a comet tail keeps burning out. */
  overrun?: number;
  seed?: number;
};

const LINE_VS = /* glsl */ `
  attribute float aT;
  varying float vT;
  void main() { vT = aT; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const LINE_FS = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uHead;
  uniform float uTailFade;
  uniform float uTailLen;
  uniform float uLength;
  uniform float uStart;
  uniform float uOverrun;
  varying float vT;
  void main() {
    if (vT > uHead || vT < uStart) discard;
    float age = uHead - vT;
    float ageLen = age * uLength + uOverrun;
    float fade = mix(1.0, smoothstep(0.0, 0.6, 1.0 - age / max(uHead, 1e-4)), uTailFade);
    if (uTailLen > 0.0) fade *= smoothstep(uTailLen, 0.0, ageLen);
    if (fade < 0.003) discard;
    // The last stretch behind the pen runs hotter.
    float hot = 1.0 + 1.3 * exp(-ageLen * 5.0);
    vec3 c = uColor * hot * fade * uOpacity;
    if (max(max(c.r, c.g), c.b) < 0.002) discard;
    gl_FragColor = vec4(c, 1.0);
  }
`;

export const GoldLine: React.FC<LineProps> = ({pts, progress = 1, start = 0, radius = 0.02, color = GOLD.line, opacity = 1, pen = 1, breathe = 0, sparks = 6, tailFade = 0, tailLen = 0, overrun = 0, seed = 1}) => {
  const {geom, curve, length} = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal");
    const length = curve.getLength();
    const segs = Math.min(6000, Math.max(16, Math.ceil(pts.length * 1.5)));
    const radial = 8;
    const geom = new THREE.TubeGeometry(curve, segs, radius, radial, false);
    // Arc-length parameter per vertex, so the shader can cut at the pen.
    const count = geom.attributes.position.count;
    const aT = new Float32Array(count);
    for (let i = 0; i <= segs; i++) for (let j = 0; j <= radial; j++) aT[i * (radial + 1) + j] = i / segs;
    geom.setAttribute("aT", new THREE.BufferAttribute(aT, 1));
    return {geom, curve, length};
  }, [pts, radius]);

  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: LINE_VS,
        fragmentShader: LINE_FS,
        uniforms: {uColor: {value: new THREE.Color()}, uOpacity: {value: 1}, uHead: {value: 1}, uTailFade: {value: 0}, uTailLen: {value: 0}, uLength: {value: 1}, uStart: {value: 0}, uOverrun: {value: 0}},
        toneMapped: false,
        // The line is light: it adds, never blocks (cards in front still hide it by depth).
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    [],
  );
  mat.uniforms.uColor.value.copy(color);
  mat.uniforms.uOpacity.value = opacity;
  mat.uniforms.uHead.value = progress;
  mat.uniforms.uTailFade.value = tailFade;
  mat.uniforms.uTailLen.value = tailLen;
  mat.uniforms.uLength.value = length;
  mat.uniforms.uStart.value = start;
  mat.uniforms.uOverrun.value = overrun;

  const head = curve.getPointAt(Math.min(1, Math.max(0, progress)));
  const tangent = curve.getTangentAt(Math.min(1, Math.max(0, progress)));

  return (
    <group>
      <mesh geometry={geom} material={mat} renderOrder={55} />
      {pen > 0 && progress > 0 ? <Pen position={head} tangent={tangent} size={pen * (radius / 0.02)} breathe={breathe} sparks={sparks} seed={seed} /> : null}
      {length < 0 ? null : null}
    </group>
  );
};

/**
 * The pen: white-hot core, warm halo, a few sparks shed behind it. Used by the
 * line and by handwriting (where the "line" is the revealed glyphs).
 */
export const Pen: React.FC<{position: THREE.Vector3; tangent?: THREE.Vector3; size?: number; breathe?: number; sparks?: number; seed?: number; intensity?: number; onTop?: boolean}> = ({
  position,
  tangent = new THREE.Vector3(1, 0, 0),
  size = 1,
  breathe = 0,
  sparks = 6,
  seed = 1,
  intensity = 1,
  onTop = false,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;
  const pulse = 1 + breathe * (0.22 * Math.sin(t * 2 * Math.PI * 0.42) + 0.08);
  const sparkEls = useMemo(() => {
    const r = rng(seed * 97 + 3);
    return new Array(sparks).fill(0).map(() => ({phase: r(), speed: 0.6 + r() * 0.9, spread: (r() - 0.5) * 1.6, lift: (r() - 0.5) * 1.6, size: 0.4 + r() * 0.6}));
  }, [sparks, seed]);
  const halo = haloTexture();
  const haloColor = useMemo(() => GOLD.halo.clone().multiplyScalar(intensity), [intensity]);
  const coreColor = useMemo(() => GOLD.core.clone().multiplyScalar(intensity), [intensity]);
  const dir = tangent.clone().normalize();
  return (
    <group position={position}>
      <sprite scale={[0.95 * size * pulse, 0.95 * size * pulse, 1]} renderOrder={60}>
        <spriteMaterial map={halo} color={haloColor} blending={THREE.AdditiveBlending} depthWrite={false} depthTest={!onTop} transparent toneMapped={false} />
      </sprite>
      <sprite scale={[0.2 * size * pulse, 0.2 * size * pulse, 1]} renderOrder={61}>
        <spriteMaterial map={halo} color={coreColor} blending={THREE.AdditiveBlending} depthWrite={false} depthTest={!onTop} transparent toneMapped={false} />
      </sprite>
      {sparkEls.map((s, i) => {
        const life = (t * s.speed + s.phase) % 1;
        const back = dir.clone().multiplyScalar(-life * 0.5 * size);
        const off = new THREE.Vector3(s.spread * life * 0.25 * size, (s.lift * life * 0.25 - life * life * 0.12) * size, 0);
        const p = back.add(off);
        const k = (1 - life) * s.size * size * 0.06;
        return (
          <sprite key={i} position={p} scale={[k, k, 1]} renderOrder={62}>
            <spriteMaterial map={halo} color={coreColor} opacity={(1 - life) * 0.9} blending={THREE.AdditiveBlending} depthWrite={false} transparent toneMapped={false} />
          </sprite>
        );
      })}
    </group>
  );
};
