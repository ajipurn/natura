import { expect, it } from "vitest";
import { assertDifferentDatabases, postgresEnvironment } from "../scripts/db-copy";

it("kredensial dump dikirim lewat environment dan override libpq warisan dibuang", () => {
  const env = postgresEnvironment("postgresql://reader:p%24%26%2Fss@remote.example:5432/app?sslmode=require", true,
    { PATH: "/bin", PGHOSTADDR: "127.0.0.1", PGSERVICE: "wrong", PGOPTIONS: "--search_path=other", PGDATABASE: "wrong" });
  expect(env).toMatchObject({ PATH: "/bin", PGHOST: "remote.example", PGPORT: "5432", PGDATABASE: "app", PGUSER: "reader", PGPASSWORD: "p$&/ss", PGSSLMODE: "require" });
  expect(env).not.toHaveProperty("PGHOSTADDR");
  expect(env).not.toHaveProperty("PGSERVICE");
  expect(env).not.toHaveProperty("PGOPTIONS");
});

it("koneksi lokal memakai loopback IPv6 dan tidak memerlukan SSL", () => {
  expect(postgresEnvironment("postgresql://natura@[::1]:5433/natura", false)).toMatchObject({ PGHOST: "::1", PGSSLMODE: "disable" });
});

it("menolak sumber yang sama dengan tujuan meskipun ejaan host/user berbeda", () => {
  expect(() => assertDifferentDatabases("postgres://admin@localhost:5433/natura", "postgresql://natura@127.0.0.1:5433/natura")).toThrow("sumber dan tujuan sama");
  expect(() => assertDifferentDatabases("postgresql://natura@127.0.0.1:5433/source", "postgresql://natura@127.0.0.1:5433/natura")).not.toThrow();
});
