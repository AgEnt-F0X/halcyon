// Ambient sound (OFF by default, started only after a user click). Fully
// synthesised: filtered noise for wind and rain, band-passed pulsing noise for
// crickets at night, chirpy filtered noise near dawn, thunder on lightning.

export class AudioEngine {
  constructor() {
    this.enabled = false;
    this.ready = false;
    this._ac = null;
    this._gains = {};
    this._state = { wind: 0, rain: 0, night: 0, dawn: 0 };
  }

  init() {
    if (this.ready) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ac = this._ac = new AC();
    this.ready = true;

    // 2 s white noise buffer, shared by every synth voice
    const len = ac.sampleRate * 2;
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    const src = (dest) => {
      const s = ac.createBufferSource();
      s.buffer = buf; s.loop = true;
      s.connect(dest); s.start();
      return s;
    };
    const gain = (v) => { const g = ac.createGain(); g.gain.value = v; return g; };
    const filter = (type, freq, q) => {
      const f = ac.createBiquadFilter();
      f.type = type; f.frequency.value = freq;
      if (q) f.Q.value = q;
      return f;
    };

    const master = this._master = gain(0);
    master.connect(ac.destination);

    // wind: low rumble + slow swell LFO
    const windF = filter('lowpass', 320, 0.6);
    const windG = this._gains.wind = gain(0);
    src(windF); windF.connect(windG); windG.connect(master);
    const swell = ac.createOscillator();
    swell.frequency.value = 0.09;
    const swellG = gain(60);
    swell.connect(swellG); swellG.connect(windF.frequency); swell.start();

    // rain: broadband hiss
    const rainF = filter('highpass', 1400, 0.4);
    const rainG = this._gains.rain = gain(0);
    src(rainF); rainF.connect(rainG); rainG.connect(master);

    // crickets: narrow band, amplitude-patterned by two LFOs
    const crF = filter('bandpass', 4300, 22);
    const crG = this._gains.crickets = gain(0);
    src(crF); crF.connect(crG); crG.connect(master);
    const chirp = ac.createOscillator(); chirp.frequency.value = 21;
    const chirpG = gain(0.5);
    chirp.connect(chirpG); chirpG.connect(crG.gain); chirp.start();
    const burst = ac.createOscillator(); burst.frequency.value = 1.4;
    const burstG = gain(0.4);
    burst.connect(burstG); burstG.connect(crG.gain); burst.start();

    // dawn birds: wandering band-pass whistle-ish blips
    const birdF = filter('bandpass', 2600, 9);
    const birdG = this._gains.birds = gain(0);
    src(birdF); birdF.connect(birdG); birdG.connect(master);
    const blip = ac.createOscillator(); blip.frequency.value = 6.3;
    const blipG = gain(0.5);
    blip.connect(blipG); blipG.connect(birdG.gain); blip.start();
    const birdFm = ac.createOscillator(); birdFm.frequency.value = 0.7;
    const birdFmG = gain(900);
    birdFm.connect(birdFmG); birdFmG.connect(birdF.frequency); birdFm.start();

    // thunder: deep filtered noise, envelope-driven
    const thF = filter('lowpass', 110, 0.8);
    const thG = this._gains.thunder = gain(0);
    src(thF); thF.connect(thG); thG.connect(master);
  }

  setEnabled(on) {
    this.enabled = on;
    if (on) {
      this.init();
      if (!this.ready) return;
      if (this._ac.state === 'suspended') this._ac.resume();
      this._master.gain.setTargetAtTime(0.8, this._ac.currentTime, 0.8);
    } else if (this.ready) {
      this._master.gain.setTargetAtTime(0, this._ac.currentTime, 0.4);
    }
  }

  // state: { wind 0..1, rain 0..1, night 0..1, dawn 0..1 }
  update(dt, s) {
    this._state.wind = s.wind; this._state.rain = s.rain;
    this._state.night = s.night; this._state.dawn = s.dawn;
    if (!this.ready || !this.enabled) return;
    const t = this._ac.currentTime;
    const set = (name, v) => this._gains[name].gain.setTargetAtTime(v, t, 0.9);
    set('wind', 0.05 + s.wind * 0.30);
    set('rain', s.rain * 0.32);
    set('crickets', s.night * (1 - Math.min(1, s.rain * 2)) * 0.12);
    set('birds', s.dawn * (1 - Math.min(1, s.rain * 2)) * 0.09);
  }

  thunder() {
    if (!this.ready || !this.enabled) return;
    const t = this._ac.currentTime;
    const g = this._gains.thunder.gain;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(0.5 + Math.random() * 0.3, t, 0.06);
    g.setTargetAtTime(0, t + 0.5, 0.8);
  }
}
