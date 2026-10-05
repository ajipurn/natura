import { validator } from "hono/validator";
import { z } from "zod";

/** Validasi body JSON dengan zod. Pesan error pertama dikirim ke layar apa adanya. */
export function body<T extends z.ZodType>(schema: T) {
  return validator("json", (value, c) => {
    const parsed = schema.safeParse(value);
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? "Data tidak valid." }, 400);
    return parsed.data as z.output<T>;
  });
}

/** Parameter id angka di URL, mis. /rumah/:id. */
export function idParam() {
  return validator("param", (value: Record<string, string>, c) => {
    const id = Number(value.id);
    if (!Number.isSafeInteger(id) || id <= 0) return c.json({ error: "Data tidak valid." }, 400);
    return { id };
  });
}

/** Teks dari form: dipangkas, kosong jadi "". */
export const trimmed = (max: number, message: string) => z.string(message).trim().max(max, message);

export const pinField = (message = "PIN harus 4–6 angka.") => z.string(message).regex(/^\d{4,6}$/, message);
