import { classifyCellColor, type GuardColor } from "./guard-color";

export type PastedTable = {
  /** Isi tabel sebagai teks bertab (sel berisi baris baru diapit tanda kutip), siap dibaca parseSchedule. */
  text: string;
  /** Warna tiap sel, per baris dan kolom sama seperti `text`. */
  colors: (GuardColor | null)[][];
};

function tsvCell(text: string) {
  return /[\t\n"]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Latar tiap kelas CSS dari <style> (Excel menaruh warna sel di kelas, mis. `.xl65 {background:#92D050}`). */
function classBackgrounds(doc: Document): Map<string, string> {
  const map = new Map<string, string>();
  for (const style of doc.querySelectorAll("style")) {
    for (const rule of (style.textContent ?? "").matchAll(/\.([\w-]+)\s*\{([^}]*)\}/g)) {
      const bg = rule[2].match(/background(?:-color)?\s*:\s*([^;]+)/i);
      if (bg) map.set(rule[1], bg[1].trim());
    }
  }
  return map;
}

function cellBackground(cell: HTMLElement, classes: Map<string, string>): string | null {
  const inline = cell.style.backgroundColor || cell.style.background;
  if (inline) return inline.split(/\s+/)[0];
  const attr = cell.getAttribute("bgcolor");
  if (attr) return attr;
  for (const name of cell.classList) {
    const bg = classes.get(name);
    if (bg) return bg.split(/\s+/)[0];
  }
  return null;
}

function cellText(cell: HTMLElement): string {
  const copy = cell.cloneNode(true) as HTMLElement;
  for (const br of copy.querySelectorAll("br")) br.replaceWith("\n");
  return (copy.textContent ?? "")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .join("\n")
    .trim();
}

/**
 * Tabel dari clipboard (HTML hasil salin Excel/Google Sheets) → teks bertab + warna latar tiap sel.
 * Null kalau isi clipboard bukan tabel.
 */
export function tableFromHtml(html: string): PastedTable | null {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const table = doc.querySelector("table");
  if (!table) return null;
  const classes = classBackgrounds(doc);
  const lines: string[] = [];
  const colors: (GuardColor | null)[][] = [];
  for (const row of table.querySelectorAll("tr")) {
    const texts: string[] = [];
    const rowColors: (GuardColor | null)[] = [];
    for (const cell of row.querySelectorAll<HTMLElement>("td, th")) {
      const color = classifyCellColor(cellBackground(cell, classes));
      const span = Math.max(1, Number(cell.getAttribute("colspan")) || 1);
      texts.push(tsvCell(cellText(cell)));
      rowColors.push(color);
      // Sel gabungan dihitung sebagai beberapa kolom supaya posisi kolom hari tetap sama.
      for (let i = 1; i < span; i++) {
        texts.push("");
        rowColors.push(color);
      }
    }
    lines.push(texts.join("\t"));
    colors.push(rowColors);
  }
  return { text: lines.join("\n"), colors };
}
