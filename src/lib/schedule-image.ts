import { DEFAULT_LOGO_URL } from "./branding";
import { GUARD_COLOR_MEANING, type GuardColor } from "./guard-color";
import { DAY_NAMES, NIGHT_OF, slotHouseLabel } from "./schedule";
import type { ScheduleDTO } from "./types";

type ImageCell = { text: string; color: GuardColor | null };
const FILL: Record<GuardColor | "white", string> = {
  green: "#c6e0b4",
  yellow: "#fff2cc",
  orange: "#ffe699",
  blue: "#bdd7ee",
  white: "#ffffff",
};
const INK = "#0f766e";
const LEGEND = ["green", "orange", "blue"] as const;

async function loadLogo(url: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.crossOrigin = "anonymous";
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Logo gagal dimuat. Coba ekspor lagi."));
    image.src = url;
  });
  return image;
}

/** Pasangkan logo ke kotak tanpa mengubah proporsinya. */
function drawLogo(ctx: CanvasRenderingContext2D, logo: HTMLImageElement, x: number, y: number, width: number, height: number) {
  const scale = Math.min(width / logo.naturalWidth, height / logo.naturalHeight);
  const w = logo.naturalWidth * scale;
  const h = logo.naturalHeight * scale;
  ctx.drawImage(logo, x + (width - w) / 2, y + (height - h) / 2, w, h);
}

/** Tulisan melingkar; sisi bawah tetap terbaca dari kiri ke kanan. */
function stampText(ctx: CanvasRenderingContext2D, text: string, radius: number, bottom = false) {
  let fontSize = bottom ? 11 : 14;
  const letters = Array.from(text.toUpperCase());
  const spacing = bottom ? 0.3 : 0.75;
  const maxWidth = Math.PI * radius * (bottom ? 0.68 : 0.94);
  const measure = () => letters.reduce((sum, letter) => sum + ctx.measureText(letter).width + spacing, 0);
  ctx.font = `bold ${fontSize}px Arial, sans-serif`;
  while (measure() > maxWidth && fontSize > 6) ctx.font = `bold ${--fontSize}px Arial, sans-serif`;
  const direction = bottom ? -1 : 1;
  let angle = (bottom ? Math.PI / 2 : -Math.PI / 2) - direction * measure() / radius / 2;
  letters.forEach((letter) => {
    const advance = (ctx.measureText(letter).width + spacing) / radius;
    const middle = angle + direction * advance / 2;
    ctx.save();
    ctx.translate(Math.cos(middle) * radius, Math.sin(middle) * radius);
    ctx.rotate(middle + (bottom ? -Math.PI / 2 : Math.PI / 2));
    ctx.fillText(letter, 0, 0);
    ctx.restore();
    angle += direction * advance;
  });
}

