import React, {useMemo} from "react";
import * as THREE from "three";
import {useCurrentFrame, useVideoConfig} from "remotion";

/**
 * The editing line. A tube along a dense polyline in real 3D (it passes in front
 * of and behind cards), cut at the pen by arc length. Three finishes:
 *   ink       an opaque coloured stroke for light worlds (a pen on paper, no glow)
 *   light     additive HDR: a hot core that blooms (dark worlds)
 *   spectral  additive HDR with a white core and a thin-film rainbow edge that
 *             drifts along the line (liquid chrome)
 *   neon      additive HDR: a near-white core inside a saturated tube of colour
 * Derived from One Line's GoldLine.
 */

export type Finish = "ink" | "light" | "spectral" | "neon";

export type StrokeProps = {
  pts: THREE.Vector3[];
  /** 0..1 of arc length drawn. */
  progress?: number;
  start?: number;
  /** Tube radius in world units (0.02 ≈ 4 px wide on the focal plane). */
  radius?: number;
  color: THREE.Color;
  finish: Finish;
  opacity?: number;
  /** Pen size multiplier; 0 hides the pen. */
  pen?: number;
  /** Phase of the spectral drift (seconds). */
  time?: number;
  /** Comet tail: the line fades out this far (world units) behind the pen. 0 = permanent trail. */
  tailLen?: number;
  renderOrder?: number;
};

const VS = /* glsl */ `
  attribute float aT;
  varying float vT;
  varying vec3 vN;
  void main() {
    vT = aT;
    vN = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FS = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uHead;
  uniform float uStart;
  uniform int uFinish;
  uniform float uLength;
  uniform float uTime;
  uniform float uTailLen;
  varying float vT;
  varying vec3 vN;
  void main() {
    if (vT > uHead || vT < uStart) discard;
    float tail = uTailLen > 0.0 ? smoothstep(uTailLen, 0.0, (uHead - vT) * uLength) : 1.0;
    if (tail < 0.003) discard;
    float facing = abs(vN.z);
    if (uFinish == 0) {
      // ink: flat colour with a whisper of roundness so it does not look like a vector line
      vec3 c = uColor * (0.9 + 0.1 * facing);
      gl_FragColor = vec4(c * uOpacity * tail, uOpacity * tail);
      return;
    }
    float age = (uHead - vT) * uLength;
    float hot = 1.0 + 1.1 * exp(-age * 4.0);
    if (uFinish == 1) {
      gl_FragColor = vec4(uColor * hot * uOpacity * tail, 1.0);
      return;
    }
    if (uFinish == 3) {
      // neon: the gas tube. Near-white in the middle, the colour on the rim; the bloom carries the colour.
      float e = 1.0 - facing;
      vec3 core = mix(vec3(1.0), uColor / max(max(uColor.r, uColor.g), uColor.b), 0.72) * 2.8;
      vec3 c = mix(core, uColor, smoothstep(0.05, 0.65, e)) * hot;
      gl_FragColor = vec4(c * uOpacity * tail, 1.0);
      return;
    }
    // spectral: white core, thin-film edge, the hue drifting along the line
    float edge = 1.0 - facing;
    vec3 film = 0.5 + 0.5 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + vT * uLength * 0.09 - uTime * 0.25 + edge * 0.6));
    vec3 c = mix(uColor, film * 2.4, smoothstep(0.15, 0.85, edge)) * hot;
    gl_FragColor = vec4(c * uOpacity * tail, 1.0);
  }
`;

const finishIndex: Record<Finish, number> = {ink: 0, light: 1, spectral: 2, neon: 3};

