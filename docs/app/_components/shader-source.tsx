"use client";

import {
  createContext,
  useContext,
  useRef,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { ShaderLabComposition, type ShaderLabConfig } from "@basementstudio/shader-lab";

const config: ShaderLabConfig = {
  layers: [
    {
      blendMode: "normal",
      compositeMode: "filter",
      maskConfig: { invert: false, mode: "multiply", source: "luminance" },
      hue: 0,
      id: "61605ff0-1215-48ca-8e02-8b77400ce74b",
      kind: "effect",
      name: "Bloom",
      opacity: 1,
      params: {
        bloomIntensity: 0.8,
        bloomThreshold: 0.53,
        bloomRadius: 5.25,
        bloomSoftness: 0,
        bloomKnee: 0.2,
        highlightDrive: 1.49,
      },
      saturation: 1,
      type: "bloom",
      visible: true,
    },
    {
      blendMode: "normal",
      compositeMode: "filter",
      maskConfig: { invert: false, mode: "multiply", source: "luminance" },
      hue: 0,
      id: "4c72dea0-f57e-4b86-8ef9-bea5cfd3b9b3",
      kind: "effect",
      name: "ASCII",
      opacity: 1,
      params: {
        cellSize: 13,
        charset: "binary",
        customChars: " .:-=+*#%@",
        fontWeight: "thin",
        colorMode: "source",
        monoColor: "#f5f5f0",
        bgOpacity: 0,
        invert: false,
        toneMapping: "cinematic",
        glyphSignalMode: "luminance",
        colorSignalMode: "luminance",
        signalBlackPoint: 0,
        signalWhitePoint: 1,
        signalGamma: 0.98,
        presenceThreshold: 0,
        presenceSoftness: 0,
        shimmerAmount: 0.93,
        shimmerSpeed: 8.7,
        directionBias: 0,
        bloomEnabled: true,
        bloomIntensity: 1.25,
        bloomThreshold: 0.6,
        bloomRadius: 6,
        bloomSoftness: 0.35,
      },
      saturation: 1,
      type: "ascii",
      visible: true,
    },
    {
      blendMode: "normal",
      compositeMode: "filter",
      maskConfig: { invert: false, mode: "multiply", source: "luminance" },
      hue: 0,
      id: "6bfa2084-cf57-4f8a-bb49-57cfa1c74b1c",
      kind: "effect",
      name: "Dithering",
      opacity: 1,
      params: {
        preset: "custom",
        algorithm: "bayer-4x4",
        colorMode: "source",
        monoColor: "#f5f5f0",
        shadowColor: "#101010",
        highlightColor: "#f5f2e8",
        pixelSize: 2,
        spread: 0.37,
        levels: 2,
        dotScale: 1,
        animateDither: true,
        ditherSpeed: 0.5,
        chromaticSplit: true,
      },
      saturation: 1,
      type: "dithering",
      visible: true,
    },
    {
      blendMode: "normal",
      compositeMode: "filter",
      maskConfig: { invert: false, mode: "multiply", source: "luminance" },
      hue: 0,
      id: "091d8893-33b9-439f-a20e-e76b897d1bff",
      kind: "source",
      name: "Image",
      opacity: 1,
      params: {
        fitMode: "cover",
        scale: 1,
        offset: [0, 0],
        svgRasterResolution: "1024",
      },
      saturation: 1,
      type: "image",
      visible: true,
      asset: {
        fileName: "notifykit_logo.png",
        kind: "image",
        src: "/logo.png",
      },
    },
  ],
  timeline: {
    duration: 20,
    loop: true,
    tracks: [],
  },
};

type RegisterMirror = (canvas: HTMLCanvasElement | null) => () => void;

const ShaderContext = createContext<RegisterMirror | null>(null);

export function ShaderProvider({ children }: { children: ReactNode }) {
  const sourceRef = useRef<HTMLDivElement>(null);
  const mirrors = useRef<Set<HTMLCanvasElement>>(new Set());
  const rafId = useRef<number>(0);

  const register: RegisterMirror = useCallback((canvas) => {
    if (!canvas) return () => {};
    mirrors.current.add(canvas);
    return () => { mirrors.current.delete(canvas); };
  }, []);

  useEffect(() => {
    let running = true;

    function draw() {
      if (!running) return;
      const source = sourceRef.current?.querySelector("canvas");
      if (source && source.width > 0 && source.height > 0) {
        for (const mirror of mirrors.current) {
          if (mirror.width !== source.width) mirror.width = source.width;
          if (mirror.height !== source.height) mirror.height = source.height;
          const ctx = mirror.getContext("2d");
          if (ctx) {
            ctx.clearRect(0, 0, mirror.width, mirror.height);
            ctx.drawImage(source, 0, 0);
          }
        }
      }
      rafId.current = requestAnimationFrame(draw);
    }

    rafId.current = requestAnimationFrame(draw);
    return () => {
      running = false;
      cancelAnimationFrame(rafId.current);
    };
  }, []);

  return (
    <ShaderContext.Provider value={register}>
      <div
        ref={sourceRef}
        aria-hidden="true"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: 512,
          height: 512,
          pointerEvents: "none",
          opacity: 0,
          zIndex: -9999,
        }}
      >
        <ShaderLabComposition config={config} />
      </div>
      {children}
    </ShaderContext.Provider>
  );
}

export function ShaderMirror({ className }: { className?: string }) {
  const register = useContext(ShaderContext);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!register || !canvasRef.current) return;
    return register(canvasRef.current);
  }, [register]);

  return (
    <div className={className}>
      <canvas ref={canvasRef} />
    </div>
  );
}
