/* Kleine DOM-hulpjes: h() maakt elementen, Scope ruimt event listeners op. */

/*
 * Vangnet: de ingebouwde append/prepend/replaceChildren maken van null, undefined
 * en false de zichtbare tekst "null". Dit filtert lege waarden eruit en vlakt
 * geneste lijsten af, zodat je gewoon `cond ? element : null` kunt doorgeven.
 */
for (const proto of [Element.prototype, DocumentFragment.prototype]) {
  for (const name of ["append", "prepend", "replaceChildren"]) {
    const native = proto[name];
    proto[name] = function (...nodes) {
      return native.apply(this, nodes.flat(Infinity).filter((n) => n != null && n !== false && n !== true));
    };
  }
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function append(el, child) {
  if (child == null || child === false || child === true) return;
  if (Array.isArray(child)) child.forEach((c) => append(el, c));
  else if (child instanceof Node) el.appendChild(child);
  else el.appendChild(document.createTextNode(String(child)));
}

/**
 * h("div", { class: "card", onClick: fn, style: { "--i": 2 } }, kind1, kind2)
 * - onXxx        event listener
 * - style        object (ook CSS-variabelen als "--naam")
 * - dataset      object
 * - ref          functie die het element ontvangt
 * - overige      property als die bestaat, anders attribuut
 */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "style" && typeof v === "object") {
        for (const [sk, sv] of Object.entries(v)) {
          if (sk.startsWith("--")) el.style.setProperty(sk, sv);
          else el.style[sk] = sv;
        }
      } else if (k === "dataset") Object.assign(el.dataset, v);
      else if (k === "ref") v(el);
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === "for") el.htmlFor = v;
      else if (k === "html") el.innerHTML = v; // alleen voor vaste, eigen strings gebruiken
      else if (k in el && k !== "list") el[k] = v;
      else el.setAttribute(k, v === true ? "" : v);
    }
  }
  append(el, children);
  return el;
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

export function mount(el, ...nodes) {
  clear(el);
  append(el, nodes);
  return el;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const nextFrame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
export const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Wacht tot een animatie/transitie klaar is (met vangnet). */
export function animationDone(el, timeout = 1500) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    el.addEventListener("animationend", finish, { once: true });
    el.addEventListener("transitionend", finish, { once: true });
    setTimeout(finish, timeout);
  });
}

/** Verzamelt listeners en timers zodat een scherm zich netjes kan opruimen. */
export class Scope {
  constructor() { this._fns = []; }
  on(target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    this._fns.push(() => target.removeEventListener(type, fn, opts));
    return this;
  }
  timeout(fn, ms) { const id = setTimeout(fn, ms); this._fns.push(() => clearTimeout(id)); return id; }
  interval(fn, ms) { const id = setInterval(fn, ms); this._fns.push(() => clearInterval(id)); return id; }
  add(fn) { this._fns.push(fn); return this; }
  dispose() { this._fns.splice(0).reverse().forEach((f) => { try { f(); } catch (e) { console.error(e); } }); }
}
