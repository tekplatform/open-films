import React, {useLayoutEffect, useMemo} from "react";
import * as THREE from "three";
import {useFrame, useThree} from "@react-three/fiber";
import {ThreeCanvas} from "@remotion/three";
import {useCurrentFrame, useVideoConfig} from "remotion";
import {EffectComposer} from "three/examples/jsm/postprocessing/EffectComposer.js";
import {RenderPass} from "three/examples/jsm/postprocessing/RenderPass.js";
import {ShaderPass} from "three/examples/jsm/postprocessing/ShaderPass.js";
import {UnrealBloomPass} from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import {CAM_Z, FOV, H, W, type V3} from "./space";

/**
 * The stage: one perspective camera, HDR render target with MSAA, selective
 * bloom by threshold (only values above 1.0 bloom: the line, the pen, rims;
 * videos and photos never exceed 1.0 so they stay untouched), then a finish
 * pass that maps HDR hue-true, adds radial chromatic aberration, vignette and
 * film grain seeded by the frame. Everything is a pure function of the frame.
 */

export type Look = {
  background: string;
  /** Bloom strength and per-mip weights (fine → wide); wide mips are the haze. */
  bloom: {strength: number; factors: [number, number, number, number, number]};
  grain: number;
  ca: number;
  vignette: number;
  /** The world behind the cards (flat `background` when absent). */
  world?: World;
};

export type Cam = {position: V3; target: V3; fov?: number; roll?: number; /** Architectural lens shift: moves the frame up without tilting, so walls stay vertical. */ shift?: number; /** Barrel distortion (fisheye feel), 0 = none. */ barrel?: number; /** Near plane; raise it in long halls, depth precision goes with it. */ near?: number};

export const REST: Cam = {position: [0, 0, CAM_Z], target: [0, 0, 0], fov: FOV};

