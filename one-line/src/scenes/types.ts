import type React from "react";
import type {Cam} from "../world/Stage";

/** A stretch of the film in the shared world. Everything is a function of global time t. */
export type Scene = {
  id: string;
  from: number;
  to: number;
  camera: (t: number) => Cam;
  World: React.FC<{t: number}>;
  /** DOM layer above the frame (type that must stay crisp). */
  Overlay?: React.FC<{t: number}>;
  /** Keep the world mounted around the cut so its objects can be seen across a seam. */
  pre?: number;
  post?: number;
  dust?: number;
};
