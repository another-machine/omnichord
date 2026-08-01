import { Controller, EDIT_HASH } from "./controller.js";
import { chordTypes, roots } from "./chords.js";
import { BPM_MAX, BPM_MIN, RHYTHMS, VOICES } from "./sounds.js";
import { exportImage, openLoadDialog, watchDrops } from "./cartridge.js";
import { HARP_SIDES, LAYOUTS, layoutCells } from "./layout.js";
import {
  CUSTOM_THEME_ID,
  HUE_MAX,
  THEMES,
  colorFor,
  hsvToRgb,
  inkFor,
  neutralFor,
  resolveTheme,
} from "./theme.js";

/**
 * How much of the ink a label keeps, the rest being the cell showing through.
 *
 * This is a look, and it is bought with legibility. Measured over all 1008
 * cell-and-state combinations: at 1 the worst contrast is 4.6:1, at 0.7 it is
 * 3.14:1, and at 0.6 it is 2.64:1 with 35 of them under the 3:1 the WCAG asks
 * of text this size. 0.7 is the lowest that keeps every one of them above it.
 *
 * Left at 0.6 deliberately — the labels are a guide on an instrument you are
 * looking at rather than reading, and the 35 are the mid-lightness cells where
 * neither white nor black has anywhere to go. Raise it if any of them read too
 * faint on a real screen.
 */
const INK_OPACITY = 0.6;

/**
 * The size the save's cover picture is drawn at, long edge and short.
 *
 * A free choice, and it used to be pinned needlessly low at 384 by 224.
 * Stegassette sizes its output from the payload alone and scales whatever
 * cover it is handed to fit, so nothing downstream cares what these are — the
 * saved image comes out the same few dozen pixels across either way.
 *
 * What it buys is where the block edges land. The grid is twelve roots by
 * seven types and every cell is snapped to whole pixels, so at 224 across a
 * column was 18.67 pixels rounded to 18 or 19 — a five percent error baked in
 * before the reduction even starts. At 672 the same column is 56 and the error
 * is under half a percent, so the boundaries the scaler averages across are
 * the ones the layout actually asked for.
 *
 * The ratio is the one that was there, kept because it is the shape the grid
 * is packed into and flex answers to it.
 */
const PORTRAIT_LONG = 1152;
const PORTRAIT_SHORT = 672;

const canvas = document.querySelector("canvas");
const context = canvas.getContext("2d");

const openButton = document.getElementById("menu-open");
const panel = document.getElementById("menu-panel");
const closeButton = document.getElementById("menu-close");
const editActions = document.getElementById("edit-actions");
const editButton = document.getElementById("edit-chords");
const editDone = document.getElementById("edit-done");
const selectAll = document.getElementById("select-all");
const deselectAll = document.getElementById("deselect-all");
const transposeDown = document.getElementById("transpose-down");
const transposeUp = document.getElementById("transpose-up");
const randomSparse = document.getElementById("random-sparse");
const randomDense = document.getElementById("random-dense");
const rhythmToggle = document.getElementById("rhythm-toggle");
const selectPadVoice = document.getElementById("pad-voice");
const selectHarpVoice = document.getElementById("harp-voice");
const selectRhythm = document.getElementById("rhythm");
const inputBpm = document.getElementById("bpm");
// Keyed by the controller setter each one drives, so the wiring below is one
// loop rather than three near-identical handlers.
const levelRanges = {
  setPadLevel: document.getElementById("pad-level"),
  setHarpLevel: document.getElementById("harp-level"),
  setDrumLevel: document.getElementById("drum-level"),
};
const checkFx = document.getElementById("fx");
const checkLabels = document.getElementById("labels");
const selectHarpSide = document.getElementById("harp-side");
const selectLayout = document.getElementById("layout");
const saveButton = document.getElementById("save");
const loadButton = document.getElementById("load");
const selectTheme = document.getElementById("theme");
const themeRanges = {
  hueStart: document.getElementById("hue-start"),
  hueEnd: document.getElementById("hue-end"),
  lightStart: document.getElementById("light-start"),
  lightEnd: document.getElementById("light-end"),
};

