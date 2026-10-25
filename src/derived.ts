import { useMemo } from 'react';
import { computeBoards, type BoardsResult } from './model/boards';
import { computeEnvironment, type EnvResult } from './model/environment';
import type { Project } from './model/types';
import { computeWarnings, type Warning } from './model/warnings';
import { useStore } from './store';

export interface Derived extends BoardsResult {
  env: EnvResult;
  warnings: Warning[];
}

const cache = new WeakMap<Project, Derived>();

export function derive(p: Project): Derived {
  let d = cache.get(p);
  if (!d) {
    const r = computeBoards(p);
    const env = computeEnvironment(p, r.boards);
    d = { ...r, env, warnings: computeWarnings(p, r.boards, r.layouts, env) };
    cache.set(p, d);
  }
  return d;
}

export function useDerived(): Derived {
  const p = useStore((s) => s.project);
  return useMemo(() => derive(p), [p]);
}
