import { produce, type Draft } from 'immer';
import { create } from 'zustand';
import { defaultProject } from './model/defaults';
import type { Merge, Project } from './model/types';

const LS_KEY = 'estanterias.proyecto.v1';
const MAX_HISTORY = 200;

export interface Selection {
  carcassId: string | null;
  /** Rectángulo de celdas seleccionado. */
  cells: Merge | null;
  boardId: string | null;
}

export type Tab = 'design' | 'cutlist' | 'nesting' | 'fusion' | 'warnings';
export type ViewName = 'front' | 'iso' | 'top';

interface State {
  project: Project;
  past: Project[];
  future: Project[];
  selection: Selection;
  tab: Tab;
  viewRequest: { name: ViewName; n: number };
  update: (fn: (d: Draft<Project>) => void) => void;
  replace: (p: Project) => void;
  undo: () => void;
  redo: () => void;
  select: (s: Partial<Selection>) => void;
  setTab: (t: Tab) => void;
  requestView: (v: ViewName) => void;
}

function load(): Project {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Project;
      if (p && p.version === 1) return migrate(p);
    }
  } catch {
    /* sin almacenamiento */
  }
  return defaultProject();
}

/** Completa campos que falten en proyectos guardados con versiones anteriores. */
export function migrate(p: Project): Project {
  const d = defaultProject();
  return {
    ...d,
    ...p,
    globals: { ...d.globals, ...p.globals, thickness: { ...d.globals.thickness, ...p.globals?.thickness }, plinth: { ...d.globals.plinth, ...p.globals?.plinth } },
    environment: { ...d.environment, ...p.environment },
    materials: { ...d.materials, ...p.materials },
    settings: { ...d.settings, ...p.settings },
    overrides: p.overrides ?? {},
    bridges: p.bridges ?? [],
  };
}

export const useStore = create<State>((set, get) => ({
  project: load(),
  past: [],
  future: [],
  selection: { carcassId: null, cells: null, boardId: null },
  tab: 'design',
  viewRequest: { name: 'iso', n: 0 },
  update: (fn) => {
    const cur = get().project;
    const next = produce(cur, fn);
    if (next === cur) return;
    set({ project: next, past: [...get().past.slice(-MAX_HISTORY + 1), cur], future: [] });
  },
  replace: (p) => {
    set({
      project: p,
      past: [...get().past, get().project],
      future: [],
      selection: { carcassId: null, cells: null, boardId: null },
    });
  },
  undo: () => {
    const { past, project, future } = get();
    if (!past.length) return;
    set({ project: past[past.length - 1], past: past.slice(0, -1), future: [project, ...future] });
  },
  redo: () => {
    const { past, project, future } = get();
    if (!future.length) return;
    set({ project: future[0], future: future.slice(1), past: [...past, project] });
  },
  select: (s) => set({ selection: { ...get().selection, ...s } }),
  setTab: (tab) => set({ tab }),
  requestView: (name) => set({ viewRequest: { name, n: get().viewRequest.n + 1 } }),
}));

// guardado automático
let timer: ReturnType<typeof setTimeout> | undefined;
useStore.subscribe((s, prev) => {
  if (s.project === prev.project) return;
  clearTimeout(timer);
  timer = setTimeout(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(s.project));
    } catch {
      /* lleno o bloqueado */
    }
  }, 300);
});
