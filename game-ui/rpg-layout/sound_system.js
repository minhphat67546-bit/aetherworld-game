/**
 * AetherWorld — Sound System (Procedural Web Audio API)
 * Không cần file âm thanh — tạo âm thanh bằng oscillator.
 */
const SoundSystem = (function () {
  'use strict';

  let ctx = null;
  let masterGain = null;
  let enabled = true;
  let musicOsc = null, musicGain = null;

  function _ctx() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = ctx.createGain();
      masterGain.gain.value = 0.45;
      masterGain.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function _play(fn) {
    if (!enabled) return;
    try { fn(_ctx(), masterGain); } catch(e) {}
  }

  // ─── Core helpers ────────────────────────────────────────────────
  function _tone(freq, type, duration, vol, attack = 0.01, decay = 0.05) {
    _play((ac, out) => {
      const g = ac.createGain();
      g.gain.setValueAtTime(0, ac.currentTime);
      g.gain.linearRampToValueAtTime(vol, ac.currentTime + attack);
      g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);
      g.connect(out);
      const osc = ac.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ac.currentTime);
      osc.connect(g);
      osc.start();
      osc.stop(ac.currentTime + duration + 0.05);
    });
  }

  function _noise(duration, vol, filter = null) {
    _play((ac, out) => {
      const bufSize = ac.sampleRate * duration;
      const buf = ac.createBuffer(1, bufSize, ac.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
      const src = ac.createBufferSource();
      src.buffer = buf;
      const g = ac.createGain();
      g.gain.setValueAtTime(vol, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);
      if (filter) {
        const f = ac.createBiquadFilter();
        f.type = filter.type || 'bandpass';
        f.frequency.value = filter.freq || 800;
        f.Q.value = filter.q || 1;
        src.connect(f); f.connect(g);
      } else {
        src.connect(g);
      }
      g.connect(out);
      src.start();
    });
  }

  // ─── Sound effects ───────────────────────────────────────────────

  function swing() {
    // Melee whoosh
    _play((ac, out) => {
      const g = ac.createGain();
      g.gain.setValueAtTime(0.25, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.18);
      g.connect(out);
      const osc = ac.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(420, ac.currentTime);
      osc.frequency.exponentialRampToValueAtTime(120, ac.currentTime + 0.18);
      osc.connect(g);
      osc.start();
      osc.stop(ac.currentTime + 0.2);
    });
  }

  function magicBolt() {
    // Purple arcane shot
    _play((ac, out) => {
      const g = ac.createGain();
      g.gain.setValueAtTime(0, ac.currentTime);
      g.gain.linearRampToValueAtTime(0.22, ac.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.35);
      g.connect(out);
      const osc = ac.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ac.currentTime);
      osc.frequency.exponentialRampToValueAtTime(330, ac.currentTime + 0.35);
      osc.connect(g);
      osc.start();
      osc.stop(ac.currentTime + 0.38);
    });
    _noise(0.12, 0.08, { type: 'highpass', freq: 3000, q: 1 });
  }

  function hit() {
    // Impact thud
    _play((ac, out) => {
      const g = ac.createGain();
      g.gain.setValueAtTime(0.3, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.12);
      g.connect(out);
      const osc = ac.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(160, ac.currentTime);
      osc.frequency.exponentialRampToValueAtTime(60, ac.currentTime + 0.12);
      osc.connect(g);
      osc.start();
      osc.stop(ac.currentTime + 0.15);
    });
    _noise(0.1, 0.15, { type: 'lowpass', freq: 400, q: 1 });
  }

  function playerHurt() {
    _tone(220, 'sawtooth', 0.25, 0.2);
    _noise(0.1, 0.1, { type: 'bandpass', freq: 600, q: 2 });
  }

  function playerDead() {
    _play((ac, out) => {
      const g = ac.createGain();
      g.gain.setValueAtTime(0.3, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.9);
      g.connect(out);
      const osc = ac.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(350, ac.currentTime);
      osc.frequency.exponentialRampToValueAtTime(60, ac.currentTime + 0.9);
      osc.connect(g);
      osc.start();
      osc.stop(ac.currentTime + 1.0);
    });
  }

  function levelUp() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((freq, i) => {
      setTimeout(() => _tone(freq, 'sine', 0.3, 0.25, 0.01), i * 100);
    });
  }

  function lootPickup() {
    _tone(880, 'sine', 0.12, 0.18);
    setTimeout(() => _tone(1100, 'sine', 0.12, 0.18), 80);
  }

  function portalEnter() {
    _play((ac, out) => {
      const g = ac.createGain();
      g.gain.setValueAtTime(0, ac.currentTime);
      g.gain.linearRampToValueAtTime(0.2, ac.currentTime + 0.1);
      g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.6);
      g.connect(out);
      const osc = ac.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(200, ac.currentTime);
      osc.frequency.exponentialRampToValueAtTime(800, ac.currentTime + 0.6);
      osc.connect(g);
      osc.start();
      osc.stop(ac.currentTime + 0.65);
    });
  }

  function skill() {
    _tone(660, 'square', 0.06, 0.15);
    _tone(880, 'sine', 0.2, 0.2);
    _noise(0.15, 0.08, { type: 'highpass', freq: 2000, q: 1 });
  }

  function dodge() {
    _play((ac, out) => {
      const g = ac.createGain();
      g.gain.setValueAtTime(0.18, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.15);
      g.connect(out);
      const osc = ac.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, ac.currentTime);
      osc.frequency.exponentialRampToValueAtTime(300, ac.currentTime + 0.15);
      osc.connect(g);
      osc.start();
      osc.stop(ac.currentTime + 0.18);
    });
    _noise(0.08, 0.06, { type: 'highpass', freq: 2500, q: 1 });
  }

  function bossRoar() {
    _play((ac, out) => {
      const g = ac.createGain();
      g.gain.setValueAtTime(0, ac.currentTime);
      g.gain.linearRampToValueAtTime(0.35, ac.currentTime + 0.08);
      g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.7);
      g.connect(out);
      const osc = ac.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(80, ac.currentTime);
      osc.frequency.setValueAtTime(60, ac.currentTime + 0.3);
      osc.connect(g);
      osc.start();
      osc.stop(ac.currentTime + 0.75);
    });
    _noise(0.4, 0.12, { type: 'lowpass', freq: 300, q: 1 });
  }

  function uiClick() {
    _tone(700, 'sine', 0.05, 0.1, 0.005);
  }

  // ─── Ambient music loop ─────────────────────────────────────────
  let _musicActive = false;
  const _AMBIENT_SCALE = [130.8, 146.8, 164.8, 174.6, 196.0, 220.0, 246.9];
  let _musicTimeout = null;

  function _playAmbientNote() {
    if (!_musicActive || !enabled) return;
    const ac = _ctx();
    const note = _AMBIENT_SCALE[Math.floor(Math.random() * _AMBIENT_SCALE.length)];
    const mult = [1, 2][Math.floor(Math.random() * 2)];
    const freq = note * mult;
    const dur = 1.5 + Math.random() * 2;
    const vol = 0.03 + Math.random() * 0.04;

    const g = ac.createGain();
    g.gain.setValueAtTime(0, ac.currentTime);
    g.gain.linearRampToValueAtTime(vol, ac.currentTime + 0.4);
    g.gain.linearRampToValueAtTime(0, ac.currentTime + dur);
    g.connect(masterGain || ac.destination);

    const osc = ac.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    osc.connect(g);
    osc.start();
    osc.stop(ac.currentTime + dur + 0.1);

    const next = 600 + Math.random() * 1400;
    _musicTimeout = setTimeout(_playAmbientNote, next);
  }

  function startMusic() {
    if (_musicActive) return;
    _musicActive = true;
    _playAmbientNote();
  }

  function stopMusic() {
    _musicActive = false;
    if (_musicTimeout) clearTimeout(_musicTimeout);
  }

  // ─── Master toggle ───────────────────────────────────────────────
  function setEnabled(v) {
    enabled = v;
    if (!v) stopMusic();
    else startMusic();
  }
  function isEnabled() { return enabled; }

  return { swing, magicBolt, hit, playerHurt, playerDead, levelUp, lootPickup, portalEnter, skill, dodge, bossRoar, uiClick, startMusic, stopMusic, setEnabled, isEnabled };
})();
