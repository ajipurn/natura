import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { api, ApiError, call, errorMessage, errorTitle } from "@/client/api";
import { ErrorCard } from "@/components/query-state";

afterEach(() => vi.restoreAllMocks());

it("pesan konfigurasi API tampil dengan judul dan langkah pemulihan di kartu error", async () => {
  const response = Response.json({ title: "Database lokal belum siap", error: "Hentikan server dev, jalankan make db-sync, lalu jalankan bun run dev." }, { status: 503 });
  vi.spyOn(globalThis, "fetch").mockResolvedValue(response);
  let failure: unknown;
  try { await call(api.auth.$get()); }
  catch (err) { failure = err; }
  expect(failure).toBeInstanceOf(ApiError);
  expect((failure as ApiError).status).toBe(503);
  const html = renderToStaticMarkup(<ErrorCard title={errorTitle(failure)} message={errorMessage(failure)} onRetry={() => {}} />);
  expect(html).toContain("Database lokal belum siap");
  expect(html).toContain("make db-sync");
  expect(html).toContain("Coba lagi");
  expect(html).toContain('role="alert"');
  expect(html).not.toContain("Gagal memuat");
});

it("error API biasa tetap memakai judul bawaan", async () => {
  const response = Response.json({ error: "Tidak diizinkan." }, { status: 403 });
  vi.spyOn(globalThis, "fetch").mockResolvedValue(response);
  await expect(call(api.auth.$get())).rejects.toMatchObject({ status: 403, message: "Tidak diizinkan.", title: undefined });
  const html = renderToStaticMarkup(<ErrorCard message="Tidak diizinkan." />);
  expect(html).toContain("Gagal memuat");
  expect(html).toContain("Tidak diizinkan.");
});
