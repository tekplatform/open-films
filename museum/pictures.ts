/**
 * Every picture in the film. The files live in public/pictures/: replace them, or add yours and change the names here.
 * Any shape works, the frames crop to fit, but the walls are tall (9:16) and the wide recesses are 16:9.
 */

const dancer = "dancer.jpg";
const dancerInk = "dancer-ink.jpg";
const dog = "dog-king.jpg";
const cat = "cat-boss.jpg";
const dinner = "dinner.jpg";
const carDay = "car-day.jpg";
const carSnow = "car-snow.jpg";
const carSnowClean = "car-snow-clean.jpg";
const carCutout = "car-cutout.png";
const room = "room.jpg";

/** The quiet pictures on both walls between the moments. They repeat in this order. */
export const WALL = [dog, dinner, dancerInk, cat, dancer];

/** The moments: each picture hangs as `from` and the line wipes in `to`. `chip` is the small photo it starts from. */
export const MOMENTS = {
  first: {from: dancerInk, to: dancer},
  face: {from: dancer, to: dancerInk, chip: dog},
  product: {from: dinner, to: cat, chip: dancer},
  dinner: {from: dog, to: dinner},
  birthday: {from: cat, to: dog, chip: dinner},
  city: {from: dancerInk, to: cat},
  language: [dinner, dancer, dog],
  style: [dancer, dancerInk, dog, cat, dinner, dancer, dancerInk],
  dog: {from: cat, to: dog},
  cat,
  restored: {from: dinner, to: dancerInk},
};

/** The wide recess on the left: six pictures in a row. */
export const ROOMS = [room, carDay, room, carSnowClean, room, carDay];

/**
 * The wide recess on the right: one photo in every form. `cutout` is a PNG with a transparent background.
 * "Take that out" needs three things that match: `withMan`, `withoutMan` and `manMask` (white where the thing to remove
 * is). If you change them, also replace src/man-contour.json (the outline the line traces) and src/man-flakes.json (where
 * the snow starts); both hold points in 0..1 picture coordinates.
 */
export const CAR = {
  start: carDay,
  tall: carDay,
  square: carDay,
  cutout: carCutout,
  next: carDay,
  withMan: carSnow,
  withoutMan: carSnowClean,
  manMask: "car-snow-mask.png",
};

/** On the far wall, as the hall opens at the end. */
export const FINAL_WIDE = carSnowClean;

/** The tunnel near the end: [file, width / height]. */
export const TUNNEL: Array<[string, number]> = [
  [dancer, 9 / 16],
  [carDay, 16 / 9],
  [dog, 9 / 16],
  [room, 16 / 9],
  [cat, 9 / 16],
  [carSnowClean, 16 / 9],
  [dinner, 9 / 16],
  [dancerInk, 9 / 16],
];
