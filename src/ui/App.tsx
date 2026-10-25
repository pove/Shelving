import { lazy, Suspense, useEffect } from 'react';
import { useDerived } from '../derived';
import { useStore, type Tab } from '../store';
import Editor2D from './Editor2D';
import GlobalPanel from './GlobalPanel';
import SelectionPanel from './SelectionPanel';

const Viewer3D = lazy(() => import('./Viewer3D'));
const CutListView = lazy(() => import('./CutListView'));
const NestingView = lazy(() => import('./NestingView'));
const FusionView = lazy(() => import('./FusionView'));
const WarningsView = lazy(() => import('./WarningsView'));

const TABS: [Tab, string][] = [
  ['design', 'Diseño'],
  ['cutlist', 'Despiece'],
  ['nesting', 'Cortes'],
  ['fusion', 'Script Fusion'],
  ['warnings', 'Avisos'],
];

export default function App() {
  const tab = useStore((s) => s.tab);
  const setTab = useStore((s) => s.setTab);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const requestView = useStore((s) => s.requestView);
  const showEnv = useStore((s) => s.project.environment.show);
  const update = useStore((s) => s.update);
  const { warnings, boards } = useDerived();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (k === 'y' || (k === 'z' && e.shiftKey)) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  const errors = warnings.filter((w) => w.level === 'error').length;

  return (
    <div className="app">
      <header className="topbar no-print">
        <div className="brand">Estanterías a medida</div>
        <nav className="tabs">
          {TABS.map(([k, label]) => (
            <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>
              {label}
              {k === 'warnings' && warnings.length > 0 && <span className={'badge' + (errors ? ' err' : '')}>{warnings.length}</span>}
            </button>
          ))}
        </nav>
        <div className="tools">
          <button onClick={undo} disabled={!canUndo} title="Deshacer (Ctrl+Z)">
            ↶
          </button>
          <button onClick={redo} disabled={!canRedo} title="Rehacer (Ctrl+Y)">
            ↷
          </button>
          <span className="muted">{boards.length} tableros</span>
        </div>
      </header>
      <div className="body">
        <aside className="left no-print">
          <GlobalPanel />
          <div className="sel-title">Selección</div>
          <SelectionPanel />
        </aside>
        <main className="main">
          <Suspense fallback={<div className="pad">Cargando…</div>}>
            {tab === 'design' && (
              <div className="design">
                <div className="view3d">
                  <div className="view-tools">
                    <button onClick={() => requestView('front')}>Frontal</button>
                    <button onClick={() => requestView('iso')}>Isométrica</button>
                    <button onClick={() => requestView('top')}>Superior</button>
                    <label className="check">
                      <input type="checkbox" checked={showEnv} onChange={(e) => update((d) => void (d.environment.show = e.target.checked))} />
                      Entorno
                    </label>
                  </div>
                  <Viewer3D />
                </div>
                <Editor2D />
              </div>
            )}
            {tab === 'cutlist' && <CutListView />}
            {tab === 'nesting' && <NestingView />}
            {tab === 'fusion' && <FusionView />}
            {tab === 'warnings' && <WarningsView />}
          </Suspense>
        </main>
      </div>
    </div>
  );
}
