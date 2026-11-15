const ICONS = new Set(["up-right", "right", "left", "up", "down", "chevron-left", "chevron-right"]);
/** Server-rendered, decorative brand glyph; interactive parents supply the accessible name. */
export function brandIcon(name, extraClass = "") {
  if (!ICONS.has(name)) throw new RangeError("Unknown Green Locker icon");
  if (typeof extraClass !== "string" || !/^[a-zA-Z0-9 -]*$/.test(extraClass))
    throw new TypeError("Unsafe Green Locker icon class");
  return '<svg class="ui-icon' + (extraClass ? ' ' + extraClass : '') +
    '" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
    '<use href="/assets/ui-icons.svg#' + name + '"></use></svg>';
}