const controller = new Controller(canvas, () => updateDom());

const voiceIds = VOICES.map(({ id }) => id);
fillOptions(selectPadVoice, voiceIds);
fillOptions(selectHarpVoice, voiceIds);
fillOptions(selectRhythm, RHYTHMS);
fillOptions(selectTheme, [...THEMES.map(({ id }) => id), CUSTOM_THEME_ID]);
fillOptions(selectLayout, LAYOUTS);
fillOptions(selectHarpSide, HARP_SIDES);
inputBpm.min = BPM_MIN;
inputBpm.max = BPM_MAX;
updateDom();

function fillOptions(select, values) {
  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  });
}

/**
 * Push controller state into the form. Every control reads its value from
 * here rather than tracking its own, so a change made anywhere — a saved
 * setting, a fallback, the rhythm stopping on its own — shows up in the UI
 * without each handler having to remember to update its neighbours.
 */
function updateDom() {
  const editing = controller.mode === "edit";
  selectPadVoice.value = controller._padVoice;
  selectHarpVoice.value = controller._harpVoice;
  selectRhythm.value = controller._rhythm;
  inputBpm.value = controller._bpm;
  checkFx.checked = Boolean(controller._fx);
  checkLabels.checked = Boolean(controller._labels);
  // Stored as multipliers and shown as whole percent, the same way the theme's
  // lightness pair is.
  levelRanges.setPadLevel.value = Math.round(controller._padLevel * 100);
  levelRanges.setHarpLevel.value = Math.round(controller._harpLevel * 100);
  levelRanges.setDrumLevel.value = Math.round(controller._drumLevel * 100);
  selectHarpSide.value = controller._harpSide;
  selectLayout.value = controller._layout;
  selectTheme.value = controller._themeId;
  // The sliders always show the resolved theme, so picking a preset moves them
  // to its numbers rather than leaving them showing something else.
  const theme = controller.theme;
  themeRanges.hueStart.value = Math.round(theme.hueStart);
  themeRanges.hueEnd.value = Math.round(theme.hueEnd);
  themeRanges.lightStart.value = Math.round(theme.lightStart * 100);
  themeRanges.lightEnd.value = Math.round(theme.lightEnd * 100);
  rhythmToggle.textContent = controller.sounds.rhythmOn
    ? "stop rhythm"
    : "start rhythm";
  editActions.hidden = !editing;
  // Editing happens on the canvas, so the panel has to be out of the way for
  // it. Leaving both up would put a chord grid behind a full-screen overlay.
  if (editing) {
    panel.hidden = true;
  }
}

function openPanel() {
  // Opening counts as the first gesture, which is what lets the AudioContext
  // start — so the rhythm button works the very first time it is pressed
  // rather than needing a tap on the instrument first.
  controller.touch.handleAnyEventOccurred();
  panel.hidden = false;
  updateDom();
}

openButton.addEventListener("click", openPanel);
closeButton.addEventListener("click", () => {
  panel.hidden = true;
});

// Edit mode rides the hash, so the back button leaves it and the controller
// picks the change up through its existing hashchange listener.
editButton.addEventListener("click", () => {
  location.hash = EDIT_HASH;
});
editDone.addEventListener("click", () => {
  location.hash = "";
});

// No updateDom here — the grid is canvas, and it repaints from `actives` on
// the next frame anyway.
selectAll.addEventListener("click", () => controller.setAllActive(true));
deselectAll.addEventListener("click", () => controller.setAllActive(false));
transposeDown.addEventListener("click", () => controller.transpose(-1));
transposeUp.addEventListener("click", () => controller.transpose(1));
// Roughly a sixth of the grid versus half of it — enough of a gap that the
// two read as different intentions rather than two rolls of the same dice.
randomSparse.addEventListener("click", () => controller.randomize(0.15));
randomDense.addEventListener("click", () => controller.randomize(0.5));

