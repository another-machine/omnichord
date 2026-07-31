/**
 * Colour for the chord grid.
 *
 * The grid is already a two-axis layout — twelve roots across, seven chord
 * types down — so the theme maps one axis to hue and the other to lightness.
 * A theme is therefore two ranges rather than a palette, and every chord gets
 * its colour from position rather than from a lookup. Adding a chord type or
 * a root needs no new colours.
 *
 * `rainbow` is the original scheme: the whole hue circle across the roots at a
 * single lightness. Narrowing the hue range is what makes the others read as
 * tinted rather than chromatic.
 */
export const THEMES = [
  { id: "rainbow", hueStart: 0, hueEnd: 360, lightStart: 0.3, lightEnd: 0.3 },
  { id: "sunset", hueStart: 350, hueEnd: 60, lightStart: 0.22, lightEnd: 0.42 },
  { id: "ocean", hueStart: 160, hueEnd: 260, lightStart: 0.18, lightEnd: 0.4 },
  { id: "forest", hueStart: 70, hueEnd: 170, lightStart: 0.16, lightEnd: 0.38 },
  { id: "ember", hueStart: 0, hueEnd: 45, lightStart: 0.2, lightEnd: 0.45 },
  { id: "violet", hueStart: 250, hueEnd: 330, lightStart: 0.2, lightEnd: 0.44 },
];

export const CUSTOM_THEME_ID = "custom";
export const HUE_MAX = 360;

/** Saturation is not themed — a grey theme is just a flat lightness range. */
const SATURATION = 0.85;
/** Held chords ignore the lightness range: they have to read as lit. */
const BRIGHT_LIGHT = 0.95;
/** The page background, taken from the currently held chord. */
const DARK_FACTOR = 0.65;

export function themeById(id) {
  return THEMES.find((theme) => theme.id === id);
}

/**
 * A theme's four numbers, whether they came from a preset or the sliders.
 * An unknown id resolves to rainbow rather than throwing, so a saved theme
 * that no longer exists degrades to the default.
 */
export function resolveTheme({ id, custom }) {
  if (id === CUSTOM_THEME_ID && custom) return custom;
  return themeById(id) || THEMES[0];
}

const lerp = (from, to, t) => from + (to - from) * t;

/**
 * Colour for one cell. `hueT` and `lightT` are 0..1 positions along each axis.
 *
 * Hue is taken modulo 360 after interpolating, so a range that crosses the top
 * of the circle — 350 to 60, for a sunset — walks forward through red rather
 * than backwards through the entire spectrum.
 */
export function colorFor({ theme, hueT, lightT, isBright, isDark }) {
  const hue = ((lerp(theme.hueStart, theme.hueEnd, hueT) % 360) + 360) % 360;
  const base = lerp(theme.lightStart, theme.lightEnd, lightT);
  const light = isBright ? BRIGHT_LIGHT : isDark ? base * DARK_FACTOR : base;
  return { h: hue, s: SATURATION, l: light };
}

/** The neutral used when nothing is held. Themed only through its lightness. */
export function neutralFor({ theme, isBright, isDark }) {
  const base = lerp(theme.lightStart, theme.lightEnd, 0.5) * 0.7;
  const light = isBright ? BRIGHT_LIGHT : isDark ? base * DARK_FACTOR : base;
  return { h: 0, s: 0, l: light };
}
