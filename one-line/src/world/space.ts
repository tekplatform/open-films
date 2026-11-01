import * as THREE from "three";

/**
 * World units. The camera rests at z = CAM_Z looking down −z with a 40° vertical
 * fov, so on the focal plane (z = 0) one unit is exactly 100 px of a 1080p frame.
 * Everything else (depth, parallax, size falloff) is real perspective.
 */
export const W = 1920;
export const H = 1080;
export const FOV = 40;
export const TAN = Math.tan(((FOV / 2) * Math.PI) / 180);
export const CAM_Z = H / 2 / 100 / TAN; // 14.836…

/** Half height of the view at depth z for a camera at (0, 0, camZ). */
export const halfH = (z: number, camZ = CAM_Z) => (camZ - z) * TAN;

/** Screen pixel → world point at depth z (static camera at rest). */
export const at = (px: number, py: number, z = 0, camZ = CAM_Z): THREE.Vector3 => {
  const hh = halfH(z, camZ);
  const hw = (hh * W) / H;
  return new THREE.Vector3((px / W - 0.5) * 2 * hw, -(py / H - 0.5) * 2 * hh, z);
};

/** World size of `px` pixels seen at depth z. */
export const px = (pixels: number, z = 0, camZ = CAM_Z) => (pixels / H) * 2 * halfH(z, camZ);

export type V3 = [number, number, number];
export const v3 = (v: THREE.Vector3): V3 => [v.x, v.y, v.z];

/** Deterministic PRNG (mulberry32). */
export const rng = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** Linear-light HDR gold. Values above 1 bloom; the finish pass maps them hue-true. */
export const GOLD = {
  /** The line's body. */
  line: new THREE.Color(2.6, 1.55, 0.55),
  /** The pen: a white-hot core. */
  core: new THREE.Color(14, 11, 7),
  /** Halo around the pen. */
  halo: new THREE.Color(1.3, 0.72, 0.24),
  /** Flat gold for the logo fill and type, display-referred sRGB. */
  flat: "#E9B860",
  flatSoft: "rgba(233,184,96,0.72)",
} as const;