selectPadVoice.addEventListener("change", () => {
  controller.setPadVoice(selectPadVoice.value);
  updateDom();
});
selectHarpVoice.addEventListener("change", () => {
  controller.setHarpVoice(selectHarpVoice.value);
  updateDom();
});
/**
 * The settings ride inside a picture of the grid that made them.
 *
 * Closing the panel first is only so the export is what you are looking at
 * afterwards — the snapshot never needed it, because the panel is a DOM
 * overlay and was never drawn into the canvas. Nothing waits on a frame here:
 * a hidden or backgrounded tab does not run requestAnimationFrame, and a save
 * that silently produces nothing is far worse than one that captures the
 * frame already on screen.
 */
saveButton.addEventListener("click", () => {
  panel.hidden = true;
  exportImage({ source: configurationPortrait(), params: controller.params() });
});

/**
 * The chord grid as flat blocks, drawn to be the cover image of a save.
 *
 * Not a screenshot. Stegassette resizes whatever it is given down to the size
 * the payload needs — a few dozen pixels across here — with a bilinear scaler,
 * and a screenshot reduced that far is a smear. Flat blocks survive it,
 * because everything inside a block is already one colour and only the seams
 * blend. The size it is drawn at is ours to pick; see PORTRAIT_LONG.
 *
 * It reads from `controller.chords` and colours through `fillForChord`, the
 * same two things the real grid draws from, so the picture carries whichever
 * chords are enabled, in the current theme, laid out the way they are on
 * screen — including a row stretching to fill when reflow has left it short,
 * and gaps where `fixed` is holding a slot open.
 */
function configurationPortrait() {
  const grouped = controller.chords;
  const isLandscape = canvas.width > canvas.height;
  // The picture is drawn to the same proportions as the grid on screen, so
  // flex packs it the way it packed the real thing rather than solving for a
  // different shape and producing a save that does not match what was saved.
  const width = isLandscape ? PORTRAIT_LONG : PORTRAIT_SHORT;
  const height = isLandscape ? PORTRAIT_SHORT : PORTRAIT_LONG;
  const cells = layoutCells({
    grouped,
    layout: controller.layout,
    isLandscape,
    aspect: width / height,
  });

  const out = document.createElement("canvas");
  out.width = width;
  out.height = height;
  const paint = out.getContext("2d");

  // Everything with no chord on it — the gaps `fixed` holds open, and the
  // whole picture when nothing is enabled — takes the dark the app uses
  // behind the grid.
  paint.fillStyle = fillForChord(null, { isDark: true });
  paint.fillRect(0, 0, out.width, out.height);

  // Colour runs all the way to the edge. The frame on a save is the encoder's
  // border ring — see cartridge.js — which keeps whatever cover it lands on,
  // so drawing a margin here would only put a second, redundant one inside it.
  cells.forEach(({ chord, x, y, w, h }) => {
    // Rounded to whole pixels at both edges rather than by width, so
    // neighbours share a boundary and no seam of background shows through.
    const left = Math.round(x * out.width);
    const top = Math.round(y * out.height);
    const right = Math.round((x + w) * out.width);
    const bottom = Math.round((y + h) * out.height);
    paint.fillStyle = fillForChord(chord, {});
    paint.fillRect(left, top, right - left, bottom - top);
  });
  return out;
}
loadButton.addEventListener("click", () => openLoadDialog(applyLoaded));

// Dropping an exported image anywhere works too, which is the desktop path.
watchDrops(applyLoaded);

function applyLoaded(params) {
  if (!params) return;
  controller.apply(params);
  panel.hidden = true;
  updateDom();
}

selectTheme.addEventListener("change", () => {
  controller.setTheme(selectTheme.value);
  updateDom();
});
// `input` rather than `change` here, unlike bpm: dragging a colour range wants
// to be seen while dragging, and unlike a tempo change it costs nothing to
// apply on every step.
Object.entries(themeRanges).forEach(([key, input]) => {
  input.addEventListener("input", () => {
    const raw = Number(input.value);
    controller.setThemeValue(key, key.startsWith("hue") ? raw : raw / 100);
    updateDom();
  });
});

