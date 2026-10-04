import type { SitePlan } from "@/lib/site-plan";
import { NATURA_PLAN } from "./natura";

/**
 * Denah yang dipakai aplikasi. Isi `null` untuk kembali ke denah manual
 * (gambar latar + penanda yang diatur admin di halaman Denah).
 */
export const SITE_PLAN: SitePlan | null = NATURA_PLAN;
