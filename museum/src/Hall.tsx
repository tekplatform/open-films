import React, {useMemo} from "react";
import * as THREE from "three";
import {GLTFLoader} from "three/examples/jsm/loaders/GLTFLoader.js";
import {EXRLoader} from "three/examples/jsm/loaders/EXRLoader.js";
import {staticFile} from "remotion";
import {useTexture} from "./world/Card";
import {useLoaded} from "./world/loader";

/**
 * The hall: elevation photographs on simple real forms (blender/bake_hall.py). The photographs carry the carving, Cycles
 * the light, baked into public/hall/lm-*.exr. The stone stays quiet and the pictures, lit by their own lamps, are the
 * brightest thing there.
 */

const B = (f: string) => staticFile(`hall/${f}`);
export const picSrc = (file: string) => staticFile(`pictures/${file}`);

export const W = 24;
export const D = 3.2;
export const BAY = 34;
export const PH = 32;
export const PZ = 17;
export const PA = 941 / 1672;

const SURFACES: Record<string, {tex: string; gain?: number; lit?: false}> = {
  floor: {tex: "floor.jpg", gain: 1.3},
  backL: {tex: "stone.jpg", gain: 0.76},
  backR: {tex: "stone.jpg", gain: 0.76},
  vault: {tex: "vault.jpg", gain: 1.3},
  pierLo: {tex: "pier-lower.jpg", gain: 0.98},
  pierHi: {tex: "pier-upper.jpg", gain: 0.98},
  sides: {tex: "stone.jpg", gain: 0.76},
  band: {tex: "band.jpg", gain: 0.98},
  soffit: {tex: "stone.jpg", gain: 0.76},
  ribs: {tex: "stone.jpg", gain: 0.9},
  endNear: {tex: "stone.jpg", gain: 0.5},
  endFar: {tex: "end.jpg", gain: 1.2, lit: false},
};

const loadExr = (src: string) =>
  new Promise<THREE.DataTexture>((res, rej) =>
    new EXRLoader().load(
      src,
      (t) => {
        t.minFilter = THREE.LinearFilter;
        t.magFilter = THREE.LinearFilter;
        t.generateMipmaps = false;
        t.flipY = false;
        t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
        t.needsUpdate = true;
        res(t as THREE.DataTexture);
      },
      undefined,
      rej,
    ),
  );
const loadGlb = (src: string) => new Promise<THREE.Group>((res, rej) => new GLTFLoader().load(src, (g) => res(g.scene), undefined, rej));

const VS = /* glsl */ `
  attribute vec2 uv1;
  varying vec2 vUv;
  varying vec2 vLm;
  varying vec3 vW;
  void main() {
    // the glTF export flips v; our textures load with flipY, the baked maps keep Blender's orientation
    vUv = vec2(uv.x, 1.0 - uv.y);
    vLm = vec2(uv1.x, 1.0 - uv1.y);
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
const FS = /* glsl */ `
  uniform sampler2D map;
  uniform sampler2D lm;
  uniform float gain;
  uniform float polish;
  uniform float fog;
  uniform float sat;
  uniform vec3 grade;
  uniform float onZ;
  uniform float offZ;
  uniform float minLit;
  uniform float offLit;
  varying vec2 vUv;
  varying vec2 vLm;
  varying vec3 vW;
  void main() {
    vec3 a = texture2D(map, vUv).rgb;
    float g = dot(a, vec3(0.2126, 0.7152, 0.0722));
    a = mix(vec3(g), a, sat);
    vec3 lmc = texture2D(lm, vLm).rgb;
    vec3 c = a * grade * mix(vec3(dot(lmc, vec3(0.2126, 0.7152, 0.0722))), lmc, 0.35) * gain;
    c *= mix(minLit, 1.0, smoothstep(onZ - 15.0, onZ + 15.0, vW.z)) * mix(offLit, 1.0, 1.0 - smoothstep(offZ - 15.0, offZ + 15.0, vW.z));
    float d = length(vW - cameraPosition);
    float keep = exp(-d * fog);
    c = c * keep + vec3(0.006, 0.008, 0.014) * (1.0 - keep);
    if (polish > 0.0) {
      vec3 v = normalize(cameraPosition - vW);
      float f = pow(1.0 - clamp(v.y, 0.0, 1.0), 4.0);
      float r = polish * mix(0.03, 0.42, f);
      gl_FragColor = vec4(c * (1.0 - r), 1.0 - r);
      return;
    }
    gl_FragColor = vec4(c, 1.0);
  }
