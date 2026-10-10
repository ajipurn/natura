import type { Role } from "./types";

export const ROLES = [
  "admin",
  "ketua",
  "sekretaris",
  "bendahara",
  "petugas",
] as const;
export const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  ketua: "Ketua",
  sekretaris: "Sekretaris",
  bendahara: "Bendahara",
  petugas: "Petugas",
};
export const ROLE_HINT: Record<Role, string> = {
  admin: "Semua fitur dan pengaturan akses",
  ketua: "Semua fitur dan pengaturan akses",
  sekretaris: "Warga, keluarga, rumah, jadwal, dan informasi",
  bendahara: "Kas, iuran, dan membaca data rumah",
  petugas: "Info warga, ronda, dan pencatatan jimpitan",
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
  petugas: {},
};
export const isManager = (role: Role) =>
  ["admin", "ketua", "sekretaris", "bendahara"].includes(role);
export function can(role: Role, resource: Resource, write = false): boolean {
  if (role === "admin" || role === "ketua") return true;
  const access = ACCESS[role]?.[resource];
  return write ? access === "write" : access !== undefined;
}
