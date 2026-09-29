import { h } from "./dom.js";

export const AVATAR_COLORS = ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"];
export const AVATAR_EMOJIS = ["🦊", "🐼", "🦁", "🐯", "🐸", "🐙", "🦄", "🐧", "🐨", "🦉", "🐬", "🦋", "🚀", "🎮", "⚽", "🏊", "🎸", "🍕", "🌈", "⭐", "😎", "🤖", "👑", "🐣"];

/** size: pixels, of weglaten zodat CSS de maat bepaalt. */
export function avatar(profile, { size = null, round = false, cls = "" } = {}) {
  return h("div", { class: `avatar ${profile.avatar_color || "c1"}${round ? " round" : ""} ${cls}`, style: size ? { "--size": `${size}px` } : null, "aria-hidden": "true" }, profile.avatar_emoji || "🙂");
}
