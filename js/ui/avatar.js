import { h } from "./dom.js";
import { api } from "../api/index.js";

export const AVATAR_COLORS = ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"];
export const AVATAR_EMOJIS = ["🦊", "🐼", "🦁", "🐯", "🐸", "🐙", "🦄", "🐧", "🐨", "🦉", "🐬", "🦋", "🚀", "🎮", "⚽", "🏊", "🎸", "🍕", "🌈", "⭐", "😎", "🤖", "👑", "🐣"];

/* Een pictogram dat jij in de Studio hebt geüpload staat bij het profiel als "img:<pad>" in het veld avatar_emoji. */
export const ICON_PREFIX = "img:";
export const iconValue = (path) => ICON_PREFIX + path;
export const avatarImagePath = (profile) => (profile?.avatar_emoji || "").startsWith(ICON_PREFIX) ? profile.avatar_emoji.slice(ICON_PREFIX.length) : null;

/** De inhoud van een avatar: het geüploade plaatje, of anders het emoji-symbool. */
export function avatarInner(profile) {
  const path = avatarImagePath(profile);
  const src = path && api.media.artwork(path);
  if (!src) return h("span", null, path ? "🙂" : profile.avatar_emoji || "🙂");
  const img = h("img", { src, alt: "", draggable: false, decoding: "async" });
  img.addEventListener("error", () => img.replaceWith(h("span", null, "🙂")), { once: true }); // pictogram is verwijderd
  return img;
}

/** size: pixels, of weglaten zodat CSS de maat bepaalt. */
export function avatar(profile, { size = null, round = false, cls = "" } = {}) {
  const isImg = !!avatarImagePath(profile);
  return h("div", { class: `avatar ${profile.avatar_color || "c1"}${isImg ? " is-img" : ""}${round ? " round" : ""} ${cls}`, style: size ? { "--size": `${size}px` } : null, "aria-hidden": "true" }, avatarInner(profile));
}
