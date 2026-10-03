// Playback driver: draws a style into a canvas every frame and reports the HUD when it changes.
function makeViz(scene, styles) {
  const C = makeCore(scene);
  const K = makeKit(C, scene);
  const seg = (pred, frac) => C.timeOf(pred, frac);
  /** Named moments of the playback (seconds), for stills. */
  const moments = {
    a1intro: seg((s) => s.a === 0 && s.kind === 'intro', 0.6),
    a1high: seg((s) => s.a === 0 && s.kind === 'step' && s.i === 4, 0.5),
    a1sketchy: seg((s) => s.a === 0 && s.kind === 'step' && s.style.sketchy, 0.8),
    a1reach: seg((s) => s.a === 0 && s.kind === 'reach', 0.85),
    a1fall: seg((s) => s.a === 0 && s.kind === 'fall', 0.45),
    a1land: seg((s) => s.a === 0 && s.kind === 'land', 0.35),
    a2slip: seg((s) => s.a === 1 && s.kind === 'step' && s.style.slip && s.style.limb === 'RH', 0.6),
    a2dead: seg((s) => s.a === 1 && s.kind === 'step' && s.style.cls === 'deadpoint', 0.5),
    a2mantle: seg((s) => s.a === 1 && s.kind === 'mantle', 0.55),
    a2cheer: seg((s) => s.a === 1 && s.kind === 'cheer', 0.5),
  };

  function setup(canvas, id, w, h) {
    const st = styles[id];
    // Ask for the faces the style draws text in: a canvas alone does not make the browser fetch a web font.
    if (typeof document !== 'undefined' && document.fonts && st.fonts) for (const f of st.fonts) document.fonts.load(f).catch(() => null);
    const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
    const W = w || canvas.clientWidth || 390, H = h || canvas.clientHeight || 500;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    const ctx = canvas.getContext('2d');
    const env = { C, K, scene, W, H, dpr, moments };
    env.cache = st.init ? st.init(env) : {};
    return { st, ctx, env };
  }
  function drawAt(e, time) {
    const sm = C.sample(time);
    e.ctx.setTransform(e.env.dpr, 0, 0, e.env.dpr, 0, 0);
    e.ctx.clearRect(0, 0, e.env.W, e.env.H);
    e.ctx.save();
    e.st.draw(e.ctx, { ...e.env, sm, time });
    e.ctx.restore();
    return sm;
  }
  /** One frame at `time` (seconds): for stills and tests. */
  function still(canvas, id, time, w, h) { return drawAt(setup(canvas, id, w, h), time); }

  /** Plays a style in a canvas; `onHud(hud)` when the HUD changes. Returns the controls. */
  function mount(canvas, id, opts = {}) {
    const e = setup(canvas, id, opts.width, opts.height);
    let t = opts.start || 0, last = null, playing = opts.autoplay !== false, speed = 1, raf = 0, key = '';
    const reduce = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { playing = false; t = moments.a2dead; }
    const emit = (sm) => {
      const hud = C.hudOf(sm);
      const k = `${hud.kind}|${hud.n}|${hud.step}`;
      if (k !== key) { key = k; if (opts.onHud) opts.onHud(hud); }
    };
    const frame = (now) => {
      if (last !== null && playing) {
        const warp = e.st.speedAt ? e.st.speedAt(C.sample(t)) : 1;
        t += Math.min(0.1, (now - last) / 1000) * speed * warp;
      }
      last = now;
      emit(drawAt(e, t));
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return {
      play() { playing = true; }, pause() { playing = false; },
      toggle() { playing = !playing; return playing; },
      replay() { t = 0; key = ''; playing = true; },
      setSpeed(s) { speed = s; }, isPlaying: () => playing,
      destroy() { cancelAnimationFrame(raf); },
    };
  }
  /** Milliseconds for the style's setup and for one frame (mean of `n`). */
  function bench(id, n = 30) {
    const c = document.createElement('canvas');
    const t0 = performance.now();
    const e = setup(c, id, 390, 500);
    drawAt(e, 1);
    const t1 = performance.now();
    for (let i = 0; i < n; i++) drawAt(e, 2 + (i * C.TL.total) / n);
    e.ctx.getImageData(0, 0, 1, 1);
    return { init: t1 - t0, frame: (performance.now() - t1) / n };
  }
  /** The HUD as display strings, for markup to bind. */
  function view(h) {
    const ended = h.kind === 'land' || h.kind === 'cheer';
    return {
      attempt: h.attempt, text: h.text, move: h.move,
      step: h.kind === 'step' ? `Move ${h.step} of ${h.steps}` : h.kind === 'intro' ? 'On the start holds' : ended ? h.outcome : h.kind === 'mantle' ? 'Mantle' : h.kind === 'fall' ? 'Off' : 'Last move',
      odds: h.p == null || h.kind !== 'step' ? '—' : `${h.p}%`,
      pump: `${h.pump}`, pumpW: `${Math.max(1, h.pump)}%`, power: `${h.power}%`, powerW: `${Math.max(1, h.power)}%`,
      fear: `${h.fear}`, fearW: `${Math.max(1, h.fear)}%`, bandL: `${h.bandLo}%`, bandW: `${h.bandHi - h.bandLo}%`, band: `${h.bandLo}–${h.bandHi}`,
      outcome: h.outcome, ended, sent: h.sent, fell: h.fell,
      fearNote: h.fearUp ? `+${h.fearUp.d} ${h.fearUp.label}` : '',
    };
  }
  return { C, K, scene, styles, moments, mount, still, bench, view, hudAt: (time) => C.hudOf(C.sample(time)) };
}
