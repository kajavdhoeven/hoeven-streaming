/* Verbindt het zoekveld in de navigatiebalk met het zoekscherm. */

export const searchBus = new EventTarget();
export const search = { q: "" };

export function setQuery(q, source) {
  search.q = q;
  searchBus.dispatchEvent(new CustomEvent("query", { detail: { q, source } }));
}
