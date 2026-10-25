import { Edges, OrbitControls } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useDerived } from '../derived';
import type { EnvLeaf } from '../model/environment';
import type { Board, Box } from '../model/types';
import { useStore, type ViewName } from '../store';
import { registerCapture3D } from './exportImage';

/** Puertas y frentes de cajón (lo que se oculta con «Puertas»). */
export const isFront = (b: Board) => b.kind === 'door' || b.kind === 'drawerFront';

// Conversión de ejes: (x, y=distancia a pared, z=alto) -> three (x, z, y)
const pos = (b: Box): [number, number, number] => [b.x + b.dx / 2, b.z + b.dz / 2, b.y + b.dy / 2];
const size = (b: Box): [number, number, number] => [b.dx, b.dz, b.dy];

function notchedGeometry(b: Board) {
  const { y, dy, z, dz, x, dx } = b.box;
  const n = b.notch!;
  const pts: [number, number][] = [
    [n.y1, z],
    [y + dy, z],
    [y + dy, z + dz],
    [y, z + dz],
    [y, n.z1],
    [n.y1, n.z1],
  ];
  const shape = new THREE.Shape(pts.map(([yy, zz]) => new THREE.Vector2(-yy, zz)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: dx, bevelEnabled: false });
  g.rotateY(Math.PI / 2);
  g.translate(x, 0, 0);
  return g;
}

function BoardMesh({ b, color, highlight }: { b: Board; color: string; highlight: 0 | 1 | 2 }) {
  const select = useStore((s) => s.select);
  const geom = useMemo(() => (b.notch ? notchedGeometry(b) : null), [b]);
  const c = highlight === 2 ? '#f0a33a' : highlight === 1 ? new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.25).getStyle() : color;
  const onClick = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    select({ carcassId: b.groupId, boardId: b.id, cells: null });
  };
  const mat = <meshStandardMaterial color={c} roughness={0.75} metalness={0} />;
  const edges = <Edges threshold={20} color="#7d6240" lineWidth={1} />;
  if (geom)
    return (
      <mesh geometry={geom} castShadow receiveShadow onClick={onClick}>
        {mat}
        {edges}
      </mesh>
    );
  return (
    <mesh position={pos(b.box)} castShadow receiveShadow onClick={onClick}>
      <boxGeometry args={size(b.box)} />
      {mat}
      {edges}
    </mesh>
  );
}

function Leaf({ l }: { l: EnvLeaf }) {
  const cx = l.hx + (l.d[0] * l.length) / 2 + (l.t[0] * l.thickness) / 2;
  const cy = l.hy + (l.d[1] * l.length) / 2 + (l.t[1] * l.thickness) / 2;
  const phi = Math.atan2(-l.d[1], l.d[0]);
  return (
    <mesh position={[cx, l.z + l.height / 2, cy]} rotation={[0, phi, 0]} castShadow>
      <boxGeometry args={[l.length, l.height, l.thickness]} />
      <meshStandardMaterial color="#cfe3ec" transparent opacity={0.55} roughness={0.2} />
      <Edges color="#7b8a90" />
    </mesh>
  );
}

