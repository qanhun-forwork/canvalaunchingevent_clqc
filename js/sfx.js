// Game-show sound effects, synthesized with WebAudio (no audio files).
window.SFX = (() => {
  let ac = null, out = null, noiseBuf = null, muted = false;
  function ctx() {
    if (!ac) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      ac = new C();
      const comp = ac.createDynamicsCompressor();
      comp.threshold.value = -16; comp.knee.value = 10; comp.ratio.value = 5; comp.attack.value = 0.003; comp.release.value = 0.2;
      out = ac.createGain(); out.gain.value = 0.9;
      out.connect(comp); comp.connect(ac.destination);
      noiseBuf = ac.createBuffer(1, ac.sampleRate * 1.5, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ac.state === "suspended") ac.resume();
    return ac;
  }
  function unlock() {
    const c = ctx(); if (!c) return;
    const s = c.createBufferSource(); s.buffer = c.createBuffer(1, 1, 22050); s.connect(out); s.start(0);
  }
  const now = () => ac.currentTime + 0.01;
  function env(t, g, a, r) {
    const e = ac.createGain();
    e.gain.setValueAtTime(0.0001, t);
    e.gain.exponentialRampToValueAtTime(g, t + a);
    e.gain.exponentialRampToValueAtTime(0.0001, t + a + r);
    return e;
  }
  function tone(type, f, t, { g = 0.3, a = 0.005, r = 0.3, f2 = 0, slide = 0, dest = out, det = 0, vib = 0 } = {}) {
    const o = ac.createOscillator(), e = env(t, g, a, r);
    o.type = type; o.frequency.setValueAtTime(f, t); o.detune.value = det;
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + (slide || r));
    if (vib) { const l = ac.createOscillator(), lg = ac.createGain(); l.frequency.value = vib; lg.gain.value = f * 0.02; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + a + r + 0.1); }
    o.connect(e); e.connect(dest); o.start(t); o.stop(t + a + r + 0.1);
  }
  function lp(freq, q = 0.8) { const f = ac.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = freq; f.Q.value = q; f.connect(out); return f; }
  function strike(f, t, g = 0.25) { // metallic bell: inharmonic partials
    [[1, 1, 0.9], [2.76, 0.5, 0.45], [5.4, 0.28, 0.25], [8.93, 0.14, 0.15]].forEach(([m, k, r]) => tone("sine", f * m, t, { g: g * k, a: 0.002, r }));
  }
  function noise(t, dur, f1, f2, g = 0.25) {
    const s = ac.createBufferSource(); s.buffer = noiseBuf;
    const bp = ac.createBiquadFilter(); bp.type = "bandpass"; bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(f1, t); bp.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const e = ac.createGain(); e.gain.setValueAtTime(0.0001, t); e.gain.exponentialRampToValueAtTime(g, t + dur * 0.6); e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(bp); bp.connect(e); e.connect(out); s.start(t); s.stop(t + dur + 0.05);
  }
  const N = { C4: 261.6, E4: 329.6, G4: 392, A4: 440, C5: 523.3, D5: 587.3, E5: 659.3, G5: 784, A5: 880, B5: 987.8, C6: 1046.5, E6: 1318.5, G6: 1568, A6: 1760 };
  const play = (fn) => () => { if (muted) return; if (!ctx()) return; try { fn(now()); } catch (e) {} };
  return {
    unlock,
    get muted() { return muted; },
    toggleMute() { muted = !muted; return muted; },
    // question appears: whoosh + rising arpeggio
    start: play((t) => {
      noise(t, 0.9, 300, 4200, 0.18);
      [N.C5, N.E5, N.G5, N.C6, N.E6].forEach((f, i) => { tone("triangle", f, t + 0.35 + i * 0.075, { g: 0.22, r: 0.5 }); tone("sine", f * 2, t + 0.35 + i * 0.075, { g: 0.05, r: 0.3 }); });
      strike(N.G6, t + 0.75, 0.12);
    }),
    // countdown tick
    tick: play((t) => { tone("square", 1200, t, { g: 0.09, a: 0.001, r: 0.05 }); tone("sine", 600, t, { g: 0.15, a: 0.001, r: 0.08 }); }),
    // buzzer open: two-tone chime
    open: play((t) => { strike(N.E6, t, 0.22); strike(N.A6, t + 0.16, 0.26); }),
    // someone buzzed: fast ringing bell
    bell: play((t) => {
      for (let i = 0; i < 14; i++) strike(i % 2 ? 1975 : 1760, t + i * 0.052, 0.2);
      tone("square", 880, t, { g: 0.06, a: 0.002, r: 0.7, vib: 18 });
    }),
    // correct answer: brass fanfare + sparkle
    correct: play((t) => {
      const f = lp(2600, 1.2);
      [N.G4, N.C5, N.E5].forEach((n, i) => [-6, 6].forEach((d) => tone("sawtooth", n, t + i * 0.1, { g: 0.12, a: 0.01, r: 0.16, dest: f, det: d })));
      [N.C5, N.E5, N.G5, N.C6].forEach((n) => [-7, 7].forEach((d) => tone("sawtooth", n, t + 0.32, { g: 0.09, a: 0.03, r: 1.1, dest: f, det: d })));
      [N.C6, N.E6, N.G6, N.C6 * 2].forEach((n, i) => strike(n, t + 0.34 + i * 0.07, 0.07));
    }),
    // wrong answer: low two-note buzz
    wrong: play((t) => {
      const f = lp(900, 2);
      [[196, 0, 0.22], [147, 0.28, 0.65]].forEach(([n, d, r]) => [-10, 10].forEach((dt) => tone("sawtooth", n, t + d, { g: 0.22, a: 0.01, r, dest: f, det: dt, vib: 7 })));
    }),
    // nobody got it: soft chord
    reveal: play((t) => { [N.C5, N.E5, N.G5, N.B5].forEach((n, i) => tone("triangle", n, t + i * 0.04, { g: 0.12, a: 0.04, r: 1.3 })); strike(N.E6, t, 0.08); }),
    // player joined
    join: play((t) => { tone("sine", 880, t, { g: 0.16, a: 0.003, r: 0.12, f2: 1500, slide: 0.08 }); }),
    // phone: button tap + win
    tap: play((t) => { tone("sine", 1400, t, { g: 0.25, a: 0.001, r: 0.06 }); strike(1760, t, 0.15); }),
    win: play((t) => { [N.C6, N.E6, N.G6].forEach((n, i) => strike(n, t + i * 0.09, 0.2)); }),
  };
})();
