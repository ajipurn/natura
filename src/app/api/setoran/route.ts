import { getCurrentUser } from "@/server/auth";
import { applyEntries, entriesSchema } from "@/server/collections";

/** Menerima antrean catatan dari HP petugas. */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sesi login habis." }, { status: 401 });

  const parsed = entriesSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Data tidak valid." }, { status: 400 });
  }
  const results = await applyEntries(user, parsed.data.entries);
  return Response.json({ results }, { headers: { "Cache-Control": "no-store" } });
}