// `input` rather than `change`, like the theme ranges and unlike bpm: a fader
// has to be heard while it is moving, and Sounds ramps each step onto a bus
// that is already in circuit, so applying every one costs nothing.
//
// No updateDom — it would write the slider's own value back to it mid-drag,
// and the only other control these move is each other, which they do not.
Object.entries(levelRanges).forEach(([setter, input]) => {
  input.addEventListener("input", () => {
    controller[setter](Number(input.value) / 100);
  });
});

selectRhythm.addEventListener("change", () => {
  controller.setRhythm(selectRhythm.value);
  updateDom();
});
// `change` rather than `input`: committing on every keystroke means typing
// "120" passes through 1 and 12, and each of those is a real tempo change.
inputBpm.addEventListener("change", () => {
  controller.setBpm(Number(inputBpm.value));
  updateDom();
});
rhythmToggle.addEventListener("click", () => {
  controller.toggleRhythm();
  updateDom();
});
checkFx.addEventListener("change", () => {
  controller.setFlag("fx", checkFx.checked);
  controller.handleFx();
  updateDom();
});
checkLabels.addEventListener("change", () => {
  controller.setFlag("labels", checkLabels.checked);
  updateDom();
});
selectHarpSide.addEventListener("change", () => {
  controller.setHarpSide(selectHarpSide.value);
  updateDom();
});
selectLayout.addEventListener("change", () => {
  controller.setLayout(selectLayout.value);
  updateDom();
});

sizeCanvas();
render();

