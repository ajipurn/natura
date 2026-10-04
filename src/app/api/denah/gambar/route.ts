import { revalidatePath } from "next/cache";
import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/server/auth";
import { getDb } from "@/server/db";
import { getSiteMapImage } from "@/server/queries";
import { siteMap } from "@/server/schema";

const MAX_BYTES = 3 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** Gambar latar denah. URL-nya memuat versi (?v=), jadi aman di-cache selamanya. */
export async function GET() {
  if (!(await getCurrentUser())) return new Response("Perlu login.", { status: 401 });
  const image = await getSiteMapImage();
  if (!image) return new Response("Denah belum punya gambar.", { status: 404 });
  return new Response(Buffer.from(image.data, "base64"), {
    headers: {
      "Content-Type": image.type,
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/** Unggah gambar denah (admin). Body = file gambar; ?w=&h= = ukurannya dalam piksel. */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (user?.role !== "admin") return Response.json({ error: "Khusus admin." }, { status: 403 });

  const type = request.headers.get("content-type")?.split(";")[0].trim() ?? "";
  if (!ALLOWED_TYPES.includes(type)) {
    return Response.json({ error: "Format gambar harus JPG, PNG, atau WebP." }, { status: 415 });
  }
  const width = Number(request.nextUrl.searchParams.get("w"));
  const height = Number(request.nextUrl.searchParams.get("h"));
  if (![width, height].every((n) => Number.isInteger(n) && n >= 50 && n <= 8000)) {
    return Response.json({ error: "Ukuran gambar tidak valid." }, { status: 400 });
  }
  const body = Buffer.from(await request.arrayBuffer());
  if (body.length === 0 || body.length > MAX_BYTES) {
    return Response.json({ error: "Gambar terlalu besar (maks. 3 MB)." }, { status: 413 });
  }

  const values = { imageData: body.toString("base64"), imageType: type, width, height, updatedAt: new Date() };
  const db = await getDb();
  await db.insert(siteMap).values({ id: 1, ...values }).onConflictDoUpdate({ target: siteMap.id, set: values });
  revalidatePath("/admin/denah");
  return Response.json({ ok: true });
}

/** Hapus gambar (admin). Ukuran denah dipertahankan supaya posisi rumah tidak bergeser. */
export async function DELETE() {
  const user = await getCurrentUser();
  if (user?.role !== "admin") return Response.json({ error: "Khusus admin." }, { status: 403 });
  const db = await getDb();
  await db.update(siteMap).set({ imageData: null, imageType: null, updatedAt: new Date() });
  revalidatePath("/admin/denah");
  return Response.json({ ok: true });
}
