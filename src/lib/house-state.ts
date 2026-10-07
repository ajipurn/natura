import type { BillingPeriod } from "./payments";
import type { CollectionStatus, HouseStatus } from "./types";

/** Status rumah di denah: hasil malam itu, atau `neutral` kalau hanya menunjukkan letak. */
export type MarkerState = "filled" | "empty" | "unchecked" | "vacant" | "neutral";

/** Isi yang sudah diambil malam itu tetap diakui meskipun pembayaran periodenya belum lunas. */
export function rondaHouseState(
  house: { status: HouseStatus },
  collection?: { status: CollectionStatus } | null,
  period?: Pick<BillingPeriod, "status">,
): Exclude<MarkerState, "neutral"> {
  if (house.status === "vacant") return "vacant";
  if (collection?.status === "filled") return "filled";
  if (period) return period.status === "paid" ? "filled" : "empty";
  return collection?.status ?? "unchecked";
}

export const STATE_TEXT: Record<MarkerState, string> = {
  filled: "ada",
  empty: "kosong",
  unchecked: "belum dicek",
  vacant: "rumah kosong/mudik",
  neutral: "",
};
