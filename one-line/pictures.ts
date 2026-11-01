import {staticFile} from "remotion";

/**
 * Every picture in the film. The files live in public/pictures/: replace them, or add yours and change the names here.
 * Any shape works, cards crop to fit; `aspect` is the shape of the card (width / height), not of the picture.
 *
 * Video slots are stills here. To play a clip on a card, put it in public/ and add `video: pic("clip.mp4")` to the slot:
 * rendered frames pull the clip at the right time, the Studio preview shows the poster.
 */

export const pic = (file: string) => staticFile(`pictures/${file}`);

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

type Slot = {poster: string; video?: string; aspect: number};
const slot = (file: string, aspect: number): Slot => ({poster: pic(file), aspect});

/** How long your clips are, in seconds. Clips loop on this length. */
export const CLIP_SECONDS = 15;

/** The cards with a part to play. */
export const M = {
  // The card the camera goes into, on "Make it your own."
  hero: slot(dancerInk, 2 / 3),
  product: slot(dinner, 9 / 16),
  editorial: slot(carSnow, 16 / 9),
  street: slot(carDay, 1.5),
  nearTall: slot(cat, 9 / 16),
  nearPortrait: slot(dancer, 2 / 3),
  nearWide: slot(room, 1.5),
  poster: slot(dog, 9 / 16),
  // What people bring.
  yourPhoto: {src: pic(dancer), aspect: 2 / 3},
  yourProduct: {src: pic(dinner), aspect: 4 / 5},
  yourPortrait: {src: pic(dog)},
};

/** "A single photograph": one photo opens into four clips. */
export const ONE_PHOTO = {src: pic(carDay), aspect: 1600 / 1170, clips: [slot(carSnow, 1476 / 1080), slot(room, 1476 / 1080), slot(carSnowClean, 1476 / 1080), slot(carDay, 1476 / 1080)]};

/** "The ad you admire becomes yours": a poster wiped into another one. */
export const AD = {before: pic(cat), after: pic(dinner), aspect: 2 / 3};

/** "In your language. And brought to life.": a poster wiped into another one, then a clip that plays out. These cards open out to 16:9. */
export const AD_LIVE = {before: pic(room), after: pic(carDay), clip: {poster: pic(carDay)} as {poster: string; video?: string}, clipSeconds: 15.1};

/** "A screenshot can become something you're wearing." The piece is lifted off the screenshot and carried onto the person. */
export const FITTING = {screenshot: pic(carDay), person: pic(room), worn: pic(carSnowClean), piece: pic(carCutout), pieceAspect: 16 / 9};

/** The wardrobe: an outfit photo, you, the two try-ons, and the twelve pieces on its shelves. Cut-outs (PNG) look best as pieces. */
const piece = (file: string, aspect: number) => ({src: pic(file), aspect});
export const WARDROBE = {
  outfit: pic(dancer),
  you: pic(dancerInk),
  tryOnA: pic(dog),
  tryOnB: pic(cat),
  pieces: [piece(carCutout, 16 / 9), piece(dinner, 1 / 2), piece(dog, 1 / 2), piece(cat, 1 / 2), piece(dancer, 4 / 5), piece(room, 3 / 4), piece(carDay, 3 / 5), piece(dinner, 2 / 3), piece(dancerInk, 6 / 7), piece(dog, 4 / 5), piece(carSnow, 1 / 2), piece(cat, 1)],
};

/** The wall of cards behind everything: [file, card width / height]. It repeats, so a few are enough. */
export const WALL: Array<[string, number]> = [
  [carDay, 4 / 3],
  [dancer, 2 / 3],
  [room, 1.5],
  [cat, 2 / 3],
  [carSnowClean, 1.5],
  [dinner, 2 / 3],
  [carSnow, 4 / 3],
  [dog, 9 / 16],
  [dancerInk, 9 / 16],
];
