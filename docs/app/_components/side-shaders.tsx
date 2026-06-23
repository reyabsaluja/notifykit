"use client";

import { ShaderMirror } from "./shader-source";

export function SideShaders() {
  return (
    <div className="side-shaders" aria-hidden="true">
      <ShaderMirror className="side-shader side-shader-1" />
      <ShaderMirror className="side-shader side-shader-2" />
      <ShaderMirror className="side-shader side-shader-3" />
      <ShaderMirror className="side-shader side-shader-4" />
      <ShaderMirror className="side-shader side-shader-5" />
      <ShaderMirror className="side-shader side-shader-6" />
      <ShaderMirror className="side-shader side-shader-7" />
      <ShaderMirror className="side-shader side-shader-8" />
    </div>
  );
}
