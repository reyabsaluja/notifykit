"use client";

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
        svgRasterResolution: "2048",
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

export function HeroShader() {
  return (
    <>
      <div className="hero-shader hero-shader-1">
        <ShaderLabComposition config={config} />
      </div>
      <div className="hero-shader hero-shader-2">
        <ShaderLabComposition config={config} />
      </div>
      <div className="hero-shader hero-shader-3">
        <ShaderLabComposition config={config} />
      </div>
      <div className="hero-shader hero-shader-4">
        <ShaderLabComposition config={config} />
      </div>
      <div className="hero-shader hero-shader-5">
        <ShaderLabComposition config={config} />
      </div>
      <div className="hero-shader hero-shader-6">
        <ShaderLabComposition config={config} />
      </div>
      <div className="hero-shader hero-shader-7">
        <ShaderLabComposition config={config} />
      </div>
    </>
  );
}
