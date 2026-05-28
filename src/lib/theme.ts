// Astra color-mode toggle: blue (default) ↔ purple.
// Stored in localStorage and applied as a class on <html>.
export type AstraTheme = "blue" | "purple";
const KEY = "astra:theme-v1";

export function loadTheme(): AstraTheme {
  if (typeof window === "undefined") return "blue";
  const v = localStorage.getItem(KEY);
  return v === "purple" ? "purple" : "blue";
}

export function applyTheme(theme: AstraTheme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("theme-purple", theme === "purple");
}

export function setTheme(theme: AstraTheme) {
  if (typeof window !== "undefined") localStorage.setItem(KEY, theme);
  applyTheme(theme);
  window.dispatchEvent(new CustomEvent("astra:theme-change", { detail: theme }));
}

export function initTheme() {
  applyTheme(loadTheme());
}
