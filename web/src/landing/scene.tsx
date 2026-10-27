import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { BoxGeometry, Color, MathUtils, ShaderMaterial, TorusGeometry, type Group, type Mesh } from "three";
import { MESH_VERT, RIM_FN } from "./glsl";
import type { SceneProps } from "./hero-types";

/** One block per signed ledger entry, linked in a ring. The blocks start scattered and assemble as the page scrolls; each lights up when it is
 *  "signed", and a pulse walks the chain, as a signature does along the real ledger. */
const LOOP = 30; // seconds for one idle turn
const BLOCKS = 16;
const RADIUS = 2.0;

const BLOCK_FRAG = /* glsl */ `
uniform vec3 uAccent;
uniform vec3 uBase;
uniform float uLit;
uniform float uPulse;
varying vec3 vNormal;
varying vec3 vView;
varying vec2 vUv;
${RIM_FN}
void main() {
  float f = rim(vNormal, vView, 3.2);
  vec3 col = uBase * soft(vNormal);
  col += uAccent * f * (0.25 + 0.8 * uLit + 1.2 * uPulse);
  col += uAccent * 0.08 * uLit * soft(vNormal);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;
const LINK_FRAG = /* glsl */ `
uniform vec3 uAccent;
varying vec3 vNormal;
varying vec3 vView;
varying vec2 vUv;
${RIM_FN}
void main() {
  gl_FragColor = vec4(vec3(0.1, 0.12, 0.14) + uAccent * rim(vNormal, vView, 2.0) * 0.25, 1.0);
  #include <colorspace_fragment>
}`;

// fixed pseudo-random scatter so the assembly looks the same on every load
const rand = (i: number, k: number) => { const s = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return s - Math.floor(s); };

export function HeroScene({ accent, data, progress, pointer }: SceneProps) {
  const group = useRef<Group>(null);
  const meshes = useRef<(Mesh | null)[]>([]);
  const lit = useRef<number[]>(Array(BLOCKS).fill(0));
  // the ledger's real length sets how many blocks are signed when the page loads
  const signed0 = Math.min(BLOCKS, Math.max(3, data?.[0] ?? 8)) / BLOCKS;

  const geo = useMemo(() => ({ block: new BoxGeometry(0.62, 0.34, 0.34), link: new TorusGeometry(RADIUS, 0.012, 8, 200) }), []);
  const mats = useMemo(() => Array.from({ length: BLOCKS }, () => new ShaderMaterial({
    vertexShader: MESH_VERT, fragmentShader: BLOCK_FRAG,
    uniforms: { uAccent: { value: new Color(accent) }, uBase: { value: new Color("#14181d") }, uLit: { value: 0 }, uPulse: { value: 0 } },
  })), [accent]);
  const linkMat = useMemo(() => new ShaderMaterial({ vertexShader: MESH_VERT, fragmentShader: LINK_FRAG, uniforms: { uAccent: { value: new Color(accent) } } }), [accent]);
  const slots = useMemo(() => Array.from({ length: BLOCKS }, (_, i) => {
    const a = (i / BLOCKS) * Math.PI * 2;
    return {
      to: [Math.cos(a) * RADIUS, 0, Math.sin(a) * RADIUS] as const,
      from: [(rand(i, 1) - 0.5) * 7, (rand(i, 2) - 0.5) * 5, (rand(i, 3) - 0.5) * 4] as const,
      spin: [(rand(i, 4) - 0.5) * 5, (rand(i, 5) - 0.5) * 5] as const,
      ry: -(a + Math.PI / 2),
    };
  }), []);

  useFrame((state, dt) => {
    const g = group.current;
    if (!g) return;
    const t = state.clock.elapsedTime, p = progress.get(), px = pointer.current.x, py = pointer.current.y;
    g.rotation.y = (t / LOOP) * Math.PI * 2 + px * 0.25;
    g.rotation.x = MathUtils.damp(g.rotation.x, 0.5 + py * 0.15, 4, dt);
    g.position.x = MathUtils.damp(g.position.x, px * 0.18, 4, dt);
    g.position.y = MathUtils.damp(g.position.y, py * 0.12, 4, dt);

    const assembled = 0.42 + 0.58 * p;                 // blocks in place, 0 to 1 across the chain
    const signed = Math.floor(BLOCKS * Math.max(signed0 * 0.6, 0.3 + 0.7 * p));
    const pulse = (t / 5) % BLOCKS;
    slots.forEach((s, i) => {
      const m = meshes.current[i];
      if (!m) return;
      const k = MathUtils.clamp(assembled * (BLOCKS + 5) - i, 0, 5) / 5;
      const e = k * k * (3 - 2 * k);
      m.position.set(MathUtils.lerp(s.from[0], s.to[0], e), MathUtils.lerp(s.from[1], s.to[1], e), MathUtils.lerp(s.from[2], s.to[2], e));
      m.rotation.set((1 - e) * s.spin[0], MathUtils.lerp(s.spin[1], s.ry, e), 0);
      m.scale.setScalar(0.55 + 0.45 * e);
      lit.current[i] = MathUtils.damp(lit.current[i], k >= 1 && i < signed ? 1 : 0, 5, dt);
      const d = Math.min(Math.abs(i - pulse), BLOCKS - Math.abs(i - pulse));
      mats[i].uniforms.uLit.value = lit.current[i];
      mats[i].uniforms.uPulse.value = Math.max(0, 1 - d / 1.6) * lit.current[i];
    });
  });

  return (
    <group ref={group}>
      <mesh geometry={geo.link} material={linkMat} rotation={[Math.PI / 2, 0, 0]} />
      {slots.map((_, i) => <mesh key={i} ref={(el) => { meshes.current[i] = el; }} geometry={geo.block} material={mats[i]} />)}
    </group>
  );
}
