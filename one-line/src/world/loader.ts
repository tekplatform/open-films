import {useEffect, useState} from "react";
import {useThree} from "@react-three/fiber";
import {continueRender, delayRender} from "remotion";

/**
 * Async assets inside <ThreeCanvas>. While rendering, R3F's frameloop is
 * "never", so a texture that arrives after the frame was drawn would never be
 * seen. Hold the frame, commit the asset, draw once more, then release.
 */
export const useLoaded = <T>(key: string, load: () => Promise<T>): T | null => {
  const [val, setVal] = useState<T | null>(null);
  const [handle] = useState(() => delayRender(`asset ${key}`, {timeoutInMilliseconds: 60000}));
  const advance = useThree((s) => s.advance);
  useEffect(() => {
    let alive = true;
    load().then((v) => {
      if (alive) setVal(() => v);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => {
    if (val === null) return;
    advance(performance.now());
    continueRender(handle);
  }, [val, advance, handle]);
  return val;
};
