/**
 * Chart colours: the validated reference palette, light and dark. The eight
 * series hues keep a fixed order (never cycled); the dark set is stepped for the
 * dark surface rather than flipped. Checked with the data-viz palette validator:
 * all gates pass in both modes, and light mode's three sub-3:1 slots (aqua,
 * yellow, magenta) are covered by an always-present legend and a table view.
 */

export interface Palette {
  dark: boolean;
  surface: string;
  ink: string;
  secondary: string;
  muted: string;
  grid: string;
  axis: string;
  /** Eight categorical hues, in the order they are assigned. */
  series: readonly string[];
}

export const LIGHT: Palette = {
  dark: false,
  surface: "#fcfcfb",
  ink: "#0b0b0b",
  secondary: "#52514e",
  muted: "#898781",
  grid: "#e1e0d9",
  axis: "#c3c2b7",
  series: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"],
};

export const DARK: Palette = {
  dark: true,
  surface: "#1a1a19",
  ink: "#ffffff",
  secondary: "#c3c2b7",
  muted: "#898781",
  grid: "#2c2c2a",
  axis: "#383835",
  series: ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"],
};

export const paletteFor = (dark: boolean): Palette => (dark ? DARK : LIGHT);