export const Stroke: React.FC<StrokeProps> = ({pts, progress = 1, start = 0, radius = 0.02, color, finish, opacity = 1, pen = 1, time = 0, tailLen = 0, renderOrder = 55}) => {
  const {geom, curve, length} = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal");
    const length = curve.getLength();
    const segs = Math.min(8000, Math.max(16, Math.ceil(pts.length * 1.5)));
    const radial = 10;
    const geom = new THREE.TubeGeometry(curve, segs, radius, radial, false);
    const count = geom.attributes.position.count;
    const aT = new Float32Array(count);
    for (let i = 0; i <= segs; i++) for (let j = 0; j <= radial; j++) aT[i * (radial + 1) + j] = i / segs;
    geom.setAttribute("aT", new THREE.BufferAttribute(aT, 1));
    return {geom, curve, length};
  }, [pts, radius]);

  const mat = useMemo(() => {
    const additive = finish !== "ink";
    return new THREE.ShaderMaterial({
      vertexShader: VS,
      fragmentShader: FS,
      uniforms: {uColor: {value: new THREE.Color()}, uOpacity: {value: 1}, uHead: {value: 1}, uStart: {value: 0}, uFinish: {value: 0}, uLength: {value: 1}, uTime: {value: 0}, uTailLen: {value: 0}},
      toneMapped: false,
      transparent: true,
      premultipliedAlpha: !additive,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      depthWrite: false,
    });
  }, [finish]);
  const u = mat.uniforms;
  u.uColor.value.copy(color);
  u.uOpacity.value = opacity;
  u.uHead.value = progress;
  u.uStart.value = start;
  u.uFinish.value = finishIndex[finish];
  u.uLength.value = length;
  u.uTime.value = time;
  u.uTailLen.value = tailLen;

  const t = Math.min(1, Math.max(0, progress));
  const head = curve.getPointAt(t);

  return (
    <group>
      <mesh geometry={geom} material={mat} renderOrder={renderOrder} />
      {pen > 0 && progress > 0 ? <Nib position={head} finish={finish} color={color} size={pen * (radius / 0.02)} renderOrder={renderOrder + 5} /> : null}
    </group>
  );
};

// ------------------------------------------------------------------ the nib

const discTex = new Map<string, THREE.Texture>();
/** A crisp disc (ink nib) or a soft radial halo (light nib), drawn once. */
const nibTexture = (kind: "disc" | "halo") => {
  const hit = discTex.get(kind);
  if (hit) return hit;
  const s = 256;
  const c = document.createElement("canvas");
  c.width = s;
  c.height = s;
  const g = c.getContext("2d")!;
  if (kind === "disc") {
    g.fillStyle = "#fff";
    g.beginPath();
    g.arc(s / 2, s / 2, s / 2 - 3, 0, Math.PI * 2);
    g.fill();
  } else {
    const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grd.addColorStop(0, "rgba(255,255,255,1)");
    grd.addColorStop(0.08, "rgba(255,255,255,0.85)");
    grd.addColorStop(0.22, "rgba(255,255,255,0.3)");
    grd.addColorStop(0.5, "rgba(255,255,255,0.07)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, s, s);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  discTex.set(kind, tex);
  return tex;
};

/**
 * The pen's tip. Ink: a solid dot in the line colour with a white inner dot (a
 * selection handle, not a spark). Light/spectral: a white-hot core and a halo.
 */
export const Nib: React.FC<{position: THREE.Vector3; finish: Finish; color: THREE.Color; size?: number; renderOrder?: number}> = ({position, finish, color, size = 1, renderOrder = 60}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const pulse = 1 + 0.06 * Math.sin((frame / fps) * Math.PI * 2 * 0.8);
  if (finish === "ink") {
    const disc = nibTexture("disc");
    return (
      <group position={position}>
        <sprite scale={[0.17 * size, 0.17 * size, 1]} renderOrder={renderOrder}>
          <spriteMaterial map={disc} color={color} depthWrite={false} transparent toneMapped={false} />
        </sprite>
        <sprite scale={[0.07 * size, 0.07 * size, 1]} renderOrder={renderOrder + 1}>
          <spriteMaterial map={disc} color={new THREE.Color(1, 1, 1)} depthWrite={false} transparent toneMapped={false} />
        </sprite>
      </group>
    );
  }
  const halo = nibTexture("halo");
  const haloColor = finish === "spectral" ? new THREE.Color(1.1, 1.05, 1.3) : color.clone().multiplyScalar(0.55);
  return (
    <group position={position}>
      <sprite scale={[0.9 * size * pulse, 0.9 * size * pulse, 1]} renderOrder={renderOrder}>
        <spriteMaterial map={halo} color={haloColor} blending={THREE.AdditiveBlending} depthWrite={false} transparent toneMapped={false} />
      </sprite>
      <sprite scale={[0.2 * size * pulse, 0.2 * size * pulse, 1]} renderOrder={renderOrder + 1}>
        <spriteMaterial map={halo} color={finish === "neon" ? new THREE.Color(3.5, 13, 5) : new THREE.Color(12, 12, 13)} blending={THREE.AdditiveBlending} depthWrite={false} transparent toneMapped={false} />
      </sprite>
    </group>
  );
};