`;

const useHall = () => {
  const glb = useLoaded(B("hall.glb"), () => loadGlb(B("hall.glb")));
  const white = useMemo(() => {
    const t = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    t.needsUpdate = true;
    return t;
  }, []);
  const maps = Object.keys(SURFACES).map((k) => ({k, lm: useLoaded(B(`lm-${k}.exr`), () => (SURFACES[k].lit === false ? Promise.resolve(white as unknown as THREE.DataTexture) : loadExr(B(`lm-${k}.exr`)))), tex: useTexture(B(SURFACES[k].tex))}));
  return useMemo(() => {
    if (!glb || maps.some((m) => !m.lm || !m.tex)) return null;
    const out: Array<{k: string; geo: THREE.BufferGeometry; mat: THREE.ShaderMaterial; matM: THREE.ShaderMaterial}> = [];
    glb.updateMatrixWorld(true);
    glb.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const k = m.name.replace(/[._\d]+$/, "");
      const s = maps.find((x) => x.k === k);
      if (!s) return;
      const geo = m.geometry.clone().applyMatrix4(m.matrixWorld);
      const tex = s.tex as THREE.Texture;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.anisotropy = 16;
      tex.needsUpdate = true;
      const mk = (polish: number) =>
        new THREE.ShaderMaterial({
          vertexShader: VS,
          fragmentShader: FS,
          side: THREE.DoubleSide,
          toneMapped: false,
          transparent: polish > 0,
          premultipliedAlpha: true,
          uniforms: {map: {value: tex}, lm: {value: s.lm}, gain: {value: SURFACES[k].gain ?? 1}, polish: {value: polish}, fog: {value: 0.0022}, onZ: {value: -1e5}, offZ: {value: 1e5}, minLit: {value: k === "endFar" ? 0.6 : 0.14}, offLit: {value: k === "endFar" ? 0.32 : 0.02}, sat: {value: k === "endFar" ? 1 : k === "vault" ? 0.42 : 0.66}, grade: {value: k === "endFar" ? new THREE.Color(1, 1, 1) : new THREE.Color(1.0, 0.93, 0.82)}},
        });
      out.push({k, geo, mat: mk(k === "floor" ? 1 : 0), matM: mk(0)});
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [glb, ...maps.map((m) => m.lm), ...maps.map((m) => m.tex)]);
};

// ------------------------------------------------------------------ a picture lit by its lamps

const PIC_VS = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const PIC_FS = /* glsl */ `
  uniform sampler2D map;
  uniform vec2 size;
  uniform float exposure;
  uniform float blur;
  uniform sampler2D next;
  uniform float wipe;
  uniform float lit;
  uniform float dir;
  uniform vec2 coverA;
  uniform vec2 coverB;
  varying vec2 vUv;
  void main() {
    vec2 uvA = (vUv - 0.5) * coverA + 0.5;
    vec3 col;
    if (blur > 0.0) {
      col = vec3(0.0);
      for (int i = 0; i < 24; i++) {
        float fi = float(i) + 0.5;
        float th = fi * 2.39996323;
        col += textureLod(map, uvA + vec2(cos(th), sin(th)) * sqrt(fi / 24.0) * blur, 3.0).rgb;
      }
      col /= 24.0;
    } else {
      col = texture2D(map, uvA).rgb;
    }
    // 0 left to right, 1 right to left, 2 top down, 3 bottom up
    float along = dir < 0.5 ? vUv.x : dir < 1.5 ? 1.0 - vUv.x : dir < 2.5 ? 1.0 - vUv.y : vUv.y;
    if (wipe > 0.0 && along < wipe) {
      col = texture2D(next, (vUv - 0.5) * coverB + 0.5).rgb;
      col += vec3(1.15, 1.0, 0.78) * 0.5 * exp(-(wipe - along) / 0.03) * step(wipe, 1.0);
    }
    vec2 p = (vUv - vec2(0.5, 1.0)) * size;
    // three lamps on arms in front of the top edge: soft pools that fall away down the picture
    float light = 0.0;
    for (int i = 0; i < 3; i++) {
      float lx = (float(i) - 1.0) * size.x * 0.32;
      vec3 l = vec3(lx - p.x, 0.8 - p.y, 3.2);
      float d2 = dot(l, l) + 18.0;
      light += 14.0 * l.z / (d2 * sqrt(d2)) * 14.0;
    }
    light = min(0.42 + exposure * light, 1.08);
    gl_FragColor = vec4(col * light * mix(0.025, 1.0, lit), 1.0);
  }
