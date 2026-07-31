import { chords } from "./chords.js";
import { Touch } from "./touch.js";
import { BPM_MAX, BPM_MIN, RHYTHMS, Sounds, VOICES } from "./sounds.js";
import { CUSTOM_THEME_ID, THEMES, resolveTheme, themeById } from "./theme.js";
import {
  DEFAULT_HARP_SIDE,
  DEFAULT_LAYOUT,
  isHarpSide,
  isLayout,
} from "./layout.js";

export const EDIT_HASH = "#edit";

const clampBpm = (value, fallback) =>
  Number.isFinite(value)
    ? Math.min(BPM_MAX, Math.max(BPM_MIN, Math.round(value)))
    : fallback;

const knownVoice = (id, fallback) =>
  VOICES.some((voice) => voice.id === id) ? id : fallback;

export class Controller {
  constructor(canvas, onModeChange) {
    this.sounds = new Sounds();
    this.onModeChange = onModeChange;
    window.addEventListener("hashchange", (e) => {
      e.preventDefault();
      this.updateMode();
      this.sounds.stopAll();
    });
    // Only one mode lives on the canvas now: "edit", where the chord grid
    // stops playing and starts enabling and disabling chords. Everything else
    // that used to require the old config mode is a form control in the menu.
    // It stays on the hash so the back button leaves edit mode for free.
    this.mode = location.hash === EDIT_HASH ? "edit" : "perform";
    const settings = this.saved();
    // this._chord = settings._chord; // TODO: playing the chord or not
    this._layout = settings._layout;
    this._fx = settings._fx === undefined ? true : settings._fx;
    this._harpSide = settings._harpSide;
    this._labels = settings._labels;
    this._bpm = settings._bpm;
    this._rhythm = settings._rhythm;
    this._harpVoice = settings._harpVoice;
    this._padVoice = settings._padVoice;
    this._themeId = settings._themeId;
    this._themeCustom = settings._themeCustom;
    this.actives = settings.actives;
    this.areas = {};
    this.currentAreaId = null;
    this.handleFx();
    // All safe before the audio context exists — Sounds records each choice
    // and builds from it when initialize() runs.
    this.sounds.setHarpVoice(this._harpVoice);
    this.sounds.setPadVoice(this._padVoice);
    this.sounds.setRhythm(this._rhythm);
    this.sounds.setBpm(this._bpm);
    this.touch = new Touch(canvas, () =>
      this.sounds.initialize(this._rhythm, this._bpm)
    );
  }

  addArea(area) {
    this.areas[area.id] = area;
    return area;
  }

  handleFx() {
    if (this._fx) {
      this.sounds.fxOn();
    } else {
      this.sounds.fxOff();
    }
  }

  /**
   * Every persisted setting, as a plain object. Shared by localStorage and by
   * the image export, so a save file and a reload restore exactly the same
   * thing — there is no second list to keep in step.
   */
  params() {
    return {
      _layout: this._layout,
      _fx: this._fx,
      _harpSide: this._harpSide,
      _labels: this._labels,
      _bpm: this._bpm,
      _rhythm: this._rhythm,
      _harpVoice: this._harpVoice,
      _padVoice: this._padVoice,
      _themeId: this._themeId,
      _themeCustom: this._themeCustom,
      actives: this.actives,
    };
  }

  save() {
    localStorage.setItem("omnichord", JSON.stringify(this.params()));
  }

