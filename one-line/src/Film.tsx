import React from "react";
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from "remotion";
import {FilmFontGate} from "./fonts";
import {FILM_LOOK, FILM_SPACE} from "./looks";
import {S1} from "./scenes/s1";
import {S2} from "./scenes/s2";
import {S3} from "./scenes/s3";
import {S4} from "./scenes/s4";
import {S5} from "./scenes/s5";
import {S6} from "./scenes/s6";
import {S7} from "./scenes/s7";
import type {Scene} from "./scenes/types";
import {Space} from "./world/Cosmos";
import {Stage} from "./world/Stage";

/**
 * One Line: the whole film as one function of time. Scenes share one world, one camera and one endless space; a scene owns
 * the camera while t is inside it. `from`/`to` render a window of the film.
 */

export const SCENES: Scene[] = [S1, S2, S3, S4, S5, S6, S7];

const sceneAt = (t: number) => SCENES.find((s) => t >= s.from && t < s.to) ?? SCENES[SCENES.length - 1];

export type FilmProps = {from: number; to: number};

export const OneLine: React.FC<FilmProps> = ({from}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = from + frame / fps;
  const scene = sceneAt(t);
  const cam = scene.camera(t);
  const live = SCENES.filter((s) => t >= s.from - (s.pre ?? 0) && t < s.to + (s.post ?? 0));
  return (
    <FilmFontGate>
      <AbsoluteFill style={{background: FILM_LOOK.background}}>
        <Stage look={FILM_LOOK} cam={cam}>
          <Space cam={cam.position} dust={scene.dust ?? 0.6} skyDensity={FILM_SPACE.skyDensity} sky={FILM_SPACE.sky} field={FILM_SPACE.field} galaxies={FILM_SPACE.galaxies} />
          {live.map((s) => (
            <s.World key={s.id} t={t} />
          ))}
        </Stage>
        {scene.Overlay ? <scene.Overlay t={t} /> : null}
      </AbsoluteFill>
    </FilmFontGate>
  );
};