function render() {
  requestAnimationFrame(render);
  // Hit-testing compares a pointer ratio of the element against area ratios of
  // the buffer, so the two have to stay the same shape — once they diverge,
  // presses land somewhere other than where they look. Checking here rather
  // than trusting the initial call, which can measure before layout settles
  // and which a rem-sized controls lane can invalidate later anyway.
  if (
    canvas.width !== canvas.clientWidth * 2 ||
    canvas.height !== canvas.clientHeight * 2
  ) {
    sizeCanvas();
  }
  const { height, width } = canvas;
  const isLandscape = width > height;
  // "first" puts the harp before the chords in reading order — the left edge
  // in landscape, the top in portrait — and pushes the grid over to make room.
  const harpFirst = controller._harpSide === "first";
  const shapeFromShapes = (shapes) => {
    const shape = isLandscape ? shapes.landscape : shapes.portrait;
    return {
      w: shape.w,
      h: shape.h,
      x: harpFirst ? shape.xFirst : shape.x,
      y: harpFirst ? shape.yFirst : shape.y,
    };
  };
  const chordShape = shapeFromShapes({
    landscape: {
      w: 0.8,
      h: 1,
      x: 0,
      xFirst: 0.2,
      y: 0,
      yFirst: 0,
    },
    portrait: {
      w: 1,
      h: 0.8,
      x: 0,
      xFirst: 0,
      y: 0,
      yFirst: 0.2,
    },
  });
  const harpShape = shapeFromShapes({
    landscape: {
      w: 0.2,
      h: 1,
      x: 0.8,
      xFirst: 0,
      y: 0,
      yFirst: 0,
    },
    portrait: {
      w: 1,
      h: 0.2,
      x: 0,
      xFirst: 0,
      y: 0.8,
      yFirst: 0,
    },
  });

  // Keep the controls off whichever edge the harp is on. Only portrait puts
  // the harp on a horizontal edge; in landscape it is a vertical strip that a
  // centred lane never reaches.
  document.body.classList.toggle("controls-top", !isLandscape && !harpFirst);

  const currentChord =
    controller.currentAreaId && controller.areas[controller.currentAreaId]
      ? controller.areas[controller.currentAreaId].chord
      : null;
  // Always reachable, including mid-chord — the only thing that takes it away
  // is edit mode, whose buttons occupy this exact spot.
  openButton.hidden = controller.mode === "edit";
  // Kept as colour objects rather than strings, because the DOM controls need
  // the h/s/l to pick their ink from. The bright shade used to be the literal
  // "white" when nothing was held; the neutral's own bright shade is near
  // enough to it, and unlike a keyword it can be measured against.
  const brightColor = fillForChord(currentChord, {
    isBright: true,
    object: true,
  });
  const baseColor = fillForChord(currentChord, { object: true });
  const currentFillBright = rgba(brightColor);
  const currentFill = rgba(baseColor);
  const currentFillDark = fillForChord(currentChord, { isDark: true });
  document.body.style.background = currentFillDark;
  publishCurrentColors(baseColor, brightColor);
  context.fillStyle = currentFillDark;
  context.fillRect(0, 0, width, height);

  const { chords } = controller.tick();

  // Positions come from layout.js so the three arrangements stay in one
  // place and the renderer only draws. Aspect is measured in real pixels —
  // the cells live in 0..1 space, where a square is not square on screen.
  const cells = layoutCells({
    grouped: chords,
    layout: controller.layout,
    isLandscape,
    aspect: (chordShape.w * width) / (chordShape.h * height),
  });
  cells.forEach(({ chord, x, y, w, h }) => {
    const highlighted = controller.highlight(chord);
    const area = controller.addArea({
      id: chord.label,
      chord,
      x: chordShape.x + x * chordShape.w,
      y: chordShape.y + y * chordShape.h,
      w: w * chordShape.w,
      h: h * chordShape.h,
    });
    renderRectangle(
      area,
      fillForChord(area.chord, { isBright: highlighted }),
      highlighted
    );
    if (controller._labels) {
      renderChordLabel(
        area,
        fillForChord(area.chord, { isBright: highlighted, object: true }),
        highlighted
      );
    }
  });
  controller.addArea({ id: "stepper", ...harpShape });
  if (currentChord) {
    let size =
      (isLandscape ? harpShape.h : harpShape.w) / currentChord.stepper.length;
    const activeIndex =
      currentChord.stepper.length - 1 - controller.currentStepIdx;
    // Declared here rather than reused from the chord loop above. They used to
    // be that loop's cursor, which layout.js took over — leaving these two
    // assigning to nothing, and a module is strict, so it threw. The throw
    // landed before controller.process, so a held chord stopped the harp
    // drawing and stopped pointers being read at all.
    let relX = harpShape.x;
    let relY = harpShape.y;
    const relW = isLandscape ? harpShape.w : size;
    const relH = isLandscape ? size : harpShape.h;
    currentChord.stepper.forEach((_, i) => {
      const shape = { x: relX, y: relY, w: relW, h: relH };
      const curr = i === activeIndex;
      renderRectangle(shape, curr ? currentFillBright : currentFill, curr);
      if (isLandscape) {
        relY += size;
      } else {
        relX += size;
      }
    });
  } else {
    renderRectangle(harpShape, currentFill);
  }
  const { X_RAT, Y_RAT } = controller.touch.dimensions();
  const { x, y, w, h } = controller.touch.relateArea(harpShape);
  document.body.style.setProperty("--harp-height", h * 100 + "%");
  document.body.style.setProperty("--harp-width", w * 100 + "%");
  document.body.style.setProperty("--harp-left", x * 100 + "%");
  document.body.style.setProperty("--harp-top", y * 100 + "%");
  document.body.style.setProperty("--gutter-width", X_RAT * 100 + "%");
  document.body.style.setProperty("--gutter-height", Y_RAT * 100 + "%");

  controller.process(harpShape);
}

