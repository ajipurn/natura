/** Region AWS (dipakai Supabase) → region Vercel terdekat. */
const VERCEL_REGION: Record<string, string> = {
  "ap-south-1": "bom1",
  "ap-southeast-1": "sin1",
  "ap-southeast-2": "syd1",
  "ap-east-1": "hkg1",
  "ap-northeast-1": "hnd1",
  "ap-northeast-2": "icn1",
  "ap-northeast-3": "kix1",
  "me-central-1": "dxb1",
  "af-south-1": "cpt1",
  "eu-central-1": "fra1",
  "eu-west-1": "dub1",
  "eu-west-2": "lhr1",
  "eu-west-3": "cdg1",
  "eu-north-1": "arn1",
  "us-east-1": "iad1",
  "us-east-2": "cle1",
  "us-west-1": "sfo1",
  "us-west-2": "pdx1",
  "ca-central-1": "yul1",
  "sa-east-1": "gru1",
};

/** Dipakai kalau region database tidak bisa dibaca dari alamatnya (dekat Indonesia). */
export const DEFAULT_REGION = "sin1";

/**
 * Region Vercel Function: FUNCTION_REGION kalau diisi, selain itu yang terdekat dengan database
 * menurut alamat pooler Supabase di DATABASE_URL (mis. aws-0-ap-south-1.pooler.supabase.com → bom1).
 */
export function functionRegion(env: { FUNCTION_REGION?: string; DATABASE_URL?: string }): { region: string; reason: string } {
  if (env.FUNCTION_REGION) return { region: env.FUNCTION_REGION, reason: "FUNCTION_REGION" };
  let host = "";
  try {
    host = env.DATABASE_URL ? new URL(env.DATABASE_URL).hostname : "";
  } catch {
    // Alamat tidak valid: pakai region bawaan.
  }
  const aws = host.match(/^aws-\d+-([a-z]+-[a-z]+-\d+)\.pooler\.supabase\.com$/)?.[1];
  if (aws && VERCEL_REGION[aws]) return { region: VERCEL_REGION[aws], reason: `database di ${aws}` };
  return { region: DEFAULT_REGION, reason: host ? `region database ${host} tidak dikenali` : "DATABASE_URL tidak diisi saat build" };
}
