import React, {useMemo} from "react";
import * as THREE from "three";
import {useCurrentFrame} from "remotion";
import {useLoaded} from "./loader";
import type {V3} from "./space";

/**
 * A media card in space. The picture is never filtered (pictures stay at
 * full quality); what the card gets is optical: depth-of-field blur for
 * cards near the lens (a Vogel-disk bokeh over mip levels), a rounded mask
 * whose softness follows the blur, distance dimming, and a thin HDR gold rim
 * that the bloom pass turns into the halo the line left behind.
 * The same material renders text planes (premultiplied alpha).
 */

const VS = /* glsl */ `
  varying vec2 vUv;
  varying float vDepth;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const FS = /* glsl */ `
  uniform sampler2D map;
  uniform vec2 size;
  uniform float margin;
  uniform float blur;
  uniform float corner;
  uniform vec2 texSize;
  uniform vec3 rimColor;
  uniform float rimWidth;
  uniform float dim;
  uniform float opacity;
  uniform float matte;
  uniform float reveal;
  uniform float seed;
  uniform vec3 tint;
  uniform float wipe;
  uniform float wipeSoft;
  uniform sampler2D erodeMap;
  uniform float erodeOn;
  uniform float erodeOut;
  uniform float erodeIn;
  uniform float erodeGlow;
  uniform float wipeGlow;
  uniform float window;
  uniform vec2 cover;
  varying vec2 vUv;
  varying float vDepth;

  float sdRoundBox(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  }
  float hash(vec2 p) { p = fract(p * vec2(234.34, 435.345)); p += dot(p, p + 34.23); return fract(p.x * p.y); }

  const int N = 48;

  void main() {
    vec2 full = size + 2.0 * margin;
    vec2 p = (vUv - 0.5) * full;
    // A centred window over the picture: the picture stays put, the visible box (mask, rim,
    // corners) is narrower (window < 1) and can open out to the full card.
    float d = sdRoundBox(p, vec2(size.x * window, size.y) * 0.5, corner);
    vec2 uv = p / size + 0.5;
    // the picture keeps its own shape; the card crops it
    vec2 tuv = (uv - 0.5) * cover + 0.5;

    vec3 col = vec3(0.0);
    float a = 0.0;
    if (blur > 0.0005) {
      vec2 rUV = vec2(blur / size.x, blur / size.y);
      float texels = blur / size.x * texSize.x;
      float lod = log2(max(1.0, texels * 2.2 / sqrt(float(N))));
      for (int i = 0; i < N; i++) {
        float fi = float(i) + 0.5;
        float rr = sqrt(fi / float(N));
        float th = fi * 2.39996323;
        vec2 o = vec2(cos(th), sin(th)) * rr;
        vec4 s = textureLod(map, clamp(tuv + o * rUV, 0.001, 0.999), lod);
        col += s.rgb * s.a;
        a += s.a;
      }
      col /= max(a, 1e-4);
      a /= float(N);
    } else {
      vec4 s = texture2D(map, clamp(tuv, 0.0, 1.0));
      col = s.rgb;
      a = s.a;
    }

    // Matte "paper" treatment for the user's own photo (input vs output).
    if (matte > 0.0) {
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      vec3 m = mix(col, vec3(l) * vec3(1.03, 1.0, 0.94), 0.22);
      m = m * 0.86 + 0.035;
      m += (hash(uv * texSize + seed) - 0.5) * 0.035;
      col = mix(col, m, matte);
    }

    // Dust (world/Dust): ink leaves where the erosion field is below erodeOut
    // and arrives where it is below erodeIn; the fronts burn like embers.
    float ember = 0.0;
    if (erodeOn > 0.5) {
      float e = texture2D(erodeMap, clamp(uv, 0.0, 1.0)).r;
      float keepOut = smoothstep(erodeOut - 0.004, erodeOut + 0.004, e);
      float keepIn = 1.0 - smoothstep(erodeIn - 0.004, erodeIn + 0.004, e);
      float dOut = max(e - erodeOut, 0.0);
      float dIn = max(erodeIn - e, 0.0);
      float edgeOut = exp(-dOut * dOut / 0.00015) * step(-0.02, erodeOut) * step(erodeOut, 1.05);
      float edgeIn = exp(-dIn * dIn / 0.09) * step(-0.02, erodeIn) * step(erodeIn, 1.6);
      a *= keepOut * keepIn;
      ember = (edgeOut + 0.15 * edgeIn) * erodeGlow;
    }

    col *= tint;
    float soft = max(fwidth(d) * 0.75, blur * 0.9);
    float mask = 1.0 - smoothstep(-soft, soft, d);
    mask *= 1.0 - smoothstep(wipe - wipeSoft, wipe + wipeSoft, uv.x);
    // Light left behind the wipe's edge (the blade has just passed).
    float wglow = wipeGlow * exp(-max(wipe - uv.x, 0.0) / 0.045) * step(uv.x, wipe);

    // Light-born reveal: dark → picture, with a single gold scan line.
    float rv = clamp(reveal, 0.0, 1.0);
    float scanY = mix(-0.15, 1.15, rv);
    float scan = exp(-pow((uv.y - scanY) * 22.0, 2.0)) * (1.0 - rv) * step(0.001, rv);
    col *= smoothstep(0.0, 1.0, rv * 1.25 - (1.0 - uv.y) * 0.25);

    float rimW = max(rimWidth, soft);
    float rim = exp(-abs(d) / rimW) * (rimWidth > 0.0 ? 1.0 : 0.0);

    vec3 outc = col * dim * mask * a * opacity + rimColor * rim * opacity + vec3(2.6, 1.55, 0.55) * (scan + ember * a + wglow * a) * mask * opacity;
    // Fade out just before the near plane (cards passing the lens never pop).
    float nearK = smoothstep(0.3, 1.8, vDepth);
    outc *= nearK;
    float outa = mask * a * opacity * nearK;
    if (outa < 0.003 && max(max(outc.r, outc.g), outc.b) < 0.002) discard;
    gl_FragColor = vec4(outc, outa);
  }
