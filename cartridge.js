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
const SAVE_FILENAME = "omnichord.png";

/**
 * The frame around a save, in pixels of the encoded image.
 *
 * Not drawn by us. Stegassette always leaves a border ring — it puts the STGC
 * header in the ring's alpha and writes the payload only inside it — so the
 * ring is the one part of the picture carrying the cover and nothing else.
 * Widening it turns a format detail into the frame: the chords keep running
 * to the edge, and the outermost band of them comes out clean while the
 * interior wears the payload's speckle.
 *
 * The default is 0, which resolves to a single pixel. The library reads a
 * whole number as ring width directly and grows the image to keep room for
 * the payload inside it, so the picture gets bigger rather than the grid
 * getting smaller — the blocks are only a few pixels each after the
 * reduction and could not have paid for this.
 */
const SAVE_BORDER = 2;

const pick = (values) => values[Math.floor(Math.random() * values.length)];

/**
 * Every way a payload can be laid across the colour channels: each non-empty
 * subset of r/g/b, in each order — "b", "rg", "gr", "bgr", fifteen in all.
 *
 * Order is not cosmetic. The slots are consumed in the order given, so "rg"
 * and "gr" put different bytes in different channels and the speckle takes a
 * different cast.
 *
 * Length is not cosmetic either. A plan carries one payload byte per channel
 * per pixel, so three channels need a third of the interior one channel does,
 * and every channel named is a channel that no longer keeps the cover. What
 * that costs the picture is smaller than the arithmetic suggests, because the
 * border ring is fixed overhead on all four sides: measured on a real save,
 * one channel gives 44x75 and three gives 32x54. So the whole range stays
 * legible as a chord grid, and the difference reads as texture rather than as
 * damage — which is what makes rolling it reasonable at all.
 *
 * Generated from the package's own channel names rather than written out, so
 * the list cannot drift from what the library accepts.
 */
function channelPlans(names) {
  const plans = [];
  const walk = (chosen, rest) => {
    if (chosen.length) plans.push(chosen.join(""));
    rest.forEach((name, i) =>
      walk([...chosen, name], rest.filter((_, j) => j !== i))
    );
  };
  walk([], names);
  return plans;
}

const CHANNEL_PLANS = channelPlans(Stegassette.CHANNEL_NAMES);

/**
 * The weave, rolled fresh for every save.
 *
 * Four independent choices — which channels carry the payload and in what
 * order, how a byte is mixed with its key pixel, which pixel that is, and the
 * order the payload walks the interior in — and every one of them is visible.
 * The speckle stops being one texture the app always makes and becomes a
 * different pattern every time: a spiral, a Hilbert curve, a Bayer dither, in
 * blue or in every colour at once. Two saves of the same instrument no longer
 * look alike.
 *
 * Free to randomize because nothing has to remember the roll. The STGC header
 * in the border ring records the channel plan, the combine, the keymap, the
 * traversal and any params it generated, and `decode` reads all of it back out
 * of the picture — which is the same reason a save needs no sidecar in the
 * first place.
 *
 * The names come from the package rather than being listed here, so a version
 * that adds a traversal starts producing it without this file changing.
 *
 * Two exclusions, both of which would otherwise be real bugs:
 *
 * `LOSSLESS_COMBINES` rather than every combine. "noise" and "difference" do
 * not invert exactly, and a settings image that cannot be read back is not a
 * save at all.
 *
 * Every keymap but the keyless one. "none" has no key pixel, so the combines
 * that rewrite it throw — it would take most of the combine list with it, for
 * a pattern no more interesting than the six that remain.
 *
 * What is left is not quite all good, which is why `encodeVerified` exists.
 */
function randomPattern() {
  const { KEYLESS_KEYMAPS, KEYMAP_NAMES, LOSSLESS_COMBINES, TRAVERSAL_NAMES } =
    Stegassette;
  return {
    channels: pick(CHANNEL_PLANS),
    combine: pick(LOSSLESS_COMBINES),
    keymap: pick(KEYMAP_NAMES.filter((name) => !KEYLESS_KEYMAPS.has(name))),
    traversal: pick(TRAVERSAL_NAMES),
  };
}

/**
 * The pattern this app used before any of them were rolled, and the one it
 * falls back to: Stegassette's own defaults over the blue channel alone.
 *
 * Blue on its own is what the app shipped with, and it is the kindest of the
 * fifteen plans to the picture — red and green keep the cover untouched, which
 * measured at roughly half the drift from the source across warm and cool
 * themes alike, and one byte per pixel gives the largest image of the fifteen.
 * A fallback should be the safe-looking one.
 */
const SAFE_PATTERN = {
  channels: "b",
  combine: "xor",
  keymap: "adjacent",
  traversal: "raster",
};

/** Rolls to try before settling for the pattern known to work. */
const PATTERN_ATTEMPTS = 3;

/**
 * Encode, and prove the picture reads back before anyone is offered it.
 *
 * Not paranoia. Sweeping all 486 combinations of the pool above against a real
 * payload, 27 of them come back wrong — every one of them keymap "rotate"
 * paired with a combine that masks the key pixel ("veil", "whisper",
 * "midpoint"). Rolled blind that is a save in twenty that cannot be loaded,
 * and there is no way to find out except by trying to load it, by which point
 * the settings it was carrying are gone.
 *
 * Verifying rather than blacklisting "rotate": the check costs one decode of
 * an image a few thousand pixels across, it needs no list to be kept in step
 * with the package, and it holds for whatever a future version adds. A save
 * that leaves here is one that has already been read back.
 */