const FinishShader = {
  uniforms: {
    tDiffuse: {value: null as THREE.Texture | null},
    resolution: {value: new THREE.Vector2(W, H)},
    ca: {value: 0},
    grain: {value: 0},
    seed: {value: 0},
    vignette: {value: 0},
    barrel: {value: 0},
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 resolution;
    uniform float ca;
    uniform float grain;
    uniform float seed;
    uniform float vignette;
    uniform float barrel;
    varying vec2 vUv;

    vec3 mapHDR(vec3 c) {
      float m = max(max(c.r, c.g), c.b);
      if (m > 1.0) {
        vec3 h = c / m;
        float w = smoothstep(1.0, 9.0, m);
        c = mix(h, vec3(1.0), w * 0.92);
      }
      return c;
    }
    vec3 toSRGB(vec3 c) {
      c = clamp(c, 0.0, 1.0);
      return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
    }
    float hash(vec2 p) {
      p = fract(p * vec2(443.897, 441.423) + seed * 0.1031);
      p += dot(p, p.yx + 19.19);
      return fract((p.x + p.y) * p.x);
    }

    void main() {
      vec2 uv = vUv;
      if (barrel > 0.0) {
        vec2 q = (vUv - 0.5) * vec2(resolution.x / resolution.y, 1.0);
        float rr = dot(q, q);
        q *= (1.0 - barrel * 0.18) * (1.0 + barrel * 0.42 * rr);
        uv = q / vec2(resolution.x / resolution.y, 1.0) + 0.5;
      }
      vec2 d = uv - 0.5;
      vec2 ar = resolution.x >= resolution.y ? vec2(resolution.x / resolution.y, 1.0) : vec2(1.0, resolution.y / resolution.x);
      float r2 = dot(d * ar, d * ar);
      vec2 dpx = d * resolution;
      vec2 off = dpx / (length(dpx) + 1e-5) * ca * (r2 / 1.04) / resolution;
      vec3 c;
      c.r = texture2D(tDiffuse, uv + off).r;
      c.g = texture2D(tDiffuse, uv).g;
      c.b = texture2D(tDiffuse, uv - off).b;
      c = mapHDR(c);
      c *= 1.0 - vignette * smoothstep(0.18, 1.05, r2);
      vec3 s = toSRGB(c);
      float l = dot(s, vec3(0.299, 0.587, 0.114));
      float n = hash(gl_FragCoord.xy) + hash(gl_FragCoord.xy + 17.0) - 1.0;
      s += n * grain * (0.35 + 0.65 * (1.0 - abs(l - 0.45) * 1.6));
      gl_FragColor = vec4(s, 1.0);
    }
  `,
};

const Post: React.FC<{look: Look; barrel: number}> = ({look, barrel}) => {
  const {gl, scene, camera, size} = useThree();
  const frame = useCurrentFrame();

  const chain = useMemo(() => {
    const rt = new THREE.WebGLRenderTarget(size.width, size.height, {type: THREE.HalfFloatType, samples: 4});
    const composer = new EffectComposer(gl, rt);
    composer.setPixelRatio(1);
    composer.setSize(size.width, size.height);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(size.width, size.height), 1, 0.5, 1.0);
    // Soft-knee high pass: only the energy above the threshold blooms, so a
    // line at 1.7 glows gently and the white-hot pen blooms hard.
    bloom.materialHighPassFilter.fragmentShader = /* glsl */ `
      uniform sampler2D tDiffuse;
      uniform float luminosityThreshold;
      varying vec2 vUv;
      void main() {
        vec4 t = texture2D(tDiffuse, vUv);
        float l = dot(t.rgb, vec3(0.299, 0.587, 0.114));
        float k = max(0.0, l - luminosityThreshold) / max(l, 1e-4);
        gl_FragColor = vec4(t.rgb * k, 1.0);
      }`;
    bloom.materialHighPassFilter.needsUpdate = true;
    composer.addPass(bloom);
    const finish = new ShaderPass(FinishShader);
    composer.addPass(finish);
    return {composer, bloom, finish};
  }, [gl, scene, camera, size.width, size.height]);

  chain.bloom.strength = look.bloom.strength;
  chain.bloom.radius = 0;
  (chain.bloom.compositeMaterial.uniforms.bloomFactors.value as number[]).splice(0, 5, ...look.bloom.factors);
  chain.bloom.threshold = 1.0;
  chain.finish.uniforms.ca.value = look.ca;
  chain.finish.uniforms.grain.value = look.grain;
  chain.finish.uniforms.vignette.value = look.vignette;
  chain.finish.uniforms.barrel.value = barrel;
  chain.finish.uniforms.seed.value = (frame % 997) + 1;
  chain.finish.uniforms.resolution.value.set(size.width, size.height);

  useFrame(() => {
    chain.composer.render();
  }, 1);
  return null;
};

const CameraRig: React.FC<{cam: Cam}> = ({cam}) => {
  const {camera} = useThree();
  useLayoutEffect(() => {
    const c = camera as THREE.PerspectiveCamera;
    c.position.set(...cam.position);
    c.up.set(Math.sin(cam.roll ?? 0), Math.cos(cam.roll ?? 0), 0);
    c.lookAt(new THREE.Vector3(...cam.target));
    c.fov = cam.fov ?? FOV;
    c.near = cam.near ?? 0.05;
    c.far = 3000;
    c.updateProjectionMatrix();
    if (cam.shift) {
      c.projectionMatrix.elements[9] += cam.shift;
      c.projectionMatrixInverse.copy(c.projectionMatrix).invert();
    }
  });
  return null;
};

/**
 * The world behind the cards, camera-locked. Not space any more: three kinds.
 *   cove   a cool-white infinity cove (wall → bright bend → floor) with a soft key lift
 *   liquid a dark liquid-metal surface: domain-warped fbm lit as a height field with a
 *          thin-film (oil-slick) colour, slowly flowing with `time`
 *   field  one saturated colour field: wall and floor with a soft crease and a flash hotspot
 * Colours are sRGB hex; THREE converts them to linear for the HDR pipeline.
 */
export type World =
  | {kind: "cove"; top: string; band: string; floor: string; horizon: number; lift: string; liftAt: [number, number]}
  | {kind: "liquid"; base: string; amount: number; scale: number; time: number; tilt?: number}
  | {kind: "field"; wall: string; floor: string; horizon: number; lift: string; liftAt: [number, number]};

const WORLD_FS = /* glsl */ `
  uniform int kind;
  uniform vec3 c0; uniform vec3 c1; uniform vec3 c2; uniform vec3 lift;
  uniform vec2 liftAt; uniform float horizon; uniform float amount; uniform float scale; uniform float time; uniform float tilt;
  varying vec2 vUv;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
    for (int i = 0; i < 4; i++) { v += a * noise(p); p = m * p; a *= 0.45; }
    return v;
  }
  float height(vec2 p) {
    vec2 q = vec2(fbm(p + vec2(0.0, time * 0.06)), fbm(p + vec2(5.2, 1.3) - time * 0.05));
    vec2 r = vec2(fbm(p + 2.6 * q + vec2(1.7, 9.2) + time * 0.04), fbm(p + 2.6 * q + vec2(8.3, 2.8)));
    return fbm(p + 2.4 * r);
  }

  void main() {
    vec2 uv = vUv;
    vec3 c;
    if (kind == 0) {
      // cove: floor → bend (brightest) → wall
      float y = uv.y;
      c = y > horizon ? mix(c1, c0, smoothstep(horizon, 1.0, y)) : mix(c2, c1, smoothstep(0.0, horizon, y) * smoothstep(0.0, horizon, y));
      vec2 p = (uv - liftAt) * vec2(1.7778, 1.0);
      c += lift * exp(-dot(p, p) * 1.3);
    } else if (kind == 1) {
      // liquid metal: a slow height field lit by two soft-box strips; thin-film colour
      // lives only on the brightest slopes, so the world reads as black chrome, not smoke
      vec2 p = (uv - 0.5) * vec2(1.7778, 1.0) * scale;
      p.y += p.x * tilt;
      float h0 = height(p);
      float e = 0.01;
      float hx = height(p + vec2(e, 0.0));
      float hy = height(p + vec2(0.0, e));
      vec3 n = normalize(vec3((h0 - hx) / e * 0.22, (h0 - hy) / e * 0.22, 1.0));
      vec3 R = reflect(vec3(0.0, 0.0, -1.0), n);
      // two long soft boxes above: a broad one and a thin hot strip
      float box1 = smoothstep(0.55, 0.95, R.y) * smoothstep(1.0, 0.2, abs(R.x + 0.2));
      float box2 = exp(-pow((R.y - 0.42) * 9.0, 2.0)) * smoothstep(0.9, 0.0, abs(R.x - 0.15));
      float fres = pow(1.0 - n.z, 1.5);
      vec3 film = 0.5 + 0.5 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + h0 * 1.8 + R.x * 0.6));
      vec3 metal = vec3(0.62, 0.64, 0.7) * box1 * 0.55 + vec3(1.0) * box2 * 0.9;
      c = c0 + (metal + film * fres * 0.9 * (0.3 + box1)) * amount;
      vec2 vv = (uv - vec2(0.5, 0.55)) * vec2(1.7778, 1.0);
      c *= 0.45 + 0.55 * exp(-dot(vv, vv) * 0.5);
    } else {
      // one colour field: wall, a soft crease, a slightly darker floor, a flash hotspot
      float y = uv.y;
      float crease = smoothstep(horizon - 0.06, horizon + 0.06, y);
      c = mix(c1, c0, crease);
      c *= 1.0 - 0.10 * exp(-pow((y - horizon) * 18.0, 2.0));
      vec2 p = (uv - liftAt) * vec2(1.7778, 1.0);
      c += lift * exp(-dot(p, p) * 0.9);
    }
    gl_FragColor = vec4(c, 1.0);
  }
