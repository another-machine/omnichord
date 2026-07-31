/**
 * Where each chord sits in the grid.
 *
 * Three arrangements, and the difference between them is what happens to the
 * space a disabled chord leaves behind:
 *
 *   fixed  keeps the slot open, so a chord never moves. Muscle memory.
 *   fill   drops the slot and lets its row stretch. Big targets, but every
 *          chord shifts whenever any other is switched off.
 *   flex   abandons the by-type rows entirely and repacks whatever is enabled
 *          into the grid closest to square for the space available.
 *
 * All three return the same thing — cells in 0..1 space, relative to the area
 * the grid occupies — so the renderer does not know which mode it is drawing.
 */
export const LAYOUTS = ["fixed", "fill", "flex"];

export const DEFAULT_LAYOUT = "fill";

export function isLayout(value) {
  return LAYOUTS.includes(value);
}

/**
 * Which end of the screen the harp strip takes — the left edge in landscape
 * and the top in portrait, or the right and the bottom.
 *
 * "first" and "last" rather than a side, because the side depends on the
 * orientation and the position does not: the strip is either before the chords
 * in reading order or after them, whichever way the screen is turned.
 */
export const HARP_SIDES = ["first", "last"];

export const DEFAULT_HARP_SIDE = "last";

export function isHarpSide(value) {
  return HARP_SIDES.includes(value);
}

/**
 * Rows and columns whose cells come closest to square for a given count and
 * container aspect.
 *
 * The ideal is columns/rows === aspect, which is the same as saying each cell
 * is as wide as it is tall. Whole numbers rarely hit it, so every column count
 * is scored on how far its cell lands from square — in log space, so that
 * twice-as-wide and half-as-wide are penalised equally rather than the
 * stretched-tall options always looking cheaper. Ties go to the arrangement
 * wasting fewer slots.
 */
export function evenGrid(count, aspect) {
  if (count <= 0) return { columns: 1, rows: 1 };
  let best = null;
  for (let columns = 1; columns <= count; columns++) {
    const rows = Math.ceil(count / columns);
    const cellAspect = aspect / columns / (1 / rows);
    const squareness = Math.abs(Math.log(cellAspect));
    const waste = columns * rows - count;
    if (
      !best ||
      squareness < best.squareness - 1e-9 ||
      (Math.abs(squareness - best.squareness) < 1e-9 && waste < best.waste)
    ) {
      best = { columns, rows, squareness, waste };
    }
  }
  return { columns: best.columns, rows: best.rows };
}

/**
 * Cells for the current arrangement.
 *
 * `grouped` is the by-type structure the controller hands over — for `fixed`
 * it still holds nulls where disabled chords were. `aspect` is the width over
 * the height of the area being filled, in real pixels rather than in the 0..1
 * space, since a square of relative units is not a square on screen.
 */
export function layoutCells({ grouped, layout, isLandscape, aspect }) {
  const types = Object.keys(grouped);
  if (!types.length) return [];
  if (layout === "flex") return flexCells(grouped, aspect);

  // fixed and fill differ only in whether nulls are still present, which the
  // controller decided. Here they lay out identically: one row per chord type,
  // each row divided by however many entries it has.
  const cells = [];
  types.forEach((type, typeIndex) => {
    const list = grouped[type];
    const along = 1 / list.length;
    const across = 1 / types.length;
    list.forEach((chord, index) => {
      if (!chord) return;
      cells.push({
        chord,
        x: isLandscape ? index * along : typeIndex * across,
        y: isLandscape ? typeIndex * across : index * along,
        w: isLandscape ? along : across,
        h: isLandscape ? across : along,
      });
    });
  });
  return cells;
}

/**
 * Flex ignores the type grouping and packs every enabled chord into one grid.
 *
 * The last row is stretched to the full width rather than left short, so the
 * block stays rectangular — a ragged final row would undo the evenness the
 * mode exists to produce.
 */
function flexCells(grouped, aspect) {
  const flat = [];
  Object.keys(grouped).forEach((type) => {
    grouped[type].forEach((chord) => {
      if (chord) flat.push(chord);
    });
  });
  if (!flat.length) return [];

  const { columns, rows } = evenGrid(flat.length, aspect);
  const rowHeight = 1 / rows;
  const cells = [];
  for (let row = 0; row < rows; row++) {
    const start = row * columns;
    const inRow = Math.min(columns, flat.length - start);
    if (inRow <= 0) break;
    const cellWidth = 1 / inRow;
    for (let index = 0; index < inRow; index++) {
      cells.push({
        chord: flat[start + index],
        x: index * cellWidth,
        y: row * rowHeight,
        w: cellWidth,
        h: rowHeight,
      });
    }
  }
  return cells;
}
