import { Chord, Note } from "@amplib/music-theory";

export const chords = {};
export const chordTypes = Chord.types;
export const roots = Note.notations;

// The pad puts a root below the chord for weight, then the chord itself. The
// harp stacks the same notes across five octaves and reads top-note-first,
// because on screen it runs downward.
const OCTAVE_MIN = 2;
const OCTAVE_MAX = 6;
const OCTAVE_PAD = 3;

chordTypes.forEach((type) => {
  chords[type] = roots.map((_, step) =>
    chordWithPadAndStepper(new Chord(step, type), type)
  );
});

/**
 * Both voices take hertz rather than note ids: FMVoice tunes an oscillator
 * directly, where Tone resolved "C4" for us.
 */
function frequency(notation, octave) {
  return Note.octaveStepFrequencies[octave][Note.notationIndex(notation)];
}

function chordWithPadAndStepper(chord, type) {
  const { notes } = chord;
  const pad = [frequency(notes[0].notation, OCTAVE_MIN)].concat(
    notes.map(({ notation, octave }) => frequency(notation, OCTAVE_PAD + octave))
  );

  const stepper = [];
  for (let octave = OCTAVE_MIN; octave <= OCTAVE_MAX; octave++) {
    notes.forEach(({ notation, octave: offset }) => {
      if (octave + offset <= OCTAVE_MAX) {
        stepper.push(frequency(notation, octave + offset));
      }
    });
  }
  stepper.reverse();

  // `type` is set from the argument rather than read off the chord.
  // @amplib/music-theory 0.1.0 never assigns Chord#type, and app.js derives
  // every chord's hue from it — indexOf(undefined) is -1, which skews the
  // whole palette by one step without anything throwing. Fixed upstream in
  // 0.1.1; this keeps the app right on whichever build the CDN is serving.
  return { ...chord, type, pad, stepper };
}
