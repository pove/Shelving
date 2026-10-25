// Proyecto inicial: recrea Estanteria.py (v6).
import type { Bridge, ColTrack, Module, Project, Separator, Track } from './types';

const fixed = (size: number): Track => ({ size, fixed: true });
const auto = (size = 0): Track => ({ size, fixed: false });

export const uid = () => Math.random().toString(36).slice(2, 9);

// Fórmulas de Estanteria.py
const E_LAT = 28;
const E_INT = 19;
const E_HOR = 19;
const ALTO_CUBO = 330;
const H = 2500 - 10;
const PARED_IZQ = 1750;
const PARED_DER = 1830;
const HUECO_PUERTA = 2115;
const SEP_PUERTA = 50;
const ALTO_PUERTA = 2130;
const SEP_SOBRE_PUERTA = 20;
const ANCHO_IZQ = PARED_IZQ - SEP_PUERTA; // 1700
const ANCHO_DER = PARED_DER - SEP_PUERTA; // 1780
const X_DER = PARED_IZQ + HUECO_PUERTA + SEP_PUERTA; // 3915
const W_IZQ = (ANCHO_IZQ - 2 * E_LAT - 4 * E_INT) / 5; // 313,6
const X_DIV = Math.max(E_LAT + 2 * W_IZQ + E_INT, 730 + 5); // 735 (balconera)
const FONDO = 330;
const FONDO_ARMARIO = 300; // con puerta
const HM = (ALTO_CUBO - E_INT) / 2; // 155,5
const Z_BASE_PUENTE = ALTO_PUERTA + SEP_SOBRE_PUERTA; // 2150
const H_FRANJA = H - E_HOR - (Z_BASE_PUENTE + E_HOR); // 302

export const standardRowSeps = (): Separator[] => [
  { name: 'Balda 1' },
  { name: 'Balda 2' },
  { name: 'Encimera', thickness: 28 },
  { name: 'Balda superior' },
  { name: 'Balda franja' },
];

const standardRows = (): Track[] => [
  fixed(ALTO_CUBO),
  fixed(ALTO_CUBO),
  fixed(HM),
  auto(),
  fixed(ALTO_CUBO),
  fixed(H_FRANJA),
];

export function defaultProject(): Project {
  const armCols: ColTrack[] = [
    {
      size: X_DIV - E_LAT,
      fixed: true,
      depth: FONDO_ARMARIO - 19,
      align: 'back',
      zone: 'Armario',
    },
    fixed(W_IZQ),
    fixed(W_IZQ),
    auto(),
  ];
  const izq: Module = {
    kind: 'module',
    id: 'izq',
    name: 'Izquierdo',
    x: 0,
    width: ANCHO_IZQ,
    height: H,
    depth: FONDO,
    cols: armCols,
    rows: standardRows(),
    colSeps: [{}, {}, {}],
    rowSeps: standardRowSeps(),
    merges: [
      { c0: 0, r0: 0, c1: 0, r1: 3 },
      { c0: 0, r0: 4, c1: 0, r1: 5 },
      { c0: 1, r0: 3, c1: 3, r1: 3 },
    ],
    regions: {
      '0:0:0:3': {
        name: 'Armario bajo',
        inserts: [],
        door: { type: 'door', mount: 'overlay', leaves: 1, hinge: 'left' },
      },
      '0:4:0:5': {
        name: 'Armario alto',
        inserts: [{ id: 'aab1', dir: 'h', offset: (H - E_HOR - 1820 - E_INT) / 2 }],
        door: { type: 'door', mount: 'overlay', leaves: 1, hinge: 'left' },
      },
      '1:3:3:3': {
        name: 'Zona abierta',
        inserts: [],
        floating: { attach: 'left', width: W_IZQ, height: ALTO_CUBO },
      },
    },
  };
  const W_DER = (ANCHO_DER - 2 * E_LAT - 4 * E_INT) / 5;
  const der: Module = {
    kind: 'module',
    id: 'der',
    name: 'Derecho',
    x: X_DER,
    width: ANCHO_DER,
    height: H,
    depth: FONDO,
    cols: [auto(), auto(), auto(), auto(), auto()],
    rows: standardRows(),
    colSeps: [{}, {}, {}, {}],
    rowSeps: standardRowSeps(),
    merges: [{ c0: 0, r0: 3, c1: 3, r1: 3 }],
    regions: {
      '0:3:3:3': {
        name: 'Zona abierta',
        inserts: [],
        floating: { attach: 'right', width: W_DER, height: ALTO_CUBO },
      },
      '4:3:4:3': { name: 'Nicho', inserts: [] },
    },
  };
  const puente: Bridge = {
    kind: 'bridge',
    id: 'puente',
    name: 'Puente',
    leftId: 'izq',
    rightId: 'der',
    z: Z_BASE_PUENTE,
    height: H - Z_BASE_PUENTE,
    depth: FONDO,
    cols: Array.from({ length: 7 }, () => auto()),
    rows: [auto()],
    colSeps: Array.from({ length: 6 }, () => ({})),
    rowSeps: [],
    merges: [],
    regions: {},
  };
  return {
    version: 1,
    name: 'Estantería con puente',
    globals: {
      thickness: { side: E_LAT, topBottom: E_HOR, shelf: E_INT, divider: E_INT, door: 19, drawer: 16 },
      depth: FONDO,
      ceiling: 2500,
      ceilingGap: 10,
      doorGap: 3,
      plinth: { notch: true, notchHeight: 70, notchDepth: 20, skirtingHeight: 65, skirtingThickness: 15 },
    },
    modules: [izq, der],
    bridges: [puente],
    environment: {
      show: true,
      wallThickness: 100,
      wallX0: 0,
      wallX1: PARED_IZQ + HUECO_PUERTA + PARED_DER,
      openings: [{ id: 'p1', x: PARED_IZQ, width: HUECO_PUERTA, height: ALTO_PUERTA, leaves: 2 }],
      sideWall: {
        enabled: true,
        side: 'left',
        door: { enabled: true, distance: 310, leaf: 730, thickness: 70, height: 2130 },
      },
    },
    materials: {
      furniture: ['bambu claro semibrillante', 'bambu claro', 'bamboo light', 'bambu', 'bamboo'],
      doors: ['bambu claro semibrillante', 'bambu claro', 'bamboo light', 'bambu', 'bamboo'],
      wall: ['recubrimiento polvo rugoso blanco', 'polvo rugoso blanco', 'powder coat rough white', 'polvo rugoso'],
      floor: ['superficie mate', 'mate'],
      color: '#dcc28f',
      doorColor: '#e6cfa0',
    },
    settings: {
      minHoleWidth: 200,
      minHoleHeight: 150,
      maxSpan19: 800,
      kerf: 4,
      trim: 10,
      sheets: [
        { thickness: 16, length: 2800, width: 2070 },
        { thickness: 19, length: 2800, width: 2070 },
        { thickness: 28, length: 2600, width: 2100 },
      ],
      rotateByDefault: false,
    },
    overrides: {},
  };
}

export function newModule(x: number, globals: Project['globals']): Module {
  const cols = 4;
  const rows = 6;
  return {
    kind: 'module',
    id: uid(),
    name: 'Módulo',
    x,
    width: 1200,
    height: globals.ceiling - globals.ceilingGap,
    depth: globals.depth,
    cols: Array.from({ length: cols }, () => auto()),
    rows: Array.from({ length: rows }, () => auto()),
    colSeps: Array.from({ length: cols - 1 }, () => ({})),
    rowSeps: Array.from({ length: rows - 1 }, () => ({})),
    merges: [],
    regions: {},
  };
}
