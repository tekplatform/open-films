/**
 * The narration, split into cues at every point a picture event must land on a word. `gap` is the silence before the cue
 * in seconds; `at` pins a cue to an absolute time (section openers). The measured times are in vo-timing.json and
 * narration.md; the film reads those.
 */

export type Section = "C0" | "C1" | "C2" | "C3" | "C4" | "C5" | "C6" | "C7";

export type Cue = {id: string; section: Section; text: string; gap?: number; at?: number};

/** 96 BPM grid (script §1). A bar is 2.5 s. */
export const BPM = 96;
export const BEAT = 60 / BPM;
export const BAR = BEAT * 4;

/** A breath after the last ad, before everything gathers into the constellation. Two beats, so every later cut stays on the grid. */
export const BREATH = BEAT * 2;

/** Section starts on bar lines (script windows: C0 0:00, C1 0:20, C2 0:58 …). */
export const SECTION_AT: Record<Section, number> = {
  C0: 0,
  C1: 22.5,
  C2: 50,
  C3: 90,
  C4: 115,
  C5: 142.5,
  C6: 165,
  C7: 215 + BREATH,
};

export const CUES: Cue[] = [
  // C0 · cold open: 1.5 s of a breathing point, then the line writes and gets attacked.
  // The voice enters just after the last keystroke (typing ends on the catch, 8.0), never over it.
  {id: "c0.1", section: "C0", text: "AI isn't just evolving anymore.", at: 8.15},
  {id: "c0.2", section: "C0", text: "It's accelerating.", gap: 0.15},
  {id: "c0.3", section: "C0", text: "Every single week, there's a new model.", gap: 0.6},
  {id: "c0.4", section: "C0", text: "A new capability.", gap: 0.2},
  {id: "c0.5", section: "C0", text: "A new breakthrough.", gap: 0.2},
  {id: "c0.6", section: "C0", text: "But let's be honest…", gap: 0.7},
  {id: "c0.7", section: "C0", text: "can anyone actually keep up?", gap: 0.35},

  // C1 · the tangle.
  {id: "c1.1", section: "C1", text: "To create something truly beautiful, you're suddenly expected to understand", at: 23.75},
  {id: "c1.2", section: "C1", text: "prompt engineering,", gap: 0.12},
  {id: "c1.3", section: "C1", text: "filmmaking,", gap: 0.1},
  {id: "c1.4", section: "C1", text: "design,", gap: 0.1},
  {id: "c1.5", section: "C1", text: "editing,", gap: 0.1},
  {id: "c1.6", section: "C1", text: "and complex production pipelines.", gap: 0.1},
  {id: "c1.7", section: "C1", text: "All at once.", gap: 0.45},
  {id: "c1.8", section: "C1", text: "You spend more time learning the tools than actually creating with them.", gap: 0.9},
  {id: "c1.9", section: "C1", text: "Every time a new model arrives:", gap: 0.7},
  {id: "c1.10", section: "C1", text: "another workflow.", gap: 0.15},
  {id: "c1.11", section: "C1", text: "Another interface.", gap: 0.15},
  {id: "c1.12", section: "C1", text: "Another learning curve.", gap: 0.15},
  // 2 s of total stillness: the music cuts, the pen breathes.
  {id: "c1.13", section: "C1", text: "It shouldn't be this hard.", gap: 1.4},

  // C2 · the turn.
  {id: "c2.1", section: "C2", text: "What if you didn't need to know which model is winning today?", at: 51.25},
  {id: "c2.2", section: "C2", text: "What if you could just…", gap: 0.5},
  {id: "c2.3", section: "C2", text: "talk?", gap: 0.25},
  {id: "c2.4", section: "C2", text: "Tell your agent what you want to create.", gap: 0.7},
  {id: "c2.5", section: "C2", text: "Bring an idea.", gap: 0.5},
  {id: "c2.6", section: "C2", text: "Bring a product.", gap: 0.2},
  {id: "c2.7", section: "C2", text: "Bring a photograph.", gap: 0.2},
  {id: "c2.8", section: "C2", text: "Or simply discover something that inspires you.", gap: 0.45},
  {id: "c2.9", section: "C2", text: "Behind the scenes, your agent understands your intent,", gap: 0.6},
  {id: "c2.10", section: "C2", text: "picks the right tools,", gap: 0.1},
  {id: "c2.11", section: "C2", text: "and shows you the plan before anything is made.", gap: 0.1},
  {id: "c2.12", section: "C2", text: "You approve.", gap: 0.6},
  {id: "c2.13", section: "C2", text: "Your agent handles the rest.", gap: 0.25},
  {id: "c2.14", section: "C2", text: "No model hunting.", gap: 0.7},
  {id: "c2.15", section: "C2", text: "No complicated pipelines.", gap: 0.25},
  {id: "c2.16", section: "C2", text: "No prompt engineering required.", gap: 0.25},
  {id: "c2.17", section: "C2", text: "Just your imagination.", gap: 0.7},
  {id: "c2.18", section: "C2", text: "And a conversation.", gap: 0.3},

  // C3 · discover.
  {id: "c3.1", section: "C3", text: "From inspiration to creation.", at: 92.5},
  {id: "c3.2", section: "C3", text: "Discover something you love.", at: 97.5},
  {id: "c3.3", section: "C3", text: "Make it your own.", at: 107.5},

  // C4 · the living template.
  {id: "c4.1", section: "C4", text: "Because behind every card is a living template.", at: 116.25},
  {id: "c4.2", section: "C4", text: "Not a rigid preset, but a creative intent.", gap: 0.8},
  {id: "c4.3", section: "C4", text: "Your agent understands the original vision.", gap: 1.8},
  {id: "c4.4", section: "C4", text: "The movement.", gap: 0.3},
  {id: "c4.5", section: "C4", text: "The rhythm.", gap: 0.25},
  {id: "c4.6", section: "C4", text: "The atmosphere.", gap: 0.25},
  {id: "c4.7", section: "C4", text: "The visual language.", gap: 0.25},
  {id: "c4.8", section: "C4", text: "Then reimagines that creative world around your photo.", gap: 0.8},
  {id: "c4.9", section: "C4", text: "Your product.", gap: 0.35},
  {id: "c4.10", section: "C4", text: "Your story.", gap: 0.35},

  // C5 · the language you don't need.
  {id: "c5.1", section: "C5", text: "And here's the beautiful part.", at: 143.75},
  {id: "c5.2", section: "C5", text: "You don't need to know the language of filmmaking.", gap: 0.45},
  {id: "c5.3", section: "C5", text: "Push in.", gap: 0.7},
  {id: "c5.4", section: "C5", text: "Dolly out.", gap: 0.35},
  // The list is read briskly (that is the joke); the camera does not wait for each word (S5 `choreo`).
  {id: "c5.5", section: "C5", text: "Fisheye.", gap: 0.35},
  {id: "c5.6", section: "C5", text: "Bird's-eye.", gap: 0.35},
  {id: "c5.7", section: "C5", text: "Lens choices.", gap: 0.35},
  {id: "c5.8", section: "C5", text: "Lighting.", gap: 0.35},
  {id: "c5.9", section: "C5", text: "None of that is your job.", gap: 0.8},
  {id: "c5.10", section: "C5", text: "You bring the product.", gap: 1.0},
  {id: "c5.11", section: "C5", text: "Your agent directs the shot.", gap: 0.3},

  // C6 · one conversation.
  {id: "c6.1", section: "C6", text: "A single photograph can become a cinematic experience.", at: 166.25},
  // The fitting room and wardrobe right after the photo, then the fashion editorial as the bridge, and the ads last.
  {id: "c6.4", section: "C6", text: "A screenshot can become something you're wearing.", gap: 1.7},
  // The wardrobe and try-on.
  {id: "c6.4b", section: "C6", text: "Every piece you photograph settles into your wardrobe.", gap: 1.5},
  {id: "c6.4c", section: "C6", text: "See it on you, before you buy.", gap: 2.6},
  {id: "c6.2", section: "C6", text: "A fashion image can become a moving editorial.", gap: 3.7},
  // Two beats: the first ad on the first line, the second on the next; then it plays to its end.
  {id: "c6.3", section: "C6", text: "The ad you admire becomes yours.", gap: 1.9},
  {id: "c6.3b", section: "C6", text: "In your language.", gap: 0.65},
  {id: "c6.3c", section: "C6", text: "And brought to life.", gap: 0.65},
  // After the ad lands back on its poster.
  {id: "c6.5", section: "C6", text: "One idea.", at: 210.25 + BREATH},
  {id: "c6.6", section: "C6", text: "One conversation.", gap: 0.35},
  {id: "c6.7", section: "C6", text: "Endless ways to create.", gap: 0.35},

  // C7 · the reveal. Slower and lower.
  {id: "c7.1", section: "C7", text: "The models will keep changing.", at: 216.25 + BREATH},
  {id: "c7.2", section: "C7", text: "Every single week.", gap: 0.4},
  {id: "c7.3", section: "C7", text: "You don't have to.", gap: 1.1},
  // Then silence: the line draws the composer and writes the slogan in it; the address follows.
];

/** The film ends ~4 s after the address has settled under the slogan. */
export const FILM_END = 238 + BREATH;