function encodeVerified(base, data) {
  for (let attempt = 0; attempt <= PATTERN_ATTEMPTS; attempt++) {
    // The last go round drops the dice — a plain save beats a pretty failure.
    const pattern = attempt < PATTERN_ATTEMPTS ? randomPattern() : SAFE_PATTERN;
    const canvas = Stegassette.encode({ ...base, ...pattern });
    if (decodeSettings(canvas) === data) return canvas;
  }
  // Reached only if the known-good pattern also fails, which would mean
  // something is wrong well upstream of the dice. Hand it over regardless:
  // the picture is still the grid, and load already tolerates one it cannot
  // read.
  return Stegassette.encode({ ...base, ...SAFE_PATTERN });
}

/**
 * The settings entry of an encoded image, as the text that went in. Shared by
 * the verifier and by `readImage`, so the thing a save is checked against is
 * the thing a load will actually go looking for.
 */
function decodeSettings(source) {
  const { entries } = Stegassette.decode({ source });
  const entry =
    entries.find((item) => item.mimetype === SETTINGS_MIMETYPE) || entries[0];
  return entry ? new TextDecoder().decode(entry.data) : null;
}

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
 *
 * The download link beside it is for the desktop, where Safari's context menu
 * on a canvas-derived image offers no save at all. It is a sibling rather
 * than a wrapper around the image on purpose: a long press on an <img> inside
 * an <a> gets the link's menu, which would trade the working mobile path for
 * the broken desktop one.
 *
 * Shuffle re-encodes the same settings on a fresh roll of the weave. The
 * payload never changes and neither does the cover — only the pattern the one
 * is written into the other with — so it is purely a matter of which picture
 * you would rather keep. Every one of them loads back to the same instrument.
 */
export function exportImage({ source, params }) {
  const data = JSON.stringify(params);
  const base = {
    source,
    // Without this the source is cover-cropped to whatever aspect the
    // payload implies, which would cut chords off the edge of the picture.
    aspectRatio: source.width / source.height,
    border: SAVE_BORDER,
    // No `channels` here — the plan is part of the weave now and arrives with
    // the rest of the roll. It used to be pinned to blue, for reasons that are
    // still true and are recorded on SAFE_PATTERN; what changed is that they
    // are now one option among fifteen rather than the only one.
    entries: [{ mimetype: SETTINGS_MIMETYPE, name: SETTINGS_NAME, data }],
  };

  const wrapper = document.createElement("div");
  wrapper.id = "export-overlay";
  const image = document.createElement("img");
  image.alt = "omnichord settings";

  const download = document.createElement("a");
  download.textContent = "download";
  download.download = SAVE_FILENAME;
  // Downloading is not dismissing. Without this the click reaches the wrapper
  // and the picture disappears out from under a save you might want to repeat
  // — or long-press instead, if the download went somewhere you did not want.
  download.addEventListener("click", (event) => event.stopPropagation());

  const shuffle = document.createElement("button");
  shuffle.type = "button";
  shuffle.textContent = "shuffle";

  let objectUrl = null;
  const releaseUrl = () => {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  };

  /**
   * Encode, and hang the result on both the picture and the link.
   *
   * The link waits for a blob while the picture does not, so between the two
   * there is a moment with a new image above a stale href. The old URL is
   * dropped and the attribute removed at the top rather than swapped at the
   * bottom, so that moment offers no download at all instead of quietly
   * handing over the previous weave.
   *
   * `weave` counts because toBlob is asynchronous and shuffle is a button
   * someone can lean on: without the check, two rolls in flight can land out
   * of order and leave the link pointing at a picture that is no longer on
   * screen. A superseded callback never creates its URL, so nothing leaks.
   */
  let weaves = 0;
  const weave = () => {
    const id = ++weaves;
    const encoded = encodeVerified(base, data);
    image.src = encoded.toDataURL("image/png");
    releaseUrl();
    // An anchor with no href has no default action, so a click in the gap does
    // nothing — where href="" would have navigated, reloading the page and
    // taking the settings with it.
    //
    // A blob and not the data URL the <img> already holds: Safari ignores the
    // download attribute on a data: URL and navigates to it instead, which is
    // the whole reason this link is here.
    download.removeAttribute("href");
    encoded.toBlob((blob) => {
      if (!blob || id !== weaves) return;
      objectUrl = URL.createObjectURL(blob);
      download.href = objectUrl;
    }, "image/png");
  };
  shuffle.addEventListener("click", (event) => {
    event.stopPropagation();
    weave();
  });
  weave();

  const actions = document.createElement("div");
  actions.className = "actions";
  actions.append(download, shuffle);

  const hint = document.createElement("p");
  hint.textContent = "press and hold to save · tap to dismiss";
  wrapper.append(image, actions, hint);
  wrapper.addEventListener("click", () => {
    releaseUrl();
    wrapper.remove();
  });
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
    const text = decodeSettings(image);
    return text === null ? null : JSON.parse(text);
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
