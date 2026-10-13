const INK = "#0f766e";

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

export function drawCommunityStamp(ctx: CanvasRenderingContext2D, logo: HTMLImageElement, communityName: string, x: number, y: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
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
