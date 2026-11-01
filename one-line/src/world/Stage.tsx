import React, {useLayoutEffect, useMemo} from "react";
import * as THREE from "three";
import {useFrame, useThree} from "@react-three/fiber";
import {ThreeCanvas} from "@remotion/three";
import {useCurrentFrame} from "remotion";
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
  /** Deep-space backdrop: 0 = flat background, 1 = full navy/amber gradient. */
  nebula: number;
  /** Lift applied to the backdrop's centre colour (sRGB hex). */
  nebulaColor: string;
};

export type Cam = {position: V3; target: V3; fov?: number; roll?: number; /** Barrel distortion (fisheye feel), 0 = none. */ barrel?: number};

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
      float r2 = dot(d * vec2(resolution.x / resolution.y, 1.0), d * vec2(resolution.x / resolution.y, 1.0));
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
    c.near = 0.05;
    c.far = 3000;
    c.updateProjectionMatrix();
  });
  return null;
};

/** A camera-locked backdrop: deep navy-black with a faint lifted centre. */
const Backdrop: React.FC<{look: Look}> = ({look}) => {
  const {camera} = useThree();
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        depthWrite: false,
        depthTest: false,
        uniforms: {
          base: {value: new THREE.Color(look.background)},
          lift: {value: new THREE.Color(look.nebulaColor)},
          amount: {value: look.nebula},
        },
        vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.9999, 1.0); }`,
        fragmentShader: /* glsl */ `
          uniform vec3 base; uniform vec3 lift; uniform float amount; varying vec2 vUv;
          void main(){
            vec2 p = (vUv - vec2(0.56, 0.58)) * vec2(1.7778, 1.0);
            float g = exp(-dot(p, p) * 1.6);
            vec2 q = (vUv - vec2(0.18, 0.2)) * vec2(1.7778, 1.0);
            float g2 = exp(-dot(q, q) * 3.0);
            vec3 c = base + lift * g * amount + vec3(0.010, 0.006, 0.002) * g2 * amount;
            gl_FragColor = vec4(c, 1.0);
          }`,
      }),
    [look.background, look.nebulaColor, look.nebula],
  );
  void camera;
  return (
    <mesh frustumCulled={false} renderOrder={-1000} material={mat}>
      <planeGeometry args={[2, 2]} />
    </mesh>
  );
};

export const Stage: React.FC<{look: Look; cam?: Cam; children: React.ReactNode}> = ({look, cam = REST, children}) => (
  <ThreeCanvas
    width={W}
    height={H}
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
