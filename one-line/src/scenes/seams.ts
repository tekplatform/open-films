import * as THREE from "three";
import {at} from "../timing";
import type {CamKey} from "../world/track";

/**
 * Places and first moves shared across scene seams. A scene appends the next
 * scene's first move as a ghost key, so the camera's velocity runs straight
 * through the seam instead of stopping on it.
 */
export const O5 = new THREE.Vector3(20, 0.3, -482);
export const O6 = new THREE.Vector3(34, -0.4, -505);
// The constellation sits at the end of S6's path (photo → fitting room → wardrobe → editorial → ads).
export const STAR = O6.clone().add(new THREE.Vector3(54, 0.2, -42));

export const S5_FIRST: CamKey = {t: at("c5.2"), pos: [O5.x - 0.4, O5.y + 0.3, O5.z + 9.6], look: [O5.x, O5.y, O5.z]};
export const S6_FIRST: CamKey = {t: at("c6.1") + 0.3, pos: [O6.x + 0.4, O6.y + 0.3, O6.z + 10.5], look: [O6.x, O6.y, O6.z]};
export const S7_FIRST: CamKey = {t: at("c7.1") + 0.8, pos: [STAR.x + 3.2, STAR.y + 0.5, STAR.z + 19], look: [STAR.x + 9, STAR.y - 0.2, STAR.z - 8]};
/** S7: on the pen for "You don't have to.", then at rest beside it while the composer is drawn. */
export const S7_REST = STAR.clone().add(new THREE.Vector3(1.9, -0.05, 0));
export const S7_HOME: CamKey = {t: at("c7.3"), pos: [STAR.x + 0.8, STAR.y + 0.15, STAR.z + 11.5], look: [STAR.x + 0.8, STAR.y, STAR.z]};
export const S7_SETTLE: CamKey = {t: at("c7.3") + 1.8, pos: [S7_REST.x - 0.4, S7_REST.y + 0.05, S7_REST.z + 10.2], look: [S7_REST.x - 0.4, S7_REST.y, S7_REST.z]};
