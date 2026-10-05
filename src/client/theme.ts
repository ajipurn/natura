import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark";

/**
 * Pilihan tema disimpan per HP; bawaannya terang. Skrip kecil di `<head>` tiap index.html membaca
 * kunci yang sama sebelum halaman tampil, supaya mode gelap tidak berkedip terang dulu.
 */
const STORAGE_KEY = "jimpitan:theme";
/** Warna bilah status/alamat browser di HP, sama dengan `--bg` di styles.css. */
const THEME_COLOR: Record<Theme, string> = { light: "#f4f6f8", dark: "#0b1220" };

const listeners = new Set<() => void>();

function current(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function apply(theme: Theme) {
  // Tanpa animasi selama berganti: kalau tidak, elemen ber-`transition` berpindah warna belakangan
  // dan halaman sesaat tampak setengah terang setengah gelap.
  const freeze = document.createElement("style");
  freeze.textContent = "*,*::before,*::after{transition:none!important}";
  document.head.appendChild(freeze);

  if (theme === "dark") document.documentElement.dataset.theme = "dark";
  else delete document.documentElement.dataset.theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLOR[theme]);
  listeners.forEach((listener) => listener());

  // Warna baru diterapkan dulu, baru animasi dinyalakan lagi.
  void getComputedStyle(document.body).color;
  requestAnimationFrame(() => freeze.remove());
}

export function setTheme(theme: Theme) {
  try {
    if (theme === "dark") localStorage.setItem(STORAGE_KEY, "dark");
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // localStorage diblokir: tema tetap berganti selama halaman terbuka.
  }
  apply(theme);
}

// Diganti di tab lain (mis. app admin dan app warga terbuka bersamaan): ikut berganti.
window.addEventListener("storage", (e) => {
  if (e.key === STORAGE_KEY || e.key === null) apply(e.newValue === "dark" ? "dark" : "light");
});

export function useTheme(): Theme {
  return useSyncExternalStore((listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, current);
}
