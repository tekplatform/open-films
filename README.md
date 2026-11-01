# Open Films

The motion and edit of two videos, written in code. Take them apart, swap in your own pictures, and make something else.

Nothing here is behind glass.

| Film | Length | Watch |
|---|---|---|
| One Line | 3:59 | [link](https://pub-937831a6e02848c9a52a05af1ed99ac1.r2.dev/masters/tek-cizgi-v7.3/tek-cizgi-v7.3-1080p60-paylasim.mp4) |
| Do Not Touch | 2:52 | [link](https://pub-937831a6e02848c9a52a05af1ed99ac1.r2.dev/masters/do-not-touch/do-not-touch-16x9-paylasim.mp4) |

## How it was made

Claude Opus 5.5 wrote the code. Necati Guney directed both films, scene by scene, in conversation.

**Both films**
- Remotion: timeline and rendering
- Three.js and React Three Fiber: the 3D scenes
- ElevenLabs: voice and music (not included in this repo)

**One Line** is built around a single continuous line of light. The camera follows it, so the line replaces the cuts. The idea was inspired by a math animation credited to 北大糖的数学课.

**Do Not Touch** takes place in a museum hall. Its lighting was baked in Blender and loaded into Three.js, so the hall renders quickly and every frame comes out the same. Each picture has its own lamps, calculated in the scene. The Blender script is included if you want to change the hall or render the light at full quality.

## Run it

You need Node.js. Blender is optional.

```
git clone https://github.com/tekplatform/open-films
cd open-films/museum    # or one-line
npm install
npm start
```

The films render silent. Add your own voice and music.

## Use your own pictures

Replace the sample pictures and edit the list in `pictures.ts`.

## License

Code and sample pictures: MIT, provided as is.
The TekPlatform name and logo are not included in this license.
Remotion has its own license. It is free for individuals and small teams; check whether yours qualifies.

---

Made by Necati Guney. These films introduce TekPlatform: tekplatform.ai