function stampStar(ctx: CanvasRenderingContext2D, x: number) {
  ctx.beginPath();
  for (let point = 0; point < 10; point++) {
    const angle = -Math.PI / 2 + point * Math.PI / 5;
    const radius = point % 2 === 0 ? 6 : 2.7;
    const px = x + Math.cos(angle) * radius;
    const py = Math.sin(angle) * radius;
    if (point === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

function drawStamp(ctx: CanvasRenderingContext2D, logo: HTMLImageElement, communityName: string, x: number, y: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-Math.PI / 24);
  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;
  ctx.globalAlpha = 0.85;
  for (const [radius, lineWidth] of [[78, 2.8], [74, 1.2], [53, 2]]) {
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.stroke();
  }
  drawLogo(ctx, logo, -42, -42, 84, 52);

  // Pita nama melintasi lingkaran dalam, mengikuti stempel paguyuban.
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(-62, 11, 124, 20);
  ctx.restore();
  stampText(ctx, "Paguyuban warga", 64);
  stampText(ctx, "Desa Karangsari Kebumen", 64, true);
  stampStar(ctx, -64);
  stampStar(ctx, 64);
  let nameSize = 14;
  let name = communityName.trim().toUpperCase();
  ctx.font = `bold ${nameSize}px Arial, sans-serif`;
  while (ctx.measureText(name).width > 120 && nameSize > 10) ctx.font = `bold ${--nameSize}px Arial, sans-serif`;
  // Nama panjang tetap lengkap di judul; pita stempel harus tetap terbaca.
  if (ctx.measureText(name).width > 120) name = "PAGUYUBAN";
  ctx.fillText(name, 0, 22);
  ctx.restore();
}

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
export async function createScheduleImage(schedule: readonly ScheduleDTO[], communityName: string, logoUrl?: string | null): Promise<Blob> {
  const rows = scheduleImageRows(schedule);
  if (!rows.length) throw new Error("Belum ada jadwal untuk diekspor.");

  await document.fonts.ready;
  const logo = await loadLogo(logoUrl ?? DEFAULT_LOGO_URL).catch((error) => {
    if (!logoUrl || logoUrl === DEFAULT_LOGO_URL) throw error;
    return loadLogo(DEFAULT_LOGO_URL);
  });
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Browser ini belum bisa membuat gambar jadwal.");

  const margin = 24;
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
  const title = "JADWAL RONDA JIMPITAN";
  ctx.font = "bold 28px Arial, sans-serif";
  const titleWidth = measure(title);
  ctx.font = "18px Arial, sans-serif";
  const communityLines = wrapImageText(communityName.trim().toUpperCase(), tableWidth - 176, measure);
  const brandWidth = 104 + Math.max(titleWidth, ...communityLines.map(measure));
  const titleHeight = Math.max(80, 40 + communityLines.length * 24) + 24;
  const headerHeight = 48;
  const tableHeight = headerHeight + rowHeights.reduce((sum, height) => sum + height, 0);
  const footerHeight = 180;
  const height = margin * 2 + titleHeight + tableHeight + footerHeight;

  // Mengubah ukuran canvas mereset konteks; semua gaya ditetapkan sesudahnya.
  canvas.width = width * 2;
  canvas.height = height * 2;
  ctx.scale(2, 2);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#171717";
  const brandLeft = (width - brandWidth) / 2;
  const brandMiddle = margin + (titleHeight - 24) / 2;
  drawLogo(ctx, logo, brandLeft, brandMiddle - 36, 80, 72);
  ctx.textAlign = "left";
  ctx.font = "bold 28px Arial, sans-serif";
  ctx.fillText(title, brandLeft + 104, brandMiddle - communityLines.length * 12);
  ctx.fillStyle = INK;
  ctx.font = "18px Arial, sans-serif";
  communityLines.forEach((line, i) => ctx.fillText(line, brandLeft + 104, brandMiddle + 26 + (i - (communityLines.length - 1) / 2) * 24));

  const headerTop = margin + titleHeight;
  ctx.fillStyle = "#f0f7f6";
  ctx.fillRect(margin, headerTop, tableWidth, headerHeight);
  DAY_NAMES.forEach((day, i) => {
    ctx.font = "bold 18px Arial, sans-serif";
    const dayWidth = measure(day.toUpperCase());
    ctx.font = "14px Arial, sans-serif";
    const night = `(malam ${NIGHT_OF[i]})`;
    const x = margin + numberWidth + (i + 0.5) * columnWidth - (dayWidth + 8 + measure(night)) / 2;
    ctx.fillStyle = "#171717";
    ctx.font = "bold 18px Arial, sans-serif";
    ctx.fillText(day.toUpperCase(), x, headerTop + headerHeight / 2);
    ctx.fillStyle = "#475569";
    ctx.font = "14px Arial, sans-serif";
    ctx.fillText(night, x + dayWidth + 8, headerTop + headerHeight / 2);
  });

  ctx.textAlign = "center";
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
  ctx.strokeRect(margin, headerTop, tableWidth, tableHeight);
  ctx.beginPath();
  rowBoundaries.slice(0, -1).forEach((boundary) => {
    ctx.moveTo(margin, boundary);
    ctx.lineTo(margin + tableWidth, boundary);
  });
  for (let col = 0; col < DAY_NAMES.length; col++) {
    const x = margin + numberWidth + col * columnWidth;
    ctx.moveTo(x, headerTop);
    ctx.lineTo(x, headerTop + tableHeight);
  }
  ctx.stroke();

  const footerTop = headerTop + tableHeight;
  const legendY = footerTop + 32;
  let legendX = margin;
  ctx.textAlign = "left";
  ctx.font = "16px Arial, sans-serif";
  LEGEND.forEach((color) => {
    ctx.fillStyle = FILL[color];
    ctx.fillRect(legendX, legendY - 9, 22, 18);
    ctx.strokeStyle = "#64748b";
    ctx.lineWidth = 0.75;
    ctx.strokeRect(legendX, legendY - 9, 22, 18);
    ctx.fillStyle = "#171717";
    const label = GUARD_COLOR_MEANING[color];
    ctx.fillText(label, legendX + 32, legendY);
    legendX += 32 + measure(label) + 32;
  });
  ctx.textAlign = "center";
  drawStamp(ctx, logo, communityName, width - margin - 86, footerTop + footerHeight / 2);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Gambar jadwal gagal dibuat. Coba ekspor lagi."));
    }, "image/png");
  });
}
