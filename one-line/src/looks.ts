import type {Look} from "./world/Stage";

/**
 * The film's look: direction C from Gate 2 (A's line and depth through B's
 * lens). A and B stay here so the film can be re-rendered in either.
 */
export const LOOKS: Record<"A" | "B" | "C" | "D", Look> = {
  A: {background: "#030409", nebula: 0.55, nebulaColor: "#0B1022", bloom: {strength: 1.0, factors: [1.0, 0.85, 0.5, 0.16, 0.05]}, grain: 0.03, ca: 0.6, vignette: 0.4},
  B: {background: "#060606", nebula: 0.35, nebulaColor: "#101012", bloom: {strength: 0.85, factors: [1.0, 0.55, 0.18, 0.04, 0.0]}, grain: 0.065, ca: 1.8, vignette: 0.48},
  C: {background: "#04050A", nebula: 0.45, nebulaColor: "#0A0E1E", bloom: {strength: 0.95, factors: [1.0, 0.75, 0.36, 0.1, 0.03]}, grain: 0.045, ca: 1.1, vignette: 0.42},
  // True black, clear stars, far galaxies: gold and cards read stronger.
  D: {background: "#000000", nebula: 0, nebulaColor: "#0A0E1E", bloom: {strength: 0.95, factors: [1.0, 0.75, 0.36, 0.1, 0.03]}, grain: 0.045, ca: 1.1, vignette: 0.42},
};

export const FILM_LOOK = LOOKS.D;

/**
 * The deep field behind the film: the far star shell denser and three times brighter, a few faint far
 * galaxies; the parallax stars only a little brighter, so fast camera moves never read as particles.
 */
export const FILM_SPACE = {skyDensity: 1.8, sky: 3.0, field: 1.3, galaxies: 1};

/** Line weight of the chosen direction (tube radius in world units). */
export const LINE_R = 0.019;
export const WARM_WHITE = "#F3EDE3";
