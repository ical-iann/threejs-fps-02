// The look plan, in one place. A dusk container yard: deep teal night, warm sand
// concrete, one ember accent, and two team colours (teal attackers, ember defenders).
// The same names are the CSS custom properties in index.html.
export const PALETTE = {
  canvas: '#0e1a1f',
  surface: '#1b2a30',
  hairline: '#31454d',
  ink: '#e8e2d4',
  muted: '#8fa3a8',
  accent: '#ff7a3c',
  sand: '#c9a86a',
  teal: '#37c8ab',
  ember: '#ff5a3c',
  sky: '#1d3038',
};

export function shade(name) {
  return PALETTE[name];
}
