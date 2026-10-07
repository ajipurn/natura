import type { GuardColor } from "./guard-color";
import { DAY_NAMES, NIGHT_OF, slotHouseLabel } from "./schedule";
import type { ScheduleDTO } from "./types";

type ImageCell = { text: string; color: GuardColor | null };
const FILL: Record<GuardColor | "white", string> = {
  green: "#e2f0d9",
  yellow: "#fff2cc",
  orange: "#fce4d6",
  white: "#ffffff",
};

/** Tujuh kolom Ahad–Sabtu; urutan dan warna selalu berasal dari jadwal tersimpan. */
export function scheduleImageRows(schedule: readonly ScheduleDTO[]): (ImageCell | null)[][] {
  const columns = DAY_NAMES.map((_, day) =>
    schedule
      .filter((slot) => slot.day === day)
      .sort((a, b) => a.position - b.position || a.id - b.id)
      .map((slot) => {
        const name = (slot.name ?? slot.ownerName ?? "").trim();
        const house = slotHouseLabel(slot);
        return { text: [name, house && `(${house})`].filter(Boolean).join(" ").toUpperCase(), color: slot.color };
      }),
  );
  return Array.from({ length: Math.max(...columns.map((column) => column.length)) }, (_, row) =>
    columns.map((column) => column[row] ?? null),
  );
}

/** Bungkus teks tanpa memotong nama, termasuk kata yang lebih panjang dari lebar sel. */
export function wrapImageText(text: string, maxWidth: number, measure: (text: string) => number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.trim().split(/\s+/).filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word;
    if (measure(candidate) <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    line = "";
    // Array.from menjaga pasangan surrogate (mis. emoji) tetap utuh.
    for (const letter of Array.from(word)) {
      if (line && measure(line + letter) > maxWidth) {
        lines.push(line);
        line = "";
      }
      line += letter;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** PNG berlatar putih, resolusi 2×, tidak tergantung tema atau lebar layar admin. */
export async function createScheduleImage(schedule: readonly ScheduleDTO[], communityName: string): Promise<Blob> {
  const rows = scheduleImageRows(schedule);
  if (!rows.length) throw new Error("Belum ada jadwal untuk diekspor.");

  await document.fonts.ready;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Browser ini belum bisa membuat gambar jadwal.");

  const margin = 20;
  const numberWidth = 56;
  const columnWidth = 240;
  const tableWidth = numberWidth + columnWidth * DAY_NAMES.length;
  const width = tableWidth + margin * 2;
  const lineHeight = 24;
  const font = "18px Arial, sans-serif";
  ctx.font = font;
  const measure = (text: string) => ctx.measureText(text).width;
  const wrappedRows = rows.map((row) => row.map((cell) => wrapImageText(cell?.text ?? "", columnWidth - 20, measure)));
  const rowHeights = wrappedRows.map((row) => Math.max(1, ...row.map((lines) => lines.length)) * lineHeight + 12);
  ctx.font = "26px Arial, sans-serif";
  const title = `JADWAL RONDA JIMPITAN ${communityName}`.trim().toUpperCase();
  const titleLines = wrapImageText(title, tableWidth - 32, measure);
  const titleHeight = titleLines.length * 32 + 24;
  const headerHeight = 64;
  const tableHeight = titleHeight + headerHeight + rowHeights.reduce((sum, height) => sum + height, 0);
  const height = margin * 2 + tableHeight;

  // Mengubah ukuran canvas mereset konteks; semua gaya ditetapkan sesudahnya.
  canvas.width = width * 2;
  canvas.height = height * 2;
  ctx.scale(2, 2);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#171717";
  ctx.font = "26px Arial, sans-serif";
  titleLines.forEach((line, i) => ctx.fillText(line, width / 2, margin + titleHeight / 2 + (i - (titleLines.length - 1) / 2) * 32));

  const headerTop = margin + titleHeight;
  ctx.font = "18px Arial, sans-serif";
  DAY_NAMES.forEach((day, i) => {
    const x = margin + numberWidth + (i + 0.5) * columnWidth;
    ctx.fillText(day.toUpperCase(), x, headerTop + 16);
    ctx.fillText(`(MALAM ${NIGHT_OF[i].toUpperCase()})`, x, headerTop + 48);
  });

  let y = headerTop + headerHeight;
  const rowBoundaries = [y];
  ctx.font = font;
  rows.forEach((row, rowIndex) => {
    const rowHeight = rowHeights[rowIndex];
    ctx.fillStyle = "#171717";
    ctx.fillText(String(rowIndex + 1), margin + numberWidth / 2, y + rowHeight / 2);
    row.forEach((cell, day) => {
      const x = margin + numberWidth + day * columnWidth;
      ctx.fillStyle = FILL[cell?.color ?? "white"];
      ctx.fillRect(x, y, columnWidth, rowHeight);
      ctx.fillStyle = "#171717";
      const lines = wrappedRows[rowIndex][day];
      lines.forEach((line, i) =>
        ctx.fillText(line, x + columnWidth / 2, y + rowHeight / 2 + (i - (lines.length - 1) / 2) * lineHeight),
      );
    });
    y += rowHeight;
    rowBoundaries.push(y);
  });

  ctx.strokeStyle = "#171717";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(margin, margin, tableWidth, tableHeight);
  ctx.beginPath();
  ctx.moveTo(margin, headerTop);
  ctx.lineTo(margin + tableWidth, headerTop);
  ctx.moveTo(margin + numberWidth, headerTop + headerHeight / 2);
  ctx.lineTo(margin + tableWidth, headerTop + headerHeight / 2);
  rowBoundaries.slice(0, -1).forEach((boundary) => {
    ctx.moveTo(margin, boundary);
    ctx.lineTo(margin + tableWidth, boundary);
  });
  for (let col = 0; col < DAY_NAMES.length; col++) {
    const x = margin + numberWidth + col * columnWidth;
    ctx.moveTo(x, headerTop);
    ctx.lineTo(x, margin + tableHeight);
  }
  ctx.stroke();

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Gambar jadwal gagal dibuat. Coba ekspor lagi."));
    }, "image/png");
  });
}
