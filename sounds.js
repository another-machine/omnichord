import {
  AudioGraph,
  DrumMachine,
  DrumSynth,
  FMVoice,
  Reverb,
  TapeDelay,
  createLimiterNode,
  loadLimiterWorklet,
} from "@amplib/sound-synthesis";

/**
 * Patterns, in the order the rhythm button cycles them. These are the
 * package's synthesized patterns, not the six mp3 loops this app used to
 * carry — so the names moved: latin became bossanova, foxtrot became march,
 * and swing has no equivalent, because DrumMachine has no swing parameter to
 * build one from. A `_rhythm` saved under an old name falls back to the first
 * entry, which is the same thing the mp3 version did with an unknown name.
 */
export const RHYTHMS = [
  "rock",
  "march",
  "bossanova",
  "waltz",
  "slow-rock",
  "cha-cha",
  "samba",
  "ballad",
];

export const BPM_MIN = 50;
export const BPM_MAX = 190;
export const BPM_DEFAULT = 100;

/** Falls back to the first preset rather than throwing on an unknown id. */
export function findVoice(id) {
  return VOICES.find((voice) => voice.id === id) || VOICES[0];
}

const HARP_VOICE_COUNT = 12;
const PAD_VOICE_COUNT = 6;

/**
 * The harp sits under the chord, by about 6 dB.
 *
 * This is a bus trim rather than a smaller `peak` on each voice, because a
 * bus gain rides over notes that are already ringing while a change to peak
 * only takes effect from the next pluck — and the harp is played as a strum,
 * so there are always notes mid-decay.
 *
 * Levelled against a held chord, not against a single note. One pluck used to
 * measure ~2 dB above an entire four-note chord, which meant a strum of
 * several overlapping plucks buried it completely.
 */
const HARP_BUS_LEVEL = 0.5;

/**
 * And the chord comes up to meet it.
 *
 * Trimming the harp alone got the ratio right but left the whole instrument
 * quieter than it was, with the chord — the thing you actually hold down —
 * the weakest part of it. Raising this rather than dropping the harp further
 * keeps the harp audible as a lead while putting the chord underneath it.
 *
 * There is room for it: the pad peaks around 0.04 RMS at the output, and
 * AudioGraph's limiter is downstream of both buses anyway.
 */
const PAD_BUS_LEVEL = 1.4;

/**
 * Voices, in the order the selects list them.
 *
 * Each preset carries both halves — `harp` for the plucked strip, `pad` for the
 * held chord — tuned to sit together. But the two are picked independently, so
 * a preset is a pair of usable settings rather than a package deal: taking the
 * organ's chord under the vibes' harp is a normal thing to want.
 *
 * Everything here is two-operator FM, so the levers are few and blunt. `ratio`
 * is the modulator's pitch as a multiple of the carrier — whole numbers are
 * harmonic and read as pitched, fractional ones are inharmonic and read as
 * bell or metal. `index` is depth, which is to say brightness. `pluck` also
 * pushes index four times higher on the transient and decays it faster than
 * the amplitude, so a high index is a hard pick attack, not just a bright tone.
 *
 * The levels are not arbitrary. A sawtooth carrier at a high index spreads its
 * energy across many harmonics, so it measures *quieter* than a sine at the
 * same gain even though it sounds brighter — the opposite of what you would
 * guess. These were levelled by measuring peak RMS per voice and are matched
 * to within a couple of dB, deliberately leaving the brightest ones slightly
 * under: at equal RMS a bright sound already reads as louder.
 */
export const VOICES = [
  {
    id: "harp",
    // The bright plucked bell this app has always had.
    harp: { carrier: "sine", modulator: "sine", ratio: 2, index: 1.6, peak: 0.34, decay: 0.42 },
    pad: { carrier: "sine", modulator: "sine", ratio: 1, index: 0.7, level: 0.09, attack: 0.09 },
  },
  {
    id: "organ",
    // Ratio 2 at a shallow index leaves mostly odd harmonics, which is the
    // hollow drawbar sound. Fast attack, no bite.
    harp: { carrier: "sine", modulator: "sine", ratio: 2, index: 0.4, peak: 0.3, decay: 0.6 },
    pad: { carrier: "triangle", modulator: "sine", ratio: 2, index: 0.25, level: 0.085, attack: 0.04 },
  },
  {
    id: "vibes",
    // A fractional ratio puts the partials off the harmonic series, which is
    // what makes a struck-metal tone. Long decay to let it ring.
    harp: { carrier: "sine", modulator: "sine", ratio: 3.5, index: 1.1, peak: 0.3, decay: 0.95 },
    pad: { carrier: "sine", modulator: "sine", ratio: 3.5, index: 0.45, level: 0.07, attack: 0.12 },
  },
  {
    id: "guitar",
    // High index on a sawtooth carrier, decaying fast — the index envelope is
    // doing the pick attack.
    harp: { carrier: "sawtooth", modulator: "sine", ratio: 1, index: 2.2, peak: 0.4, decay: 0.28 },
    pad: { carrier: "sawtooth", modulator: "sine", ratio: 1, index: 1.1, level: 0.1, attack: 0.06 },
  },
  {
    id: "strings",
    // The slow pad attack is the whole character here; the harp half is left
    // long so it blends into the chord instead of sitting on top of it.
    harp: { carrier: "sawtooth", modulator: "sine", ratio: 1, index: 0.8, peak: 0.45, decay: 0.8 },
    pad: { carrier: "sawtooth", modulator: "sine", ratio: 1, index: 0.55, level: 0.13, attack: 0.35 },
  },
];

