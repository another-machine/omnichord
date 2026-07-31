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
 * Encode settings into a picture of the configuration and put it on screen.
 *
 * `source` is drawn by the caller from the chord grid rather than grabbed off
 * the live canvas. Stegassette sizes its output from the payload alone — a
 * couple of kilobytes lands around forty pixels across — so a screenshot would
 * be resampled down to an unreadable smear whatever resolution it started at.
 * A source authored as flat blocks survives that reduction, because the
 * scaler is bilinear and block interiors are all one colour.
 *
 * An <img> rather than the canvas itself, because mobile browsers only offer
 * "Save to Photos" on a long press when the element is an image. Tapping it
 * dismisses.
 */
export function exportImage({ source, params }) {
  const encoded = Stegassette.encode({
    source,
    // Without this the source is cover-cropped to whatever aspect the payload
    // implies, which would cut chords off the edge of the picture.
    aspectRatio: source.width / source.height,
    // Payload into the blue channel only, instead of the default packed plan
    // that fills all three. Red and green then keep the cover, so the picture
    // still reads as the chord grid rather than as noise — measured at roughly
    // half the drift from the source, consistently across warm and cool
    // themes. It also costs three times the pixels, which is a second gain
    // here: the image is bigger, and it was uncomfortably small before.
    channels: "b",
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
