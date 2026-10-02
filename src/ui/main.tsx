import { render } from 'preact';
import type { Limb, MoveClass } from '../sim/types';
import { registerSW } from 'virtual:pwa-register';
import './theme.css';
import { Attempt } from './screens/Attempt';
import { Character } from './screens/Character';
import { Crag } from './screens/Crag';
import { Create } from './screens/Create';
import { Planner } from './screens/Planner';
import { Result } from './screens/Result';
import { Routes } from './screens/Routes';
import { Summary } from './screens/Summary';
import { Hall, Title } from './screens/Title';
import { act, boot, data, run, screen, toast, updateReady } from './store';

function App() {
  const s = screen.value;
  const r = run.value;
  let body;
  if (s.name === 'create') body = <Create seed={s.seed} preset={s.preset} />;
  else if (s.name === 'hall') body = <Hall />;
  else if (s.name === 'title' || !r) body = <Title current={r} />;
  else if (r.ended && s.name !== 'character') body = <Summary run={r} />;
  else if (s.name === 'planner') body = <Planner run={r} />;
  else if (s.name === 'crag') body = <Crag run={r} />;
  else if (s.name === 'routes') body = <Routes run={r} />;
  // Attempt stays mounted after the attempt ends so the fall or top-out can play; it moves on to the result itself.
  else if (s.name === 'attempt') body = <Attempt run={r} />;
  else if (s.name === 'result') body = <Result run={r} />;
  else if (s.name === 'character') body = <Character run={r} />;
  else body = <Summary run={r} />;
  return (
    <div class="app">
      {body}
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

// #proto-dyno opens the throwaway dyno prototype (docs/23 §6) instead of the game; it loads only when asked for.
const PROTO = '#proto-dyno';
if (location.hash === PROTO) void import('./proto/DynoProto').then(({ DynoProto }) => render(<DynoProto />, document.getElementById('app')!));
else void boot().then(() => render(<App />, document.getElementById('app')!));
window.addEventListener('hashchange', () => { if ((location.hash === PROTO) !== !!document.querySelector('[data-proto]')) location.reload(); });

// Dev-only hook for browser tests: read the run and step the bot policy from the page.
if (import.meta.env.DEV) {
  void import('../sim/attempt').then(({ autoClimbAction, balanceSetup }) => {
    (window as unknown as Record<string, unknown>).__cwt = {
      run, act, data, next: () => run.value && autoClimbAction(run.value, data, { bot: true }),
      balance: (a: { limb: Limb; hold: string; class: MoveClass }) => run.value && balanceSetup(run.value, a.limb, a.hold, a.class, data),
    };
  });
}
// A new version waits until every tab is closed unless the player reloads into it; say so instead of waiting silently.
const updateSW = registerSW({ immediate: true, onNeedRefresh: () => { updateReady.value = () => void updateSW(true); } });