  /**
   * Fill in and sanity-check an arbitrary settings object.
   *
   * Everything that reaches the controller from outside goes through here —
   * localStorage, and now a decoded image, which is a file from anywhere at
   * all. A missing key falls back, and a value naming something that no longer
   * exists falls back rather than propagating: an unknown rhythm would leave
   * the drum machine with no pattern, and an unknown voice no oscillator
   * settings.
   */
  normalize(raw) {
    const defaults = {
      _layout: DEFAULT_LAYOUT,
      _fx: true,
      _harpSide: DEFAULT_HARP_SIDE,
      _labels: true,
      _bpm: 100,
      _rhythm: "rock",
      _harpVoice: VOICES[0].id,
      _padVoice: VOICES[0].id,
      _themeId: THEMES[0].id,
      _themeCustom: { ...THEMES[0] },
      actives: Object.values(chords).reduce((actives, chordArray) => {
        chordArray.forEach(({ label }) => (actives[label] = 1));
        return actives;
      }, {}),
    };
    if (!raw || typeof raw !== "object") return defaults;
    const {
      _fixed,
      _layout,
      _fx,
      _invert,
      _harpSide,
      _labels,
      _bpm,
      _rhythm,
      _voice,
      _harpVoice,
      _padVoice,
      _themeId,
      _themeCustom,
      actives,
    } = raw;
    return {
      ...defaults,
      // `_fixed` is what this was before it grew a third option: a boolean for
      // whether a disabled chord kept its slot. True meant exactly what
      // "fixed" means now, false what "fill" means, so an old save — from
      // storage or from an image made before the change — maps straight over.
      _layout: isLayout(_layout)
        ? _layout
        : _fixed === true
          ? "fixed"
          : _fixed === false
            ? "fill"
            : defaults._layout,
      _fx,
      // `_invert` was a boolean for whether the harp swapped ends. True put it
      // first, false last, so an old save — from storage or from an image made
      // before the change — maps straight over.
      _harpSide: isHarpSide(_harpSide)
        ? _harpSide
        : _invert === true
          ? "first"
          : _invert === false
            ? "last"
            : defaults._harpSide,
      _labels,
      // A listed key holding undefined overrides the default rather than
      // falling back to it, so each of these needs an explicit fallback.
      // `_rate` is what tempo was saved as before the drums were synthesized,
      // and `_voice` what a single shared voice was saved as before the harp
      // and the chord could differ.
      // Clamped here as well as in Sounds. Sounds protects the drum machine,
      // but an out-of-range value left in the controller would still be shown
      // in the tempo field and written back to storage — and a settings image
      // is a file from anywhere, so this is not only about our own writes.
      _bpm: clampBpm(_bpm, defaults._bpm),
      _rhythm: RHYTHMS.includes(_rhythm) ? _rhythm : defaults._rhythm,
      _harpVoice: knownVoice(_harpVoice ?? _voice, defaults._harpVoice),
      _padVoice: knownVoice(_padVoice ?? _voice, defaults._padVoice),
      _themeId:
        _themeId === CUSTOM_THEME_ID || themeById(_themeId)
          ? _themeId
          : defaults._themeId,
      _themeCustom: _themeCustom ?? defaults._themeCustom,
      actives: actives && typeof actives === "object" ? actives : defaults.actives,
    };
  }

  saved() {
    try {
      return this.normalize(JSON.parse(localStorage.getItem("omnichord")));
    } catch (e) {
      return this.normalize(null);
    }
  }

  /**
   * Adopt a settings object — the load half of the image export.
   *
   * Everything audible is pushed back through the same setters the menu uses,
   * so a loaded file changes the running instrument rather than only taking
   * effect on the next reload.
   */
  apply(raw) {
    const settings = this.normalize(raw);
    this._layout = settings._layout;
    this._fx = settings._fx;
    this._harpSide = settings._harpSide;
    this._labels = settings._labels;
    this._bpm = settings._bpm;
    this._rhythm = settings._rhythm;
    this._harpVoice = settings._harpVoice;
    this._padVoice = settings._padVoice;
    this._themeId = settings._themeId;
    this._themeCustom = settings._themeCustom;
    this.actives = settings.actives;
    this.handleFx();
    this.sounds.setHarpVoice(this._harpVoice);
    this.sounds.setPadVoice(this._padVoice);
    this.sounds.setRhythm(this._rhythm);
    this.sounds.setBpm(this._bpm);
    this.save();
    this.onModeChange();
    return settings;
  }

