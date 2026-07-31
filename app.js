import { Controller, EDIT_HASH } from "./controller.js";
import { chordTypes, roots } from "./chords.js";
import { BPM_MAX, BPM_MIN, RHYTHMS, VOICES } from "./sounds.js";
import {
  CUSTOM_THEME_ID,
  HUE_MAX,
  THEMES,
  colorFor,
  neutralFor,
  resolveTheme,
} from "./theme.js";

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
const checkFx = document.getElementById("fx");
const checkLabels = document.getElementById("labels");
const checkInvert = document.getElementById("invert");
const checkFixed = document.getElementById("fixed");
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
  checkInvert.checked = Boolean(controller._invert);
  checkFixed.checked = Boolean(controller._fixed);
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
  controller.toggle("fx");
  controller.handleFx();
  updateDom();
});
checkLabels.addEventListener("change", () => {
  controller.toggle("labels");
  updateDom();
});
checkInvert.addEventListener("change", () => {
  controller.toggle("invert");
  updateDom();
});
checkFixed.addEventListener("change", () => {
  controller.toggle("fixed");
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
  const isInvert = controller._invert;
  const shapeFromShapes = (shapes) => {
    const shape = isLandscape ? shapes.landscape : shapes.portrait;
    return {
      w: shape.w,
      h: shape.h,
      x: isInvert ? shape.xInvert : shape.x,
      y: isInvert ? shape.yInvert : shape.y,
    };
  };
  const chordShape = shapeFromShapes({
    landscape: {
      w: 0.8,
      h: 1,
      x: 0,
      xInvert: 0.2,
      y: 0,
      yInvert: 0,
    },
    portrait: {
      w: 1,
      h: 0.8,
      x: 0,
      xInvert: 0,
      y: 0,
      yInvert: 0.2,
    },
  });
  const harpShape = shapeFromShapes({
    landscape: {
      w: 0.2,
      h: 1,
      x: 0.8,
      xInvert: 0,
      y: 0,
      yInvert: 0,
    },
    portrait: {
      w: 1,
      h: 0.2,
      x: 0,
      xInvert: 0,
      y: 0.8,
      yInvert: 0,
    },
  });

  // Keep the controls off whichever edge the harp is on. Only portrait puts
  // the harp on a horizontal edge; in landscape it is a vertical strip that a
  // centred lane never reaches.
  document.body.classList.toggle("controls-top", !isLandscape && !isInvert);

  const currentChord =
    controller.currentAreaId && controller.areas[controller.currentAreaId]
      ? controller.areas[controller.currentAreaId].chord
      : null;
  // Always reachable, including mid-chord — the only thing that takes it away
  // is edit mode, whose buttons occupy this exact spot.
  openButton.hidden = controller.mode === "edit";
  const currentFillBright = currentChord
    ? fillForChord(currentChord, { isBright: true })
    : "white";
  const currentFill = fillForChord(currentChord, {});
  const currentFillDark = fillForChord(currentChord, { isDark: true });
  document.body.style.background = currentFillDark;
  context.fillStyle = currentFillDark;
  context.fillRect(0, 0, width, height);

  const { chords } = controller.tick();

  const chordTypes = Object.keys(chords);
  const chordTypesCount = chordTypes.length;
  let relY = chordShape.y;
  let relX = chordShape.x;
  chordTypes.forEach((type) => {
    const chordForType = chords[type];
    const chordCount = chordForType.length;

    let size = (isLandscape ? chordShape.w : chordShape.h) / chordCount;
    const relW = isLandscape ? size : chordShape.w / chordTypesCount;
    const relH = isLandscape ? chordShape.h / chordTypesCount : size;
    chordForType.forEach((chord) => {
      // chord is null in fixed view
      if (chord) {
        const highlighted = controller.highlight(chord);
        const area = controller.addArea({
          id: chord.label,
          chord,
          x: relX,
          y: relY,
          w: relW,
          h: relH,
        });
        renderRectangle(
          area,
          fillForChord(area.chord, { isBright: highlighted }),
          highlighted
        );
        if (controller._labels) {
          renderChordLabel(
            area,
            fillForChord(area.chord, {
              isBright: highlighted,
              object: true,
            }),
            highlighted
          );
        }
      }

      if (isLandscape) {
        relX += size;
      } else {
        relY += size;
      }
    });
    if (isLandscape) {
      relY += relH;
      relX = chordShape.x;
    } else {
      relX += relW;
      relY = chordShape.y;
    }
  });
  controller.addArea({ id: "stepper", ...harpShape });
  if (currentChord) {
    let size =
      (isLandscape ? harpShape.h : harpShape.w) / currentChord.stepper.length;
    const activeIndex =
      currentChord.stepper.length - 1 - controller.currentStepIdx;
    relX = harpShape.x;
    relY = harpShape.y;
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

  if (!controller.touch.initialized && controller.mode !== "edit") {
    const { r, g, b } = fillForChord(currentChord, {
      isDark: true,
      object: true,
    });
    renderRectangle(chordShape, `rgba(${r}, ${g}, ${b},0.8)`);
    const fontSize = Math.max(
      30,
      Math.round(Math.min(canvas.width, canvas.height) * 0.02)
    );
    context.fillStyle = "rgba(255, 255, 255, 0.95)";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.save();
    context.translate(
      chordShape.x + chordShape.w * 0.5 * canvas.width,
      chordShape.y + chordShape.h * 0.5 * canvas.height
    );
    context.font = `italic 600 ${fontSize}px "Andale Mono", "Trebuchet MS", "Lucida Sans Unicode", monospace`;
    const message =
      controller.sounds.loaded === undefined
        ? "tap anywhere to start"
        : "loading...";
    context.fillText(message, 0, 0);
    context.restore();
  }
}

function renderChordLabel(
  { id: text, x: relX, y: relY, w: relW, h: relH },
  { r, g, b },
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
  context.fillStyle = highlighted
    ? "rgba(255, 255, 255, 0.95)"
    : `rgba(${r}, ${g}, ${b}, 0.7)`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.save();
  context.translate(x, y);
  context.shadowColor = highlighted
    ? "rgba(255, 255, 255, 0.4)"
    : "rgba(0, 0, 0, 0.4)";
  context.shadowBlur = 1;
  context.shadowOffsetX = context.shadowOffsetY =
    fontSize * 0.05 * (highlighted ? -1 : 1);
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

function hsvToRgb(h, s, v) {
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
  r = Math.round((r + m) * 255.0);
  g = Math.round((g + m) * 255.0);
  b = Math.round((b + m) * 255.0);
  return { r, g, b };
}
