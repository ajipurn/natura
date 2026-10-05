import { useState } from "react";

const MY_HOUSE_KEY = "jimpitan:rumah-saya";

/** Rumah yang dipilih warga sebagai rumahnya sendiri, disimpan di HP ini saja. */
export function useMyHouse(): [number | null, (id: number | null) => void] {
  const [id, setId] = useState<number | null>(() => {
    try {
      const value = Number(localStorage.getItem(MY_HOUSE_KEY));
      return Number.isSafeInteger(value) && value > 0 ? value : null;
    } catch {
      return null;
    }
  });
  function save(next: number | null) {
    setId(next);
    try {
      if (next) localStorage.setItem(MY_HOUSE_KEY, String(next));
      else localStorage.removeItem(MY_HOUSE_KEY);
    } catch {
      // Penyimpanan diblokir: pilihan berlaku selama halaman terbuka.
    }
  }
  return [id, save];
}

/** Teks singkat status bulan ini untuk satu rumah ("12/14 malam ada isinya"). */
export function houseMonthText(h: { status: "active" | "vacant"; filled: number; empty: number }) {
  const checked = h.filled + h.empty;
  if (h.status === "vacant") return "ditandai mudik";
  return checked ? `${h.filled}/${checked} malam ada isinya` : "belum dicek bulan ini";
}
