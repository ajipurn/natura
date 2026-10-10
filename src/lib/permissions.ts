import type { Role } from "./types";

export const ROLES = [
  "admin",
  "ketua",
  "sekretaris",
  "bendahara",
  "humas",
  "petugas",
  "warga",
] as const;
export const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  ketua: "Ketua",
  sekretaris: "Sekretaris",
  bendahara: "Bendahara",
  humas: "Humas",
  petugas: "Petugas",
  warga: "Warga",
};
export const ROLE_HINT: Record<Role, string> = {
  admin: "Semua fitur dan pengaturan akses",
  ketua: "Semua fitur dan pengaturan akses",
  sekretaris: "Warga, keluarga, rumah, jadwal, dan informasi",
  bendahara: "Kas, iuran, dan membaca data rumah",
  humas: "Pengumuman dan kontak; membaca warga, rumah, dan jadwal",
  petugas: "Info warga, ronda, dan pencatatan jimpitan",
  warga: "Info warga tanpa tugas ronda atau pencatatan jimpitan",
};
export type Resource =
  | "overview"
  | "residents"
  | "houses"
  | "schedule"
  | "patrols"
  | "finance"
  | "info"
  | "accounts"
  | "settings";
const ACCESS: Record<Role, Partial<Record<Resource, "read" | "write">>> = {
  admin: {},
  ketua: {},
  sekretaris: {
    overview: "read",
    residents: "write",
    houses: "write",
    schedule: "write",
    patrols: "read",
    info: "write",
    accounts: "read",
    settings: "read",
  },
  bendahara: {
    overview: "read",
    houses: "read",
    patrols: "read",
    finance: "write",
    accounts: "read",
    settings: "read",
  },
  humas: {
    residents: "read",
    houses: "read",
    schedule: "read",
    info: "write",
    settings: "read",
  },
  petugas: {},
  warga: {},
};
export const canRonda = (role: Role) => role !== "warga";
export const isManager = (role: Role) =>
  ["admin", "ketua", "sekretaris", "bendahara", "humas"].includes(role);
export function can(role: Role, resource: Resource, write = false): boolean {
  if (role === "admin" || role === "ketua") return true;
  const access = ACCESS[role]?.[resource];
  return write ? access === "write" : access !== undefined;
}
