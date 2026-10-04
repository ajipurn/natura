import { getCurrentUser, refreshSessionIfNeeded } from "@/server/auth";
import { getRondaSnapshot } from "@/server/queries";

/** Data malam ini untuk halaman Ronda (disimpan di HP supaya bisa dipakai offline). */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sesi login habis." }, { status: 401 });
  await refreshSessionIfNeeded();
  return Response.json(await getRondaSnapshot(user), {
    headers: { "Cache-Control": "no-store" },
  });
}