  highlight(chord) {
    if (this.mode === "edit") {
      return Boolean(this.actives[chord.label]);
    } else {
      return this.currentAreaId === chord.label;
    }
  }

  updateMode() {
    this.mode = location.hash === EDIT_HASH ? "edit" : "perform";
    this.currentAreaId = null;
    this.onModeChange();
  }

  process(harpShape) {
    const states = this.touch.updatePointers(Object.values(this.areas));
    for (let areaId in states) {
      const { pointer, state } = states[areaId];
      if (state) {
        if (this.touch.initialized) {
          if (areaId === "stepper") {
            this.handleStepper(pointer, state, harpShape);
          } else if (state === "down") {
            this.handlePad(areaId);
          }
        }
      }
    }
  }

  tick() {
    this.areas = {};
    return { chords: this.chords, chordTypes: this.chordTypes };
  }

  /**
   * Set a flag from a checkbox's own state rather than flipping the model.
   *
   * Flipping happens to agree when a person clicks — the browser updates
   * `checked` and then fires the event — but it means the handler never reads
   * the control it belongs to, so the two drift apart the moment anything sets
   * the checkbox directly.
   */
  setFlag(key, value) {
    switch (key) {
      case "labels":
        this._labels = value;
        break;
      case "fx":
        this._fx = value;
        break;
    }
    this.save();
  }

  toggle(value) {
    switch (value) {
      case "labels":
        this._labels = !this._labels;
        break;
      case "fx":
        this._fx = !this._fx;
        break;
    }
    this.save();
  }

  setHarpVoice(id) {
    this._harpVoice = this.sounds.setHarpVoice(id);
    this.save();
    return this._harpVoice;
  }

  setPadVoice(id) {
    this._padVoice = this.sounds.setPadVoice(id);
    this.save();
    return this._padVoice;
  }

  setHarpSide(id) {
    this._harpSide = isHarpSide(id) ? id : DEFAULT_HARP_SIDE;
    this.save();
    return this._harpSide;
  }

  setLayout(id) {
    this._layout = isLayout(id) ? id : DEFAULT_LAYOUT;
    this.save();
    return this._layout;
  }

  setTheme(id) {
    this._themeId = themeById(id) ? id : CUSTOM_THEME_ID;
    // Selecting a preset seeds the sliders with its numbers, so switching to
    // custom afterwards starts from what you were just looking at rather than
    // snapping back to whatever was there before.
    const preset = themeById(this._themeId);
    if (preset) this._themeCustom = { ...preset };
    this.save();
    return this._themeId;
  }

  /**
   * Move one of the four range endpoints. Any edit makes the theme custom —
   * the select can no longer honestly name a preset once its numbers differ.
   */
  setThemeValue(key, value) {
    this._themeCustom = { ...this._themeCustom, [key]: value };
    this._themeId = CUSTOM_THEME_ID;
    this.save();
    return this._themeCustom;
  }

  get theme() {
    return resolveTheme({ id: this._themeId, custom: this._themeCustom });
  }

  setRhythm(id) {
    this._rhythm = this.sounds.setRhythm(id);
    this.save();
    return this._rhythm;
  }

  setBpm(value) {
    this._bpm = this.sounds.setBpm(value);
    this.save();
    return this._bpm;
  }

  /**
   * Enable or disable every chord at once.
   *
   * Deselecting all really does leave nothing to play — the chords getter
   * drops empty types, so the grid renders empty until something is selected
   * again. That is allowed on purpose: it is the fastest way to start from
   * nothing and pick out the handful you actually want, and the edit bar is
   * on screen the whole time to undo it.
   */
  setAllActive(active) {
    const value = active ? 1 : 0;
    Object.values(chords).forEach((chordArray) =>
      chordArray.forEach(({ label }) => (this.actives[label] = value))
    );
    this.save();
  }

