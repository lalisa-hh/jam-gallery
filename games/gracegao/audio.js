// Web Audio sound system: calm generative music, lapping waves, pickup chimes and splash. No audio files.
import {
  MASTER_VOLUME, MUSIC_VOLUME, SFX_VOLUME,
  MUSIC_NOTE_INTERVAL, MUSIC_NOTE_LENGTH, MUSIC_NOTE_GAIN, MUSIC_NOTES,
  WAVE_LEVEL, WAVE_LFO_RATE, WAVE_LFO_DEPTH, WAVE_FILTER_HZ,
  CHIME_NOTES, CHIME_VOLUME, CHIME_DECAY,
  SPLASH_VOLUME, SPLASH_DECAY,
} from './tuning.js';

export function createAudio() {
  let ctx = null;
  let master = null;
  let musicBus = null;   // music + ambience
  let sfxBus = null;     // chimes + splashes
  let noise = null;      // shared white-noise buffer
  let ambientOn = false;
  let muted = false;
  let musicTimer = 0;
  let noteIndex = 0;

  // Build the graph once, on the first user gesture (browsers block autoplay before that).
  function ensure() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : MASTER_VOLUME;
    master.connect(ctx.destination);
    musicBus = ctx.createGain();
    musicBus.gain.value = MUSIC_VOLUME;
    musicBus.connect(master);
    sfxBus = ctx.createGain();
    sfxBus.gain.value = SFX_VOLUME;
    sfxBus.connect(master);
    return true;
  }

  // A short buffer of white noise, reused by the waves and the splash.
  function noiseBuffer() {
    if (noise) return noise;
    const len = Math.floor(ctx.sampleRate * 2);
    noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return noise;
  }

  // SECTION: one soft music note — two quiet sines with a long swell in and out.
  function playNote() {
    const f = MUSIC_NOTES[noteIndex % MUSIC_NOTES.length];
    noteIndex++;
    const t = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(MUSIC_NOTE_GAIN, t + MUSIC_NOTE_LENGTH * 0.35);
    g.gain.linearRampToValueAtTime(0, t + MUSIC_NOTE_LENGTH);
    g.connect(musicBus);
    for (const mult of [1, 2]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f * mult;
      const og = ctx.createGain();
      og.gain.value = mult === 1 ? 1 : 0.22;
      o.connect(og).connect(g);
      o.start(t);
      o.stop(t + MUSIC_NOTE_LENGTH + 0.1);
    }
  }

  // SECTION: lapping waves — looped filtered noise with a slow LFO breathing the level and the filter.
  function startWaves() {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer();
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = WAVE_FILTER_HZ;
    filter.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.value = WAVE_LEVEL;

    const lfo = ctx.createOscillator();
    lfo.frequency.value = WAVE_LFO_RATE;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = WAVE_LFO_DEPTH;
    lfo.connect(lfoGain).connect(g.gain);

    const filterLfo = ctx.createOscillator();
    filterLfo.frequency.value = WAVE_LFO_RATE * 0.6;
    const filterLfoGain = ctx.createGain();
    filterLfoGain.gain.value = WAVE_FILTER_HZ * 0.4;
    filterLfo.connect(filterLfoGain).connect(filter.frequency);

    src.connect(filter).connect(g).connect(musicBus);
    src.start();
    lfo.start();
    filterLfo.start();
  }

  // SECTION: a gentle two-note chime for picking something up.
  function chime() {
    if (!ensure()) return;
    const t = ctx.currentTime;
    CHIME_NOTES.forEach((f, i) => {
      const start = t + i * 0.06;
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(CHIME_VOLUME / (i + 1), start + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, start + CHIME_DECAY);
      o.connect(g).connect(sfxBus);
      o.start(start);
      o.stop(start + CHIME_DECAY + 0.1);
    });
  }

  // SECTION: a soft splash for a wave hitting the girl — a short wash of filtered noise.
  function splash() {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer();
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 0.8;
    filter.frequency.setValueAtTime(1600, t);
    filter.frequency.exponentialRampToValueAtTime(450, t + SPLASH_DECAY);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(SPLASH_VOLUME, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + SPLASH_DECAY);
    src.connect(filter).connect(g).connect(sfxBus);
    src.start(t);
    src.stop(t + SPLASH_DECAY + 0.05);
  }

  // SECTION: start on the first gesture, and start the ambient bed when a day begins.
  function start() {
    if (!ensure()) return;
    if (ctx.state === 'suspended') ctx.resume();
  }

  function startAmbient() {
    if (!ensure()) return;
    if (ctx.state === 'suspended') ctx.resume();
    if (ambientOn) return;
    ambientOn = true;
    startWaves();
    playNote();
    musicTimer = setInterval(playNote, MUSIC_NOTE_INTERVAL * 1000);
  }

  // SECTION: mute toggle — ramped so it never clicks.
  function setMuted(m) {
    muted = m;
    if (!ctx) return;
    const t = ctx.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(master.gain.value, t);
    master.gain.linearRampToValueAtTime(m ? 0 : MASTER_VOLUME, t + 0.08);
  }
  function toggleMute() { setMuted(!muted); return muted; }

  return { start, startAmbient, chime, splash, setMuted, toggleMute, isMuted: () => muted };
}
