import { ClickScrollPlugin, OverlayScrollbars } from "overlayscrollbars";
import "overlayscrollbars/overlayscrollbars.css";

/**
 * Scrollbar tipis bertema aplikasi (OverlayScrollbars, tema `.os-theme-app` di styles.css) untuk
 * halaman dan wadah `ScrollArea`. Di layar sentuh (HP) scrollbar bawaan dibiarkan: sudah tipis,
 * hanya muncul saat digulir, dan perilaku scroll HP tetap asli.
 */
export function setupScrollbars() {
  const touch = window.matchMedia("(hover: none) and (pointer: coarse)").matches;
  OverlayScrollbars.plugin(ClickScrollPlugin);
  OverlayScrollbars.env().setDefaultInitialization({ cancel: { nativeScrollbarsOverlaid: touch } });
  OverlayScrollbars.env().setDefaultOptions({
    scrollbars: { theme: "os-theme-app", autoHide: "leave", autoHideDelay: 800, clickScroll: true },
  });

  const page = [document.documentElement, document.body];
  if (touch) {
    // Atribut di HTML menyembunyikan scrollbar bawaan sebelum inisialisasi; di HP tidak dipakai.
    for (const el of page) el.removeAttribute("data-overlayscrollbars-initialize");
    return;
  }
  OverlayScrollbars(document.body, {});
}
