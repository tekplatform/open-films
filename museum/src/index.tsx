import React from "react";
import {Composition, registerRoot} from "remotion";
import {DoNotTouch, DNT_SECONDS} from "./DoNotTouch";

// The same film twice: the same clock and the same hall, staged again for each frame.
const Root: React.FC = () => (
  <>
    <Composition id="DoNotTouch" component={DoNotTouch} durationInFrames={DNT_SECONDS * 60} fps={60} width={1920} height={1080} />
    <Composition id="DoNotTouch916" component={DoNotTouch} durationInFrames={DNT_SECONDS * 60} fps={60} width={1080} height={1920} />
  </>
);

registerRoot(Root);
