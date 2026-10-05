/** Status rumah di denah: hasil malam itu, atau `neutral` kalau hanya menunjukkan letak. */
export type MarkerState = "filled" | "empty" | "unchecked" | "vacant" | "neutral";

export const STATE_TEXT: Record<MarkerState, string> = {
  filled: "ada",
  empty: "kosong",
  unchecked: "belum dicek",
  vacant: "rumah kosong/mudik",
  neutral: "",
};
