// Content validator (docs/20 §4, schemas §9): src/data/validate.ts over data/, or the folder named. Exits non-zero on
// any error so CI can gate on it.  pnpm validate [--dir data]
import { phaseLive } from '../src/sim/character';
import { validateContent } from '../src/data/validate';

const args = process.argv.slice(2);
const i = args.indexOf('--dir');
const { errors, warnings, bundle } = validateContent(i >= 0 ? args[i + 1] : undefined);
if (bundle) {
  const live = [...bundle.traits.values()].filter((t) => phaseLive(t.phase) && t.kind === 'creation');
  console.log(`traits ${bundle.traits.size} (${live.length} live at creation) · backgrounds ${bundle.backgrounds.size} · crags ${bundle.crags.size} · profiles ${bundle.profiles.size} · signatures ${bundle.signatures.size}`);
}
for (const w of warnings) console.log(`warning: ${w}`);
for (const e of errors) console.log(`ERROR: ${e}`);
if (errors.length) process.exit(1);
console.log('content OK');
