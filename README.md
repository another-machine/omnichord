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

The `menu` button opens a panel. It sits in a reserved lane — at the bottom in
landscape, at the top in portrait, where the harp runs along the bottom edge and
a swiping thumb would otherwise land on it. Voice and rhythm are select
boxes, tempo is a number in bpm you can read and type.

None of that used to be true. Configuration was painted into the same canvas as
the instrument, which meant the chord grid sometimes played a chord and
sometimes switched one off with nothing on screen saying which, and tempo was a
pair of nudge buttons with the number shown nowhere at all.

The one thing still on the canvas is **edit chords**, because it *is* the chord
grid — tap chords there to drop them from the set. A bar across the top says so
while you are in it. It rides the URL hash, so the back button leaves it.

## Layout

Three arrangements, on the `layout` select. The difference between them is what
happens to the space a disabled chord leaves behind.

**fixed** keeps the slot open, so a chord never moves and muscle memory holds.
**fill** drops the slot and lets its row stretch, which gives big targets at the
cost of everything shifting whenever anything else is switched off. **flex**
abandons the by-type rows entirely and repacks whatever is enabled into the grid
closest to square for the space available, so nine chords become a 3x3 rather
than seven ragged rows — and it re-solves on rotation, so the shape follows the
screen.

Flex reproduces the original grid when everything is enabled: 84 chords in a
landscape window come out 12 across and 7 down, which is exactly the by-type
layout, and 7 by 12 in portrait.

## Themes

Colour comes from position in the grid, not from a palette: hue runs across the
twelve roots, lightness down the seven chord types. A theme is therefore two
ranges rather than a list of colours, so `rainbow` is simply the full hue circle
at a flat lightness. Six presets, and moving any of the four sliders makes it
custom.

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
