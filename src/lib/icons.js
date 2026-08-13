/**
 * Inline SVG icon set.
 *
 * Trusted, in-repo markup — the only thing passed to `el(..., { html })`.
 * Inlining avoids an icon-font dependency and a render-blocking network hop,
 * and `currentColor` lets icons inherit their context's text colour.
 */
const svg = (paths, size = 20) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" ` +
  `stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths}</svg>`;

export const icons = {
  search: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  chevronDown: svg('<path d="m6 9 6 6 6-6"/>', 16),
  chevronLeft: svg('<path d="m14 6-6 6 6 6"/>', 18),
  chevronRight: svg('<path d="m10 6 6 6-6 6"/>', 18),
  close: svg('<path d="M18 6 6 18M6 6l12 12"/>', 20),
  filter: svg('<path d="M4 6h16M7 12h10M10 18h4"/>', 18),
  sort: svg('<path d="M4 7h11M4 12h7M4 17h4M17 10v8m0 0 3-3m-3 3-3-3"/>', 18),
  alert: svg('<path d="M12 9v4m0 4h.01"/><circle cx="12" cy="12" r="9"/>', 22),
  empty: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5M8.5 11h5"/>', 22),
  refresh: svg('<path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v4h-4"/>', 18),
  star: '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true" focusable="false"><path d="M12 2.5l2.9 6.06 6.6.86-4.8 4.6 1.2 6.48L12 17.4l-5.9 3.1 1.2-6.48-4.8-4.6 6.6-.86z"/></svg>',
  box: svg('<path d="M3 8l9-5 9 5v8l-9 5-9-5z"/><path d="M3 8l9 5 9-5"/><path d="M12 13v8"/>', 18),
};
