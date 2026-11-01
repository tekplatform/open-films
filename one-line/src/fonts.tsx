import React, {useEffect, useState} from "react";
import {continueRender, delayRender} from "remotion";
import "@fontsource/albert-sans/latin-400.css";
import "@fontsource/albert-sans/latin-600.css";
import "@fontsource/alumni-sans/latin-600.css";
import "@fontsource/instrument-serif/latin-400.css";
import "@fontsource/instrument-serif/latin-400-italic.css";
import "@fontsource/inter-tight/latin-600.css";
import "@fontsource/inter-tight/latin-700.css";
import "@fontsource/inter-tight/latin-800.css";
import "@fontsource/inter-tight/latin-900.css";
import "@fontsource/jetbrains-mono/latin-400.css";
import "@fontsource/jetbrains-mono/latin-500.css";

/** Type roles: display, mono, poetic lines in the serif, interface in Albert Sans. They install with npm, so nothing is fetched at run time. */
export const fonts = {
  inter: "Inter Tight",
  serif: "Instrument Serif",
  mono: "JetBrains Mono",
  ui: "Albert Sans",
  /** Title-card headings, condensed uppercase. */
  caps: "Alumni Sans",
} as const;

/** Canvas text needs the faces decoded, not just declared; load every weight we draw with. */
const ready = Promise.all(
  [
    `900 100px "${fonts.inter}"`,
    `800 100px "${fonts.inter}"`,
    `700 100px "${fonts.inter}"`,
    `600 100px "${fonts.inter}"`,
    `italic 400 100px "${fonts.serif}"`,
    `400 100px "${fonts.serif}"`,
    `400 100px "${fonts.mono}"`,
    `500 100px "${fonts.mono}"`,
    `600 100px "${fonts.ui}"`,
    `400 100px "${fonts.ui}"`,
    `600 100px "${fonts.caps}"`,
  ].map((f) => document.fonts.load(f)),
);

export const FilmFontGate: React.FC<{children: React.ReactNode}> = ({children}) => {
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
