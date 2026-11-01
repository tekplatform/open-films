import React, {useEffect, useState} from "react";
import {continueRender, delayRender} from "remotion";
import "@fontsource/bodoni-moda/latin-500-italic.css";
import "@fontsource/cinzel/latin-600.css";
import "@fontsource/jetbrains-mono/latin-400.css";

/** Carved capitals for the museum, a warm italic for you, mono for the last line. They install with npm, so nothing is fetched at run time. */
export const fonts = {
  bodoni: "Bodoni Moda",
  cinzel: "Cinzel",
  jetbrains: "JetBrains Mono",
} as const;

/** Canvas text (type planes in the 3D world) needs the faces decoded. */
const ready = Promise.all([`italic 500 100px "${fonts.bodoni}"`, `600 100px "${fonts.cinzel}"`, `400 100px "${fonts.jetbrains}"`].map((f) => document.fonts.load(f)));

export const FontGate: React.FC<{children: React.ReactNode}> = ({children}) => {
  const [ok, setOk] = useState(false);
  const [handle] = useState(() => delayRender("fonts"));
  useEffect(() => {
    ready.then(() => {
      setOk(true);
      continueRender(handle);
    });
  }, [handle]);
  return ok ? <>{children}</> : null;
};
