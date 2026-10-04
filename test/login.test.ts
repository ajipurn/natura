import { beforeAll, describe, expect, it } from "vitest";
import { loginAction } from "@/app/login/actions";
import { getDb } from "@/server/db";
import { hashPin } from "@/server/pin";
import { users } from "@/server/schema";

let userId: number;

function form(pin: string) {
  const data = new FormData();
  data.set("userId", String(userId));
  data.set("pin", pin);
  return data;
}

beforeAll(async () => {
  const db = await getDb();
  const [u] = await db
    .insert(users)
    .values({ name: "Penguji Login", pinHash: await hashPin("1234") })
    .returning();
  userId = u.id;
});

describe("loginAction", () => {
  it("permintaan paralel tidak bisa mencoba lebih dari 5 PIN", async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) => loginAction(undefined, form(String(5000 + i)))),
    );
    const checked = results.filter((r) => r?.error?.startsWith("PIN salah"));
    expect(checked.length).toBeLessThanOrEqual(5);

    // PIN benar pun ditolak selama terkunci.
    const locked = await loginAction(undefined, form("1234"));
    expect(locked?.error).toMatch(/Coba lagi dalam/);
  });
});
