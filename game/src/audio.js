// Procedural sound: every effect is synthesised with WebAudio, so the game
// ships no audio files at all. A lazy AudioContext wakes on the first user
// gesture (browsers refuse sound before one). The engine note and the police
// siren are steady oscillators whose pitch follows the game; shots, hits,
// pickups and cash are short shaped bursts. In screenshot mode nothing starts.

export class Sound {
  constructor(enabled = true) {
    this.enabled = enabled;
    this.ctx = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenPhase = 0;
  }

  wake() {
    if (!this.enabled || this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
  }

  tone(freq, dur, type = 'square', vol = 0.2, slideTo = null, delay = 0) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  noise(dur, vol = 0.25, freq = 1200, delay = 0) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    const gain = this.ctx.createGain();
    gain.gain.value = vol;
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t0);
  }

  shot() {
    this.noise(0.14, 0.5, 900);
    this.tone(160, 0.1, 'square', 0.25, 60);
  }

  punch() {
    this.noise(0.08, 0.35, 400);
  }

  hit() {
    this.tone(220, 0.09, 'sawtooth', 0.2, 90);
  }

  hurt() {
    this.tone(140, 0.16, 'sawtooth', 0.28, 70);
  }

  pickup() {
    this.tone(660, 0.09, 'sine', 0.22);
    this.tone(990, 0.14, 'sine', 0.22, null, 0.07);
  }

  cash() {
    this.tone(880, 0.08, 'triangle', 0.25);
    this.tone(1174, 0.1, 'triangle', 0.25, null, 0.06);
    this.tone(1568, 0.18, 'triangle', 0.25, null, 0.12);
  }

  missionDone() {
    for (let i = 0; i < 4; i++) this.tone(523 + i * 131, 0.16, 'triangle', 0.22, null, i * 0.09);
  }

  bustedJingle() {
    this.tone(392, 0.22, 'square', 0.2);
    this.tone(330, 0.22, 'square', 0.2, null, 0.2);
    this.tone(262, 0.4, 'square', 0.2, null, 0.4);
  }

  carDoor() {
    this.noise(0.06, 0.3, 500);
    this.tone(90, 0.08, 'sine', 0.3, 55, 0.03);
  }

  crash(strength = 1) {
    this.noise(0.22, Math.min(0.6, 0.25 + strength * 0.3), 300);
    this.tone(70, 0.2, 'sine', 0.4, 40);
  }

  // A two-note bass loop, scheduled bar by bar from the game loop.
  musicTick(bar) {
    if (!this.ctx) return;
    const bass = [55, 55, 82.4, 65.4];
    const note = bass[bar % bass.length];
    this.tone(note, 0.42, 'triangle', 0.16);
    this.tone(note * 2, 0.2, 'sine', 0.07, null, 0.21);
  }

  setEngine(on, speedRatio = 0) {
    if (!this.ctx) return;
    if (on && !this.engineOsc) {
      this.engineOsc = this.ctx.createOscillator();
      this.engineGain = this.ctx.createGain();
      this.engineOsc.type = 'sawtooth';
      this.engineGain.gain.value = 0.05;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      this.engineOsc.connect(filter).connect(this.engineGain).connect(this.master);
      this.engineOsc.start();
    }
    if (!on && this.engineOsc) {
      this.engineOsc.stop();
      this.engineOsc = null;
    }
    if (this.engineOsc) {
      this.engineOsc.frequency.value = 55 + speedRatio * 130;
    }
  }

  setSiren(on, dt = 0) {
    if (!this.ctx) return;
    if (on && !this.sirenOsc) {
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenGain = this.ctx.createGain();
      this.sirenOsc.type = 'triangle';
      this.sirenGain.gain.value = 0.045;
      this.sirenOsc.connect(this.sirenGain).connect(this.master);
      this.sirenOsc.start();
    }
    if (!on && this.sirenOsc) {
      this.sirenOsc.stop();
      this.sirenOsc = null;
    }
    if (this.sirenOsc) {
      this.sirenPhase += dt * 2.4;
      this.sirenOsc.frequency.value = 700 + Math.sin(this.sirenPhase * Math.PI) * 260;
    }
  }
}
