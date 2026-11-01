import React, {useEffect, useLayoutEffect, useRef, useState} from "react";
import * as THREE from "three";
import {useThree} from "@react-three/fiber";
import {cancelRender, continueRender, delayRender, useRemotionEnvironment} from "remotion";
import {NoReactInternals} from "remotion/no-react";
import {TexPlane, useTexture, type CardLook} from "./Card";
import {CLIP_SECONDS} from "../../pictures";
import type {V3} from "./space";

/**
 * A clip on a card. While rendering, each frame of the source is pulled
 * through Remotion's frame server at the exact media time, committed, drawn,
 * and only then released (frameloop "never" would otherwise show a stale
 * frame). In the Studio preview, or with no clip at all, the poster stands in.
 */
export const useVideoFrame = (src: string | undefined, poster: string, mediaTime: number, duration = CLIP_SECONDS) => {
  const {isRendering} = useRemotionEnvironment();
  const posterTex = useTexture(poster);
  const advance = useThree((s) => s.advance);
  const fps = 60;
  const looped = ((mediaTime % duration) + duration) % duration;
  const tq = Math.round(looped * fps) / fps;
  const url = isRendering && src ? NoReactInternals.getOffthreadVideoSource({src, currentTime: tq, transparent: false, toneMapped: true}) : null;
  const [frame, setFrame] = useState<{url: string; tex: THREE.Texture} | null>(null);
  const pending = useRef<number | null>(null);
  const prev = useRef<THREE.Texture | null>(null);

  useLayoutEffect(() => {
    if (!url) return;
    const h = delayRender(`video frame ${src} @${tq}`, {timeoutInMilliseconds: 60000});
    pending.current = h;
    let alive = true;
    new THREE.TextureLoader().load(
      url,
      (tex) => {
        if (!alive) {
          tex.dispose();
          return;
        }
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.generateMipmaps = true;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.anisotropy = 4;
        setFrame({url, tex});
      },
      undefined,
      (err) => cancelRender(err),
    );
    return () => {
      alive = false;
      if (pending.current === h) {
        continueRender(h);
        pending.current = null;
      }
    };
  }, [url, src, tq]);

  useEffect(() => {
    if (!frame || frame.url !== url || pending.current === null) return;
    if (prev.current && prev.current !== frame.tex) prev.current.dispose();
    prev.current = frame.tex;
    advance(performance.now());
    continueRender(pending.current);
    pending.current = null;
  }, [frame, url, advance]);

  return (frame && frame.url === url ? frame.tex : null) ?? (isRendering && frame ? frame.tex : posterTex);
};

export const VideoCard: React.FC<
  {src?: string; poster: string; time: number; duration?: number; w: number; h: number; position: V3 | THREE.Vector3; rotation?: V3; renderOrder?: number} & CardLook
> = ({src, poster, time, duration, ...rest}) => {
  const tex = useVideoFrame(src, poster, time, duration);
  if (!tex) return null;
  return <TexPlane tex={tex} crop {...rest} />;
};
