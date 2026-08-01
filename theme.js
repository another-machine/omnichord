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

/**
 * Ink for a label sitting on a given cell.
 *
 * The labels used to be painted in the cell's own colour and made legible by a
 * one-pixel offset shadow — an emboss. That leans entirely on how a browser
 * renders a sub-pixel shadow, which Safari does differently, and even where it
 * renders well the contrast is near zero because the text and its background
 * are the same colour.
 *
 * This picks real ink instead: near-white or near-black, whichever contrasts
 * better with the cell, tinted with the cell's own hue so the palette still
 * reads. Chosen by measured luminance rather than by the theme's lightness
 * value, because hue changes how bright a colour looks — yellow at 0.3 is far
 * brighter than blue at 0.3, and a threshold on the number alone flips to the
 * wrong ink across a rainbow.
 */
export function inkFor({ h, s, l }) {
  const cell = hsvToRgb(h, s, l);
  const light = hsvToRgb(h, LIGHT_INK_TINT, 1);
  const dark = hsvToRgb(h, 0, 0);
  return contrastRatio(cell, light) >= contrastRatio(cell, dark) ? light : dark;
}

/**
 * How much of the cell's hue the light ink carries: none.
 *
 * It used to carry a little, so the labels kept some of the palette. That is
 * now done better by the alpha the label is drawn at — compositing the ink
 * over the cell mixes the cell's own colour in, which is the same effect
 * arrived at from the right direction.
 *
 * Doing both is what it cannot afford. Tint and alpha spend the same budget,
 * because each moves the ink nearer to what it sits on, and measured across
 * all 1008 combinations the pair together drops the worst case to 3.97:1.
 * Alpha alone holds it at 4.34:1.
 *
 * The dark ink is plain black for the same reason, and always was: giving it
 * any lightness to carry a tint puts a dark ink on a dark cell of its own hue,
 * which is not far enough away.
 */
const LIGHT_INK_TINT = 0;

/** WCAG relative luminance. */
function relativeLuminance({ r, g, b }) {
  const channel = (value) => {
    const v = value / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
  );
}

/** WCAG contrast ratio, 1 (identical) to 21 (black on white). */
export function contrastRatio(a, b) {
  const one = relativeLuminance(a);
  const two = relativeLuminance(b);
  const hi = Math.max(one, two);
  const lo = Math.min(one, two);
  return (hi + 0.05) / (lo + 0.05);
}

export function hsvToRgb(h, s, v) {
  const C = v * s;
  const hh = h / 60.0;
  const X = C * (1.0 - Math.abs((hh % 2) - 1.0));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hh >= 0 && hh < 1) {
    r = C;
    g = X;
  } else if (hh >= 1 && hh < 2) {
    r = X;
    g = C;
  } else if (hh >= 2 && hh < 3) {
    g = C;
    b = X;
  } else if (hh >= 3 && hh < 4) {
    g = X;
    b = C;
  } else if (hh >= 4 && hh < 5) {
    r = X;
    b = C;
  } else {
    r = C;
    b = X;
  }
  const m = v - C;
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

/** The neutral used when nothing is held. Themed only through its lightness. */
export function neutralFor({ theme, isBright, isDark }) {
  const base = lerp(theme.lightStart, theme.lightEnd, 0.5) * 0.7;
  const light = isBright ? BRIGHT_LIGHT : isDark ? base * DARK_FACTOR : base;
  return { h: 0, s: 0, l: light };
}
