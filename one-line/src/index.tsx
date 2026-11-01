import React from "react";
import {Composition, registerRoot} from "remotion";
import {OneLine, type FilmProps} from "./Film";
import {FILM_END} from "./script";

// `from`/`to` (seconds) open one section or a short window of the film.
const meta = ({props}: {props: FilmProps}) => ({durationInFrames: Math.max(1, Math.round((props.to - props.from) * 60))});

const Root: React.FC = () => <Composition id="OneLine" component={OneLine} defaultProps={{from: 0, to: FILM_END}} calculateMetadata={meta} durationInFrames={60} fps={60} width={1920} height={1080} />;

registerRoot(Root);