// Chord changes glide rather than jump. Long enough that the pitch change
// never clicks, short enough that it does not read as portamento.
const PAD_GLIDE = 0.03;
const PAD_RELEASE = 0.28;

export class Sounds {
  constructor() {
    this.loaded = undefined;
    this.rhythmOn = false;
    this.rhythmIndex = 0;
    this.harpVoices = [];
    this.padVoices = [];
    this.nextHarpVoice = 0;
    // Set before initialize() by the controller's saved-settings pass, so the
    // FX toggle and the voice have an answer before there is an audio context
    // to act on.
    this.fx = true;
    // The two halves are chosen independently. Every preset defines both, so
    // either can be picked for either part — organ chords under a vibes harp
    // is a different instrument from organ throughout, and there is no reason
    // the strip and the chord under it have to agree.
    this.harpVoice = VOICES[0];
    this.padVoice = VOICES[0];
    this.bpm = BPM_DEFAULT;
  }

  /**
   * Both are safe before initialize(): with no pools yet they just record the
   * choice, and initialize() builds the voices from it.
   */
  setHarpVoice(id) {
    this.harpVoice = findVoice(id);
    this.applyVoice();
    return this.harpVoice.id;
  }

  setPadVoice(id) {
    this.padVoice = findVoice(id);
    this.applyVoice();
    return this.padVoice.id;
  }

  applyVoice() {
    if (!this.audioContext) return;
    // Glided rather than set, so switching voice under a held chord bends into
    // the new tone instead of cutting to it.
    const tau = 0.05;
    const shape = (voices, settings) =>
      voices.forEach((voice) => {
        voice.carrier.type = settings.carrier;
        voice.modulator.type = settings.modulator;
        voice.setRatio(settings.ratio, tau);
        voice.setIndex(settings.index, tau);
      });
    shape(this.harpVoices, this.harpVoice.harp);
    shape(this.padVoices, this.padVoice.pad);
  }

  /**
   * Build the audio graph. Must be called from a user gesture — a browser
   * will not start an AudioContext without one.
   */
  async initialize(rhythm, bpm) {
    this.loaded = false;

    const audioContext = new AudioContext();
    this.audioContext = audioContext;
    this.graph = new AudioGraph({ audioContext });

    // headroomPad → [delay + reverb] → autoMakeup. The insert is always in
    // circuit and the FX toggle rides its wet gains instead of rewiring, so
    // toggling mid-chord cannot click and cannot race a disconnect. Its dry
    // path is a plain gain, so "off" is transparent — and with no saturation
    // or mid-boost in here, autoMakeup's default +6 dB already cancels
    // headroomPad exactly, which is why updateAutoMakeup is never called.
    this.buildInsert();

    this.graph.pluckBus.gain.value = HARP_BUS_LEVEL;
    this.graph.midBus.gain.value = PAD_BUS_LEVEL;
    this.harpVoices = Array.from({ length: HARP_VOICE_COUNT }, () => {
      const panner = audioContext.createStereoPanner();
      panner.connect(this.graph.pluckBus);
      return new FMVoice({
        audioContext,
        destination: panner,
        ratio: this.harpVoice.harp.ratio,
        index: this.harpVoice.harp.index,
        carrierType: this.harpVoice.harp.carrier,
        modulatorType: this.harpVoice.harp.modulator,
      });
    });

    this.padVoices = Array.from(
      { length: PAD_VOICE_COUNT },
      () =>
        new FMVoice({
          audioContext,
          destination: this.graph.midBus,
          ratio: this.padVoice.pad.ratio,
          index: this.padVoice.pad.index,
          carrierType: this.padVoice.pad.carrier,
          modulatorType: this.padVoice.pad.modulator,
        })
    );

    this.rhythmIndex = Math.max(0, RHYTHMS.indexOf(rhythm));
    this.bpm = this.clampBpm(bpm);
    this.drumSynth = new DrumSynth({
      audioContext,
      destination: this.graph.layerSum,
    });
    this.drumMachine = new DrumMachine({
      drumSynth: this.drumSynth,
      bpm: this.bpm,
      pattern: RHYTHMS[this.rhythmIndex],
    });
    this.drumSynth.setVolume(0.55);

    this.handleFxChange();

    // Sound is ready now. There is nothing left to fetch — the drums are
    // synthesized, which is what retired the samples directory and the
    // loading state that went with it.
    this.loaded = true;

    // The limiter is a progressive enhancement: AudioGraph already has a
    // compressor doing the job, and the swap only happens if the worklet
    // actually loads. Deliberately not awaited before `loaded` — a slow or
    // blocked worklet fetch must not hold up the first chord.
    loadLimiterWorklet(audioContext).then((ok) => {
      if (ok && this.graph) {
        this.graph.swapToWorkletLimiter(createLimiterNode({ audioContext }));
      }
    });
  }