  /**
   * Move every enabled chord up or down a semitone, keeping its quality.
   *
   * `chords[type]` is indexed by root step, so the shift is an index rotation
   * — C major at 0 becomes C# major at 1 — and wrapping past B lands back on
   * C rather than falling off the end.
   *
   * Selecting everything makes this a no-op, which is correct: the full set is
   * already every root, so transposing it gives the same set back.
   */
  transpose(step) {
    const next = {};
    Object.values(chords).forEach((chordArray) => {
      chordArray.forEach((chord, root) => {
        if (this.actives[chord.label]) {
          const length = chordArray.length;
          const shifted = chordArray[(root + step + length) % length];
          next[shifted.label] = 1;
        }
      });
    });
    // Rebuilt rather than mutated in place: shifting one at a time would let
    // a chord move onto a slot not yet visited and then get moved again.
    Object.values(chords).forEach((chordArray) =>
      chordArray.forEach(({ label }) => {
        this.actives[label] = next[label] ? 1 : 0;
      })
    );
    this.save();
  }

  /**
   * Enable a random subset of chords.
   *
   * Deliberately unweighted — no key, no diatonic bias. Picking a key would
   * make it a chord-progression generator, and the point of this is to land
   * somewhere you would not have chosen, then pare it down by hand.
   *
   * The guard matters: at a sparse density an unlucky roll really can select
   * nothing, and an instrument with no chords on it looks broken rather than
   * empty.
   */
  randomize(density) {
    const all = Object.values(chords).flat();
    let enabled = 0;
    all.forEach((chord) => {
      const on = Math.random() < density ? 1 : 0;
      this.actives[chord.label] = on;
      enabled += on;
    });
    if (!enabled) {
      this.actives[all[Math.floor(Math.random() * all.length)].label] = 1;
    }
    this.save();
  }

  toggleRhythm() {
    if (!this.sounds.loaded) return false;
    this.sounds.triggerRhythm();
    return this.sounds.rhythmOn;
  }

  handlePad(areaId) {
    if (this.mode === "edit") {
      this.actives[areaId] = this.actives[areaId] ? 0 : 1;
      this.save();
      return;
    }
    if (this.currentAreaId === areaId) {
      this.currentAreaId = undefined;
      this.sounds.triggerPadRelease();
    } else {
      if (this.currentAreaId) {
        this.sounds.triggerPadRelease();
      }
      this.currentAreaId = areaId;
      this.sounds.triggerPadAttack(this.areas[areaId].chord);
    }
  }

  handleStepper(pointer, state, harpShape) {
    const relative = this.touch.relateArea(harpShape);
    const landscape = relative.w < relative.h;
    const area = this.areas[this.currentAreaId];
    this.previousStepIdx = this.currentStepIdx;
    if (area && state !== "up") {
      const perc = landscape
        ? (pointer.y - relative.y) / relative.h
        : (pointer.x - relative.x) / relative.w;
      let inc = 0;
      this.currentStepIdx = -1;
      const step = 1 / area.chord.stepper.length;
      area.chord.stepper.forEach(() => {
        inc += step;
        if (perc <= inc) {
          this.currentStepIdx++;
        }
      });
    } else {
      this.currentStepIdx = undefined;
    }
    if (
      state !== "up" &&
      this.currentStepIdx !== this.previousStepIdx &&
      this.currentStepIdx !== undefined
    ) {
      const index = landscape
        ? area.chord.stepper.length - 1 - this.currentStepIdx
        : this.currentStepIdx;
      this.sounds.triggerHarp(area.chord.stepper[index]);
    }
  }

  get chords() {
    if (this.mode === "edit") {
      return chords;
    }
    const copy = { ...chords };
    for (let type in copy) {
      if (this._layout === "fixed") {
        // Nulls, not omissions: the renderer needs the slot to still be there
        // so the chords around it do not close the gap.
        copy[type] = copy[type].map((a) => (this.actives[a.label] ? a : null));
      } else {
        copy[type] = copy[type].filter(({ label }) =>
          Boolean(this.actives[label])
        );
        if (!copy[type].length) {
          delete copy[type];
        }
      }
    }
    return copy;
  }
}
