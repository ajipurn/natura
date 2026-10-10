import { expect, it } from "vitest";
import { localDatabaseUrl } from "@/server/local-database";

it.each([undefined, "", " "])("URL kosong %s tetap memakai PGlite", (value) => {
  expect(localDatabaseUrl(value)).toBeUndefined();
});

it.each(["localhost", "127.0.0.1", "[::1]"])("menerima PostgreSQL di %s", (host) => {
  const value = `postgresql://natura@${host}:5433/natura`;
  expect(localDatabaseUrl(value)).toBe(value);
});

it.each([
  "postgresql://natura@remote.example/natura",
  "postgresql://natura@localhost.remote.example/natura",
  "postgresql://natura@192.168.1.3/natura",
  "postgresql://natura@localhost/natura?host=remote.example",
  "postgresql://natura@localhost/natura?hostaddr=203.0.113.1",
  "postgresql://natura@localhost/natura?service=production",
  "https://localhost/natura",
  "invalid",
])("menolak target nonlokal atau override koneksi: %s", (value) => {
  expect(() => localDatabaseUrl(value)).toThrow(/DATABASE_URL/);
});
