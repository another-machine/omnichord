import { Stegassette, createDropReader } from "@amplib/steganography";

/**
 * Saving and loading through an image.
 *
 * The settings ride inside a picture of the instrument that produced them, so
 * a save is one PNG with nothing alongside it — Stegassette is self-keying, so
 * the cover image is also its own key and there is no sidecar to lose. Sharing
 * the picture shares the setup.
 *
 * Mimetype and shape follow modulo, which does the same thing.
 */
const SETTINGS_MIMETYPE = "text/json";
const SETTINGS_NAME = "omnichord.json";

/**
 * Longest edge of the exported image.
 *
 * The live canvas is drawn at twice CSS pixels, which makes a PNG of several
 * megabytes — unpleasant to save and slow to hand around. Capacity is not the
 * constraint: a packed channel plan carries three bytes a pixel, so even this
 * reduced size holds hundreds of times the couple of kilobytes of settings.
 */
const EXPORT_MAX_EDGE = 1200;

/** Draw the live canvas down to something worth saving. */
function snapshot(canvas) {
  const scale = Math.min(1, EXPORT_MAX_EDGE / Math.max(canvas.width, canvas.height));
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(canvas.width * scale));
  out.height = Math.max(1, Math.round(canvas.height * scale));
  const context = out.getContext("2d");
  context.drawImage(canvas, 0, 0, out.width, out.height);
  return out;
}

/**
 * Encode settings into a snapshot and put it on screen to be saved.
 *
 * An <img> rather than the canvas itself, because mobile browsers only offer
 * "Save to Photos" on a long press when the element is an image. Tapping it
 * dismisses.
 */
export function exportImage({ canvas, params }) {
  const encoded = Stegassette.encode({
    source: snapshot(canvas),
    entries: [
      {
        mimetype: SETTINGS_MIMETYPE,
        name: SETTINGS_NAME,
        data: JSON.stringify(params),
      },
    ],
  });

  const wrapper = document.createElement("div");
  wrapper.id = "export-overlay";
  const image = document.createElement("img");
  image.src = encoded.toDataURL("image/png");
  image.alt = "omnichord settings";
  const hint = document.createElement("p");
  hint.textContent = "press and hold to save · tap to dismiss";
  wrapper.append(image, hint);
  wrapper.addEventListener("click", () => wrapper.remove());
  document.body.appendChild(wrapper);
  return wrapper;
}

/**
 * Pull settings back out of an image. Returns null rather than throwing — a
 * dropped file is as likely to be an ordinary picture as one of ours, and that
 * is not an error worth breaking on.
 */
export function readImage(image) {
  try {
    const { entries } = Stegassette.decode({ source: image });
    const entry =
      entries.find((item) => item.mimetype === SETTINGS_MIMETYPE) || entries[0];
    if (!entry) return null;
    return JSON.parse(new TextDecoder().decode(entry.data));
  } catch (e) {
    return null;
  }
}

/**
 * File-picker path. Needed alongside the drop reader because on a phone this
 * opens the photo library, which nothing can be dragged out of.
 */
export function openLoadDialog(onParams) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.style.display = "none";
  input.addEventListener("change", () => {
    const file = input.files && input.files[0];
    input.remove();
    if (!file) return;
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.addEventListener("load", () => {
      URL.revokeObjectURL(url);
      onParams(readImage(image));
    });
    image.addEventListener("error", () => {
      URL.revokeObjectURL(url);
      onParams(null);
    });
    image.src = url;
  });
  document.body.appendChild(input);
  input.click();
}

/** Drag an exported image anywhere onto the page to load it. */
export function watchDrops(onParams) {
  createDropReader({
    element: document.body,
    onFailure: () => onParams(null),
    onSuccess: ({ imageElements }) => {
      if (imageElements[0]) onParams(readImage(imageElements[0]));
    },
  });
}