`;

const LAMP_ARM = new THREE.Color(0.012, 0.011, 0.01);
const LAMP_ON = new THREE.Color(5.2, 4.9, 4.4);

export const LitPicture: React.FC<{id: string; next?: string; wipe?: number; side: -1 | 1; z: number; mirror?: boolean; order?: number; lit?: number; height?: number; aspect?: number; dir?: number}> = ({id, next, wipe = 0, side, z, mirror, order = 20, lit = 1, height = PH, aspect = PA, dir = 0}) => {
  const tex = useTexture(picSrc(id));
  const texNext = useTexture(picSrc(next ?? id));
  const h = height;
  const w = h * aspect;
  const mat = useMemo(() => new THREE.ShaderMaterial({vertexShader: PIC_VS, fragmentShader: PIC_FS, toneMapped: false, side: THREE.DoubleSide, uniforms: {map: {value: null}, next: {value: null}, wipe: {value: 0}, lit: {value: 1}, size: {value: new THREE.Vector2()}, exposure: {value: 0.42}, blur: {value: 0}, dir: {value: 0}, coverA: {value: new THREE.Vector2(1, 1)}, coverB: {value: new THREE.Vector2(1, 1)}}}), []);
  if (!tex || !texNext) return null;
  // any picture fits the frame: it keeps its own shape and the frame crops it
  const cover = (t: THREE.Texture) => {
    const img = t.image as {width: number; height: number};
    const ta = img.width / img.height;
    return aspect > ta ? new THREE.Vector2(1, ta / aspect) : new THREE.Vector2(aspect / ta, 1);
  };
  mat.uniforms.coverA.value.copy(cover(tex));
  mat.uniforms.coverB.value.copy(cover(texNext));
  mat.uniforms.dir.value = dir;
  mat.uniforms.map.value = tex;
  mat.uniforms.next.value = texNext;
  mat.uniforms.wipe.value = wipe;
  mat.uniforms.lit.value = lit;
  mat.uniforms.size.value.set(w, h);
  mat.uniforms.blur.value = mirror ? 0.014 : 0;
  mat.uniforms.exposure.value = mirror ? 0.2 : 0.42;
  const x = side * (W + D - 0.08);
  const rot: [number, number, number] = [0, -side * (Math.PI / 2), 0];
  const top = PZ + h / 2;
  return (
    <group>
      <mesh position={[x + side * 0.03, PZ, z]} rotation={rot} renderOrder={order - 1}>
        <planeGeometry args={[w + 0.36, h + 0.36]} />
        <meshBasicMaterial color="#050403" toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[x, PZ, z]} rotation={rot} material={mat} renderOrder={order}>
        <planeGeometry args={[w, h]} />
      </mesh>
      {[-0.32, 0, 0.32].map((k) => (
        <group key={k}>
          <mesh position={[x - side * 1.35, top + 1.1, z + k * w]} renderOrder={order}>
            <boxGeometry args={[2.7, 0.08, 0.08]} />
            <meshBasicMaterial color={LAMP_ARM} toneMapped={false} />
          </mesh>
          <mesh position={[x - side * 2.7, top + 0.95, z + k * w]} renderOrder={order}>
            <cylinderGeometry args={[0.2, 0.28, 0.5, 14]} />
            <meshBasicMaterial color={LAMP_ARM} toneMapped={false} />
          </mesh>
          <mesh position={[x - side * 2.7, top + 0.68, z + k * w]} renderOrder={order + 1}>
            <circleGeometry args={[0.22, 16]} />
            <meshBasicMaterial color={LAMP_ON.clone().multiplyScalar(Math.max(0.015, lit))} toneMapped={false} side={THREE.DoubleSide} />
          </mesh>
        </group>
      ))}
    </group>
  );
};

export const litAt = (z: number, onZ: number, offZ: number) => {
  const s = (a: number, b: number, x: number) => {
    const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return k * k * (3 - 2 * k);
  };
  return s(onZ - 9, onZ + 9, z) * (1 - s(offZ - 9, offZ + 9, z));
};

export const Hall: React.FC<{onZ?: number; offZ?: number; /** How much of the lamps' light the dark hall keeps once they are out. */ embers?: number; /** 1: even the far glass has gone. */ away?: number; pictures: (mirror: boolean) => React.ReactNode}> = ({onZ = -1e5, offZ = 1e5, embers = 0, away = 0, pictures}) => {
  const hall = useHall();
  if (!hall) return null;
  hall.forEach((h) => {
    for (const m of [h.mat, h.matM]) {
      m.uniforms.onZ.value = onZ;
      m.uniforms.offZ.value = offZ;
      m.uniforms.offLit.value = (h.k === "endFar" ? 0.32 : 0.02 + 0.98 * embers) * (1 - away);
    }
  });
  return (
    <>
      <group scale={[1, -1, 1]}>
        {hall
          .filter((h) => h.k !== "floor")
          .map((h) => (
            <mesh key={h.k} geometry={h.geo} material={h.matM} renderOrder={-10} />
          ))}
        {pictures(true)}
      </group>
      {hall
        .filter((h) => h.k === "floor")
        .map((h) => (
          <mesh key={h.k} geometry={h.geo} material={h.mat} renderOrder={5} />
        ))}
      {hall
        .filter((h) => h.k !== "floor")
        .map((h) => (
          <mesh key={h.k} geometry={h.geo} material={h.mat} renderOrder={-5} />
        ))}
      {pictures(false)}
    </>
  );
};
