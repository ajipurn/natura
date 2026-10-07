import { useSyncExternalStore } from "react";

const MY_HOUSE_KEY = "jimpitan:rumah-saya";

function read(): number | null {
  try {
    const value = Number(localStorage.getItem(MY_HOUSE_KEY));
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

let current = read();
const listeners = new Set<() => void>();

function save(next: number | null) {
  current = next;
  try {
    if (next) localStorage.setItem(MY_HOUSE_KEY, String(next));
    else localStorage.removeItem(MY_HOUSE_KEY);
  } catch {
    // Penyimpanan diblokir: pilihan berlaku selama halaman terbuka.
  }
  listeners.forEach((listener) => listener());
}

/**
 * Rumah yang dipilih warga sebagai rumahnya sendiri, disimpan di HP ini saja. Semua bagian halaman
 * (jadwal jaga, status per rumah) ikut berganti begitu dipilih.
 */
export function useMyHouse(): [number | null, (id: number | null) => void] {
  const id = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
  );
  return [id, save];
}
