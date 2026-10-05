import { describe, expect, it } from "vitest";
import { DEFAULT_REGION, functionRegion } from "../scripts/vercel-region";

describe("region Vercel Function", () => {
  it("mengikuti region pooler Supabase", () => {
    expect(functionRegion({ DATABASE_URL: "postgresql://postgres.abc:pw@aws-0-ap-south-1.pooler.supabase.com:6543/postgres" }).region).toBe("bom1");
    expect(functionRegion({ DATABASE_URL: "postgresql://postgres.abc:pw@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres" }).region).toBe("sin1");
    expect(functionRegion({ DATABASE_URL: "postgresql://u:p@aws-0-eu-central-1.pooler.supabase.com:6543/postgres" }).region).toBe("fra1");
  });

  it("FUNCTION_REGION menang", () => {
    expect(functionRegion({ FUNCTION_REGION: "hnd1", DATABASE_URL: "postgresql://u:p@aws-0-ap-south-1.pooler.supabase.com:6543/postgres" }).region).toBe("hnd1");
  });

  it("region bawaan kalau alamat database tidak menyebut region", () => {
    expect(functionRegion({}).region).toBe(DEFAULT_REGION);
    expect(functionRegion({ DATABASE_URL: "postgresql://postgres:pw@db.abcdefghij.supabase.co:5432/postgres" }).region).toBe(DEFAULT_REGION);
    expect(functionRegion({ DATABASE_URL: "bukan url" }).region).toBe(DEFAULT_REGION);
    expect(functionRegion({ DATABASE_URL: "postgresql://u:p@aws-0-xx-moon-9.pooler.supabase.com:6543/postgres" }).region).toBe(DEFAULT_REGION);
  });
});