  /**
   * A ping-pong delay into a small room, on AudioGraph's insert point.
   *
   * Both effects now come from @amplib/sound-synthesis rather than being
   * built here by hand. AudioGraph always left this gap — it pads 6 dB of
   * headroom before the insert and makes it back up after — but shipped
   * nothing to put in it.
   */
  buildInsert() {
    const ctx = this.audioContext;
    const { headroomPad, autoMakeup } = this.graph;

    const mix = ctx.createGain();
    // Dry. Always unity — the FX toggle moves the wet sends, not this.
    headroomPad.connect(mix);

    this.delay = new TapeDelay({
      audioContext: ctx,
      destination: mix,
      timeMs: 250,
      feedback: 0.32,
      dampingHz: 3200,
      wet: 0,
      pingPong: true,
    });
    headroomPad.connect(this.delay.input);

    this.reverb = new Reverb({
      audioContext: ctx,
      destination: mix,
      decaySeconds: 1.6,
      wet: 0,
    });
    headroomPad.connect(this.reverb.input);
    // The repeats go through the room as well, so the delay sits inside the
    // space rather than in front of it.
    this.delay.output.connect(this.reverb.input);

    // The gentle roll-off the Tone chain had on both voices. AudioGraph
    // already high-passes each bus, so only the top needs shaping here.
    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = 7000;
    tone.Q.value = 0.7;
    mix.connect(tone);
    tone.connect(autoMakeup);
  }

  clampBpm(bpm) {
    const value = Number.isFinite(bpm) ? bpm : 100;
    return Math.min(BPM_MAX, Math.max(BPM_MIN, Math.round(value)));
  }

  handleFxChange() {
    if (!this.delay) return;
    this.delay.setWet(this.fx ? 0.32 : 0);
    this.reverb.setWet(this.fx ? 0.26 : 0);
  }

  fxOn() {
    this.fx = true;
    this.handleFxChange();
  }

  fxOff() {
    this.fx = false;
    this.handleFxChange();
  }

  /**
   * Pick a pattern by name. Safe before initialize(): with no drum machine
   * yet this just records the choice for initialize() to build from.
   */
  setRhythm(id) {
    this.rhythmIndex = Math.max(0, RHYTHMS.indexOf(id));
    // setPattern on a running machine keeps the beat — the scheduler carries
    // on from where it is rather than restarting the loop.
    this.drumMachine?.setPattern(RHYTHMS[this.rhythmIndex]);
    return RHYTHMS[this.rhythmIndex];
  }

  triggerRhythm() {
    if (!this.drumMachine) return;
    if (this.rhythmOn) {
      this.drumMachine.stop();
    } else {
      this.drumMachine.start();
    }
    this.rhythmOn = !this.rhythmOn;
  }

  /**
   * Real tempo, in beats per minute — the number the panel shows and sets.
   * The mp3 version had no bpm to report at all: it scaled sample playback
   * rate, which pitched the whole kit up and down as it went.
   *
   * Safe before initialize(), like the other setters.
   */
  setBpm(value) {
    const bpm = this.clampBpm(value);
    this.bpm = bpm;
    this.drumMachine?.setBpm(bpm);
    return bpm;
  }

  triggerHarp(frequency) {
    if (!this.harpVoices.length) return;
    const voice = this.harpVoices[this.nextHarpVoice];
    this.nextHarpVoice = (this.nextHarpVoice + 1) % this.harpVoices.length;
    voice.pluck(frequency, {
      peak: this.harpVoice.harp.peak,
      ampDecayTau: this.harpVoice.harp.decay,
      attackTau: 0.002,
    });
  }

  /**
   * FMVoice has no attack/release pair, so a held chord is a set of voices
   * gliding to pitch and fading up — one voice per pad note, by position.
   */
  triggerPadAttack(chord) {
    if (!this.padVoices.length) return;
    chord.pad.forEach((frequency, i) => {
      const voice = this.padVoices[i];
      if (!voice) return;
      voice.glideTo(frequency, PAD_GLIDE);
      voice.setGain(this.padVoice.pad.level, this.padVoice.pad.attack);
    });
    // A triad after a seventh leaves a voice holding a note that is no longer
    // in the chord. Fade those out rather than leaving them ringing.
    for (let i = chord.pad.length; i < this.padVoices.length; i++) {
      this.padVoices[i].setGain(0, PAD_RELEASE);
    }
  }

  triggerPadRelease() {
    this.padVoices.forEach((voice) => voice.setGain(0, PAD_RELEASE));
  }

  stopAll() {
    this.triggerPadRelease();
  }
}
