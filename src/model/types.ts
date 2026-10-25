// Modelo de datos del proyecto. Todo en mm.
//
// Ejes: X a lo largo de la pared (0 = esquina izquierda), Y = distancia a la pared
// (0 = pared, crece hacia la habitación), Z = altura (0 = suelo).

export interface Track {
  /** Medida INTERIOR en mm. En pistas "repartir" se recalcula. */
  size: number;
  /** true = medida fija; false = reparte el sobrante con las demás no fijas. */
  fixed: boolean;
}

export interface ColTrack extends Track {
  /** Fondo del casco en esta columna (por defecto, el del módulo). */
  depth?: number;
  /** 'back' = enrasado a la pared (retranqueado al frente); 'front' = enrasado al frente. */
  align?: 'back' | 'front';
  /** Nombre de zona (p. ej. "Armario"); se usa para nombrar piezas. */
  zone?: string;
}

/** Balda (entre filas) o divisor (entre columnas) de la rejilla. */
export interface Separator {
  thickness?: number;
  name?: string;
}

export interface Merge {
  c0: number;
  r0: number;
  c1: number;
  r1: number;
}

export interface Insert {
  id: string;
  /** 'h' = balda horizontal, 'v' = divisor vertical. */
  dir: 'h' | 'v';
  /** Distancia en mm desde la cara interior inferior/izquierda del hueco a la cara inferior/izquierda de la pieza. */
  offset: number;
  thickness?: number;
}

export interface DoorSpec {
  type: 'door' | 'drawer';
  mount: 'overlay' | 'inset';
  leaves: 1 | 2;
  hinge: 'left' | 'right';
}

export interface FloatingCube {
  /** Pared del hueco a la que va pegado el cubo (el lateral colgante queda al otro lado). */
  attach: 'left' | 'right';
  /** Ancho interior del cubo. */
  width: number;
  /** Alto interior del cubo. */
  height: number;
}

/** Puerta que tapa varios huecos sin eliminar las baldas/divisores interiores. */
export interface Front extends Merge {
  id: string;
  name?: string;
  door: DoorSpec;
}

export interface RegionProps {
  name?: string;
  inserts: Insert[];
  door?: DoorSpec;
  floating?: FloatingCube;
}

export interface CarcassBase {
  id: string;
  name: string;
  depth: number;
  cols: ColTrack[];
  rows: Track[]; // fila 0 = abajo
  colSeps: Separator[]; // length = cols.length - 1
  rowSeps: Separator[]; // length = rows.length - 1
  merges: Merge[];
  /** Propiedades de huecos, clave "c0:r0:c1:r1". */
  regions: Record<string, RegionProps>;
  /** Puertas que abarcan varios huecos. */
  fronts?: Front[];
}

export interface Module extends CarcassBase {
  kind: 'module';
  x: number;
  width: number;
  height: number;
  sideLeft?: number;
  sideRight?: number;
}

export interface Bridge extends CarcassBase {
  kind: 'bridge';
  leftId: string;
  rightId: string;
  /** Cota de la cara inferior de la base del puente. */
  z: number;
  height: number;
}

export type Carcass = Module | Bridge;

export interface Globals {
  thickness: {
    side: number;
    topBottom: number;
    shelf: number;
    divider: number;
    door: number;
    drawer: number;
  };
  depth: number;
  ceiling: number;
  ceilingGap: number;
  doorGap: number;
  plinth: {
    notch: boolean;
    notchHeight: number;
    notchDepth: number;
    skirtingHeight: number;
    skirtingThickness: number;
  };
}

export interface WallOpening {
  id: string;
  x: number;
  width: number;
  height: number;
  leaves: number;
}

export interface SideDoor {
  enabled: boolean;
  /** Distancia de la pared de la estantería a la cara de la hoja abierta a 90°. */
  distance: number;
  leaf: number;
  thickness: number;
  height: number;
}

export interface Environment {
  show: boolean;
  wallThickness: number;
  wallX0: number;
  wallX1: number;
  openings: WallOpening[];
  sideWall: {
    enabled: boolean;
    side: 'left' | 'right';
    door: SideDoor;
  };
}

export interface SheetFormat {
  thickness: number;
  length: number;
  width: number;
}

export interface Materials {
  furniture: string[];
  doors: string[];
  wall: string[];
  floor: string[];
  color: string;
  doorColor: string;
}

export interface Settings {
  minHoleWidth: number;
  minHoleHeight: number;
  /** Luz máxima sin apoyo para balda de 19 mm (se escala con el espesor). */
  maxSpan19: number;
  kerf: number;
  trim: number;
  sheets: SheetFormat[];
  /** Por defecto, se permite girar las piezas al optimizar (sin veta). */
  rotateByDefault: boolean;
}

export interface EdgeSet {
  L1: boolean;
  L2: boolean;
  A1: boolean;
  A2: boolean;
}

export interface PieceOverride {
  edges?: EdgeSet;
  rotatable?: boolean;
}

export interface Project {
  version: 1;
  name: string;
  globals: Globals;
  modules: Module[];
  bridges: Bridge[];
  environment: Environment;
  materials: Materials;
  settings: Settings;
  overrides: Record<string, PieceOverride>;
}

// --------------------------------------------------------------- salidas

export type BoardKind =
  | 'side'
  | 'top'
  | 'base'
  | 'shelf'
  | 'divider'
  | 'separator'
  | 'insert'
  | 'floatSide'
  | 'floatBase'
  | 'door'
  | 'drawerFront'
  | 'drawerBox';

export interface Box {
  x: number;
  y: number;
  z: number;
  dx: number;
  dy: number;
  dz: number;
}

export type BoardSource =
  | { type: 'side'; carcassId: string; side: 'left' | 'right' }
  | { type: 'rowSep'; carcassId: string; index: number }
  | { type: 'colSep'; carcassId: string; index: number }
  | { type: 'topBottom'; carcassId: string }
  | { type: 'region'; carcassId: string; key: string; insertId?: string }
  | { type: 'front'; carcassId: string; frontId: string };

export interface Board {
  id: string;
  name: string;
  groupId: string;
  groupName: string;
  kind: BoardKind;
  box: Box;
  /** Eje del espesor. */
  normal: 'x' | 'y' | 'z';
  t: number;
  length: number;
  width: number;
  /** Rebaje de rodapié detrás-abajo: y en [0, depth] desde la pared, z en [z0, z1]. */
  notch?: { z0: number; z1: number; y1: number };
  edges: EdgeSet;
  notes: string[];
  rotatable: boolean;
  material: 'furniture' | 'doors';
  src: BoardSource;
}
