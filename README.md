# Omnichord

[omnichord.amplib.app](https://omnichord.amplib.app)

This is a static modern website. There is no build.

The chords come from [@amplib/music-theory](https://amplib.app/music-theory) and
everything you hear comes from
[@amplib/sound-synthesis](https://amplib.app/sound-synthesis) — FM voices for
the pad and the harp, and synthesized drums instead of the loops this used to
carry. Both are pinned in the import map in `index.html`. A browser cannot
resolve a bare specifier on its own, and that map is what lets the no-build part
survive having dependencies.

Make sure silent mode is off on your ios device (red bell on some ipads, switch on the side of some phones/tablets).

the sliding area used to be silent on load sometimes, and refreshing fixed it.
that was the sample loader never resolving, and there are no samples anymore, so
it should be gone — worth an issue if you still hit it.

this app can overwhelm lower weight machines, looking to optimize it sometime soon.

## Configuring it

The `config` button at the bottom opens a panel, and it hides itself while a
chord is held so it is never underfoot mid-play. Voice and rhythm are select
boxes, tempo is a number in bpm you can read and type.

None of that used to be true. Configuration was painted into the same canvas as
the instrument, which meant the chord grid sometimes played a chord and
sometimes switched one off with nothing on screen saying which, and tempo was a
pair of nudge buttons with the number shown nowhere at all.

The one thing still on the canvas is **edit chords**, because it *is* the chord
grid — tap chords there to drop them from the set. A bar across the top says so
while you are in it. It rides the URL hash, so the back button leaves it.

## Voices

Five of them — harp, organ, vibes, guitar, strings. Each sets both the plucked
strip and the held chord under it, so a voice is a whole instrument rather than
two separate sounds. They are all two-operator FM: `ratio` decides whether the
partials land on the harmonic series (pitched) or off it (bell, metal), and
`index` is brightness, pushed higher on the attack than the tail so a hard
setting reads as a pick rather than just a bright tone.

## Rhythms

The drums are patterns now rather than recordings, so some names moved with
them: latin is bossanova, foxtrot is march. Swing has no equivalent —
`DrumMachine` has no swing parameter to build one from. Tempo is real bpm; the
old version scaled sample playback rate, which pitched the whole kit up and down
as it went.

## Running it

Any static server will do:

```bash
python3 -m http.server 8899
```