`;

const cache = new Map<string, Promise<THREE.Texture>>();
export const loadTexture = (src: string) => {
  let p = cache.get(src);
  if (!p) {
    p = new Promise<THREE.Texture>((resolve, reject) => {
      new THREE.TextureLoader().load(
        src,
        (t) => {
          t.colorSpace = THREE.SRGBColorSpace;
          t.anisotropy = 8;
          t.generateMipmaps = true;
          t.minFilter = THREE.LinearMipmapLinearFilter;
          resolve(t);
        },
        undefined,
        reject,
      );
    });
    cache.set(src, p);
  }
  return p;
};

export const useTexture = (src: string) => useLoaded(src, () => loadTexture(src));

export type CardLook = {
  blur?: number;
  corner?: number;
  rim?: number;
  rimWidth?: number;
  rimColor?: THREE.Color;
  dim?: number;
  opacity?: number;
  matte?: number;
  reveal?: number;
  /** Multiplies the picture (linear). Values above 1 make type glow like the line. */
  tint?: THREE.Color;
  /** Horizontal write-on: visible where u < wipe. */
  wipe?: number;
  /** Visible width as a fraction of the card, centred (the picture does not move); 1 = whole card. */
  window?: number;
  wipeSoft?: number;
  /** Dust: the erosion field and the leave / arrive levels (see world/Dust). */
  erode?: {map: THREE.Texture; out?: number; in?: number; glow?: number};
  /** Warm light just behind a wipe's edge (0 = none). */
  wipeGlow?: number;
};

const DEFAULT_RIM = new THREE.Color(2.2, 1.3, 0.45);

export const makeCardMaterial = () =>
  new THREE.ShaderMaterial({
    vertexShader: VS,
    fragmentShader: FS,
    transparent: true,
    premultipliedAlpha: true,
    depthWrite: true,
    toneMapped: false,
    uniforms: {
      map: {value: null},
      size: {value: new THREE.Vector2(1, 1)},
      margin: {value: 0},
      blur: {value: 0},
      corner: {value: 0},
      texSize: {value: new THREE.Vector2(1, 1)},
      rimColor: {value: new THREE.Color(0, 0, 0)},
      rimWidth: {value: 0},
      dim: {value: 1},
      opacity: {value: 1},
      matte: {value: 0},
      reveal: {value: 1},
      seed: {value: 0},
      tint: {value: new THREE.Color(1, 1, 1)},
      wipe: {value: 10},
      wipeSoft: {value: 0.004},
      erodeMap: {value: null},
      erodeOn: {value: 0},
      erodeOut: {value: -1},
      erodeIn: {value: 2},
      erodeGlow: {value: 0},
      wipeGlow: {value: 0},
      window: {value: 1},
      cover: {value: new THREE.Vector2(1, 1)},
    },
  });

/** A plane showing `tex` at width w (height from the texture's aspect unless h given). */
export const TexPlane: React.FC<
  {tex: THREE.Texture; w: number; h?: number; position: V3 | THREE.Vector3; rotation?: V3; renderOrder?: number; /** Crop to the card instead of stretching. */ crop?: boolean} & CardLook
> = ({tex, crop = false, w, h, position, rotation = [0, 0, 0], renderOrder = 0, blur = 0, corner = 0, rim = 0, rimWidth = 0.012, rimColor = DEFAULT_RIM, dim = 1, opacity = 1, matte = 0, reveal = 1, tint, wipe = 10, wipeSoft = 0.004, erode, wipeGlow = 0, window = 1}) => {
  const frame = useCurrentFrame();
  const img = tex.image as {width: number; height: number};
  const height = h ?? (w * img.height) / img.width;
  const margin = Math.max(0.02, blur * 1.6 + rim * 0.15);
  const mat = useMemo(makeCardMaterial, []);
  const u = mat.uniforms;
  u.map.value = tex;
  u.size.value.set(w, height);
  u.margin.value = margin;
  u.blur.value = blur;
  u.corner.value = Math.min(corner, Math.min(w, height) / 2);
  u.texSize.value.set(img.width, img.height);
  const ca = w / height;
  const ta = img.width / img.height;
  if (crop && ca > ta) u.cover.value.set(1, ta / ca);
  else if (crop) u.cover.value.set(ca / ta, 1);
  else u.cover.value.set(1, 1);
  u.rimColor.value.copy(rimColor).multiplyScalar(rim);
  u.rimWidth.value = rim > 0 ? rimWidth : 0;
  u.dim.value = dim;
  u.opacity.value = opacity;
  u.matte.value = matte;
  u.reveal.value = reveal;
  u.seed.value = frame % 61;
  if (tint) u.tint.value.copy(tint);
  else u.tint.value.setRGB(1, 1, 1);
  u.wipe.value = wipe;
  u.wipeSoft.value = wipeSoft;
  u.wipeGlow.value = wipeGlow;
  u.window.value = window;
  u.erodeOn.value = erode ? 1 : 0;
  u.erodeMap.value = erode?.map ?? null;
  u.erodeOut.value = erode?.out ?? -1;
  u.erodeIn.value = erode?.in ?? 2;
  u.erodeGlow.value = erode?.glow ?? 0;
  const pos = Array.isArray(position) ? position : ([position.x, position.y, position.z] as V3);
  return (
    <mesh position={pos} rotation={rotation} material={mat} renderOrder={renderOrder}>
      <planeGeometry args={[w + 2 * margin, height + 2 * margin]} />
    </mesh>
  );
};

/** An image card loaded from a URL. */
export const Card: React.FC<{src: string; w: number; h?: number; position: V3 | THREE.Vector3; rotation?: V3; renderOrder?: number} & CardLook> = ({src, ...rest}) => {
  const tex = useTexture(src);
  if (!tex) return null;
  return <TexPlane tex={tex} crop {...rest} />;
};
