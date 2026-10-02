import { render } from 'preact';
import './theme.css';
import { Character } from './screens/Character';
import { Crag } from './screens/Crag';
import { Create } from './screens/Create';
import { Planner } from './screens/Planner';
import { Report } from './screens/Report';
import { Result } from './screens/Result';
import { Routes } from './screens/Routes';
import { Summary } from './screens/Summary';
import { Hall, Title } from './screens/Title';
import { Watch } from './screens/Watch';
import { act, boot, busy, data, run, screen, simulatePlan, toast, updateReady } from './store';

function App() {
  const s = screen.value;
  const r = run.value;
  let body;
  if (s.name === 'create') body = <Create seed={s.seed} preset={s.preset} />;
  else if (s.name === 'hall') body = <Hall />;
  else if (s.name === 'title' || !r) body = <Title current={r} />;
  else if (r.ended && s.name !== 'character' && s.name !== 'report') body = <Summary run={r} />;
  else if (s.name === 'planner') body = <Planner run={r} />;
  else if (s.name === 'crag') body = <Crag run={r} />;
  else if (s.name === 'routes') body = <Routes run={r} />;
  // Watch plays a simulated attempt back, then moves on to the result itself.
  else if (s.name === 'watch') body = <Watch run={r} />;
  else if (s.name === 'result') body = <Result run={r} />;
  else if (s.name === 'report') body = <Report run={r} />;
  else if (s.name === 'character') body = <Character run={r} />;
  else body = <Summary run={r} />;
  return (
    <div class="app">
      {body}
      {busy.value && <div class="busy" role="status">Simulating…</div>}
      {toast.value && <div class="toast" role="status">{toast.value}</div>}
      {updateReady.value && (
        <div class="update-bar" role="status">
          <span>A new version is ready.</span>
          <button class="btn small primary" onClick={() => updateReady.value?.()}>Reload</button>
        </div>
      )}
    </div>
  );
}

void boot().then(() => render(<App />, document.getElementById('app')!));

// Dev-only hook for browser tests: read the run, dispatch actions and simulate days from the page.
if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__cwt = { run, act, data, simulatePlan };

// Updates (18 §6): the service worker takes over as soon as a new version installs, so a version never waits for every
// tab to close. The page reloads into it at once, unless an attempt is playing on the wall: then a bar offers the
// reload, so the playback is never cut off. A check runs on every launch and whenever the app comes back to the
// foreground.
if (!import.meta.env.DEV && 'serviceWorker' in navigator) {
  const replacing = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!replacing) return;
    if (screen.value.name === 'watch' || busy.value) updateReady.value = () => location.reload();
    else location.reload();
  });
  void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL }).then((reg) => {
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void reg.update(); });
  });
}