// A declaration rather than a const arrow, like everything else render()
// reaches for: render is called during module evaluation, above this point,
// and a const would still be in its dead zone when the first frame draws.
function rgba({ r, g, b }, a = 1) {
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/**
 * Hand the held chord's colour to CSS, for the controls that are DOM.
 *
 * The lane buttons were the last thing on screen that was not themed: a black
 * plate with white lettering sitting under a grid that changes colour with
 * every press. They now take the chord's own fill, and their ink from the same
 * `inkFor` the grid labels use — so the pair stays legible from the darkest
 * forest cell to the brightest ember one, rather than being fixed contrast
 * against a moving background.
 *
 * The fill is a step lighter than the page behind it, which is the same colour
 * through `isDark`, and that step is the only edge these buttons have — they
 * carry no border, the same way a chord cell carries none. The bright pair is
 * for `done`, the inverted button.
 */
function publishCurrentColors(base, bright) {
  const style = document.body.style;
  style.setProperty("--current-fill", rgba(base));
  style.setProperty("--current-ink", rgba(inkFor(base)));
  style.setProperty("--current-fill-bright", rgba(bright));
  style.setProperty("--current-ink-bright", rgba(inkFor(bright)));
}

function renderChordLabel(
  { id: text, x: relX, y: relY, w: relW, h: relH },
  // Renamed on the way in: this function already has its own h and w for the
  // cell's measured height and width.
  { h: cellHue, s: cellSaturation, l: cellLightness },
  highlighted,
  italic,
  maxFontSize = Infinity
) {
  const { W, H, X, Y } = controller.touch.dimensions();
  const w = relW * W;
  const h = relH * H;
  const x = w * 0.5 + relX * W + X;
  const y = h * 0.5 + relY * H + Y;
  const fontSize = Math.min(maxFontSize, Math.round(Math.min(w, h) * 0.25));
  // Ink picked against the cell this sits on, rather than the cell's own
  // colour plus an offset shadow faking an edge. There is no shadow now: the
  // contrast is in the colour, so nothing depends on how a browser renders a
  // one-pixel blur — which is what looked wrong in Safari.
  const ink = inkFor({
    h: cellHue,
    s: cellSaturation,
    l: cellLightness,
  });
  // Slightly transparent so the ink settles back into the cell rather than
  // sitting on top of it. The tint budget in theme.js accounts for the
  // contrast this costs.
  context.fillStyle = `rgba(${ink.r}, ${ink.g}, ${ink.b}, ${INK_OPACITY})`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.save();
  context.translate(x, y);
  context.font = `${
    italic ? "italic" : ""
  } 600 ${fontSize}px "Andale Mono", "Trebuchet MS", "Lucida Sans Unicode", monospace`;
  context.fillText(text, 0, 0);
  context.restore();
}

/**
 * Colour for a chord, from its position in the grid rather than from a table.
 *
 * Hue runs across the roots and lightness down the chord types, so the two
 * ranges a theme carries land exactly on the two axes the grid already has.
 * Roots divide by 12 rather than by 11 so that the twelfth lands one step
 * short of the start — with a full 0–360 hue range that keeps the wrap
 * continuous instead of repeating red at both ends.
 */
function fillForChord(chord, { isBright, isDark, object } = {}) {
  const theme = resolveTheme({
    id: controller._themeId,
    custom: controller._themeCustom,
  });
  const { h, s, l } = chord
    ? colorFor({
        theme,
        hueT: roots.indexOf(chord.notation) / roots.length,
        lightT:
          chordTypes.length > 1
            ? chordTypes.indexOf(chord.type) / (chordTypes.length - 1)
            : 0,
        isBright,
        isDark,
      })
    : neutralFor({ theme, isBright, isDark });
  const a = 1;
  const rgb = hsvToRgb(h, s, l);
  return object
    ? { ...rgb, h, s, l, a }
    : `rgb(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a})`;
}

function renderRectangle({ w, h, x, y }, fill, glow) {
  const { gutter, X, Y, W, H } = controller.touch.dimensions();
  w = w * W - gutter * 2;
  h = h * H - gutter * 2;
  x = x * W + gutter + X;
  y = y * H + gutter + Y;
  context.save();
  if (glow) {
    context.shadowColor = fill;
    context.shadowBlur = gutter;
  }
  context.fillStyle = fill;
  context.fillRect(x, y, w, h);
  context.restore();
}

let debounced;
window.addEventListener("resize", () => {
  document.body.classList.add("resizing");
  if (debounced) {
    clearTimeout(debounced);
  }
  debounced = setTimeout(sizeCanvas, 250);
});

function sizeCanvas() {
  // Measured from the canvas, not the window: it no longer fills the viewport
  // now that the controls have a reserved lane below it, and sizing the buffer
  // to the window would stretch everything drawn into it.
  canvas.height = canvas.clientHeight * 2;
  canvas.width = canvas.clientWidth * 2;
  document.body.classList.remove("resizing");
}