function CameraRig({ center, radius }: { center: THREE.Vector3; radius: number }) {
  const req = useStore((s) => s.viewRequest);
  const { camera, controls } = useThree();
  const first = useRef(true);
  useEffect(() => {
    const ctl = controls as unknown as OrbitControlsImpl | null;
    const d = radius * 1.9;
    const v: Record<ViewName, [number, number, number]> = {
      front: [0, 0, d],
      iso: [-d * 0.45, d * 0.35, d * 0.85],
      top: [0, d, 1],
    };
    const [dx, dy, dz] = v[req.name];
    camera.position.set(center.x + dx, center.y + dy, center.z + dz);
    camera.lookAt(center);
    if (ctl) {
      ctl.target.copy(center);
      ctl.update();
    }
    first.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [req.n, controls]);
  return null;
}

/** Permite guardar la vista como PNG (a doble resolución) desde fuera del Canvas. */
function CaptureHook() {
  const { gl, scene, camera, size } = useThree();
  useEffect(() => {
    registerCapture3D(() => {
      const pr = gl.getPixelRatio();
      gl.setPixelRatio(Math.max(2, pr));
      gl.setSize(size.width, size.height, false);
      gl.render(scene, camera);
      const url = gl.domElement.toDataURL('image/png');
      gl.setPixelRatio(pr);
      gl.setSize(size.width, size.height, false);
      gl.render(scene, camera);
      return url;
    });
    return () => registerCapture3D(null);
  }, [gl, scene, camera, size]);
  return null;
}

export default function Viewer3D() {
  const { boards, env } = useDerived();
  const project = useStore((s) => s.project);
  const sel = useStore((s) => s.selection);
  const select = useStore((s) => s.select);
  const showEnv = project.environment.show;
  const showDoors = useStore((s) => s.showDoors);
  const envDoors = project.environment.showDoors !== false;

  const { center, radius } = useMemo(() => {
    const bb = new THREE.Box3();
    for (const b of boards) {
      bb.expandByPoint(new THREE.Vector3(b.box.x, b.box.z, b.box.y));
      bb.expandByPoint(new THREE.Vector3(b.box.x + b.box.dx, b.box.z + b.box.dz, b.box.y + b.box.dy));
    }
    if (bb.isEmpty()) bb.set(new THREE.Vector3(0, 0, 0), new THREE.Vector3(2000, 2400, 400));
    const c = bb.getCenter(new THREE.Vector3());
    const r = bb.getSize(new THREE.Vector3()).length() / 2;
    return { center: c, radius: r };
    // solo al cambiar de proyecto de forma importante
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boards.length]);

  return (
    <Canvas
      shadows
      camera={{ fov: 35, near: 10, far: 200000, position: [center.x, center.y, center.z + radius * 2] }}
      onPointerMissed={() => select({ boardId: null })}
      style={{ background: 'linear-gradient(#f4f2ee, #e4e0d8)' }}
    >
      <ambientLight intensity={0.55} />
      <hemisphereLight args={['#ffffff', '#b8b0a0', 0.5]} />
      <directionalLight
        position={[center.x - 2500, 5000, 4500]}
        intensity={1.6}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-6000}
        shadow-camera-right={6000}
        shadow-camera-top={6000}
        shadow-camera-bottom={-6000}
        shadow-camera-near={100}
        shadow-camera-far={20000}
        shadow-bias={-0.0004}
      />
      <group position={[0, 0, 0]}>
        {boards.filter((b) => showDoors || !isFront(b)).map((b) => (
          <BoardMesh
            key={b.id}
            b={b}
            color={b.material === 'doors' ? project.materials.doorColor : project.materials.color}
            highlight={sel.boardId === b.id ? 2 : sel.carcassId === b.groupId ? 1 : 0}
          />
        ))}
      </group>
      {showEnv && (
        <group>
          {env.boxes.filter((e) => envDoors || !e.door).map((e) => (
            <mesh key={e.name} position={pos(e.box)} receiveShadow castShadow={e.kind === 'wall' && !e.name.startsWith('Puerta')}>
              <boxGeometry args={size(e.box)} />
              <meshStandardMaterial
                color={e.kind === 'floor' ? (e.name.startsWith('Rodapie') ? '#efefec' : '#c9c3b7') : e.name.startsWith('Puerta') ? '#f7f6f2' : '#ecebe7'}
                roughness={0.95}
              />
              {e.kind === 'wall' && <Edges threshold={20} color="#c8c6c0" />}
            </mesh>
          ))}
          {env.leaf && envDoors && <Leaf l={env.leaf} />}
        </group>
      )}
      {!showEnv && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[center.x, -1, center.z]} receiveShadow>
          <planeGeometry args={[radius * 8, radius * 8]} />
          <shadowMaterial opacity={0.18} />
        </mesh>
      )}
      <OrbitControls makeDefault enableDamping dampingFactor={0.12} />
      <CameraRig center={center} radius={radius} />
      <CaptureHook />
    </Canvas>
  );
}