`;

const kindIndex = {cove: 0, liquid: 1, field: 2} as const;

const Backdrop: React.FC<{look: Look}> = ({look}) => {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        depthWrite: false,
        depthTest: false,
        uniforms: {
          kind: {value: 0},
          c0: {value: new THREE.Color()},
          c1: {value: new THREE.Color()},
          c2: {value: new THREE.Color()},
          lift: {value: new THREE.Color()},
          liftAt: {value: new THREE.Vector2()},
          horizon: {value: 0.4},
          amount: {value: 1},
          scale: {value: 1},
          time: {value: 0},
          tilt: {value: 0},
        },
        vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.9999, 1.0); }`,
        fragmentShader: WORLD_FS,
      }),
    [],
  );
  const w = look.world;
  const u = mat.uniforms;
  if (!w) {
    u.kind.value = 2;
    u.c0.value.set(look.background);
    u.c1.value.set(look.background);
    u.lift.value.setRGB(0, 0, 0);
  } else if (w.kind === "cove") {
    u.kind.value = kindIndex.cove;
    u.c0.value.set(w.top);
    u.c1.value.set(w.band);
    u.c2.value.set(w.floor);
    u.horizon.value = w.horizon;
    u.lift.value.set(w.lift);
    u.liftAt.value.set(...w.liftAt);
  } else if (w.kind === "liquid") {
    u.kind.value = kindIndex.liquid;
    u.c0.value.set(w.base);
    u.amount.value = w.amount;
    u.scale.value = w.scale;
    u.time.value = w.time;
    u.tilt.value = w.tilt ?? 0;
  } else {
    u.kind.value = kindIndex.field;
    u.c0.value.set(w.wall);
    u.c1.value.set(w.floor);
    u.horizon.value = w.horizon;
    u.lift.value.set(w.lift);
    u.liftAt.value.set(...w.liftAt);
  }
  return (
    <mesh frustumCulled={false} renderOrder={-1000} material={mat}>
      <planeGeometry args={[2, 2]} />
    </mesh>
  );
};

export const Stage: React.FC<{look: Look; cam?: Cam; children: React.ReactNode}> = ({look, cam = REST, children}) => {
  const {width, height} = useVideoConfig();
  return (
  <ThreeCanvas
    width={width}
    height={height}
    flat
    gl={{antialias: false, alpha: false, powerPreference: "high-performance", preserveDrawingBuffer: true}}
    dpr={1}
    camera={{fov: FOV, near: 0.05, far: 3000, position: cam.position}}
    style={{position: "absolute", inset: 0, background: look.background}}
  >
    <CameraRig cam={cam} />
    <Backdrop look={look} />
    <Post look={look} barrel={cam.barrel ?? 0} />
    {children}
  </ThreeCanvas>
  );
};
