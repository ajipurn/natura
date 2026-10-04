export type Role = "admin" | "petugas";
export type HouseStatus = "active" | "vacant";
export type CollectionStatus = "filled" | "empty";
export type CollectionMethod = "scan" | "manual";

export type HouseDTO = {
  id: number;
  block: string;
  number: string;
  ownerName: string | null;
  token: string;
  status: HouseStatus;
  /** Posisi di denah (0–1), null kalau belum ditaruh. */
  mapX: number | null;
  mapY: number | null;
};

export type SiteMapInfo = {
  /** URL gambar latar (sudah termasuk versi), null kalau denah tanpa gambar. */
  imageUrl: string | null;
  width: number;
  height: number;
};

export type CollectionDTO = {
  houseId: number;
  status: CollectionStatus;
  amount: number;
  method: CollectionMethod;
  recordedAt: string;
  collectorName: string | null;
};

export type RondaSnapshot = {
  date: string;
  serverTime: string;
  settings: { communityName: string; defaultAmount: number };
  user: { id: number; name: string; role: Role };
  houses: HouseDTO[];
  collections: CollectionDTO[];
  siteMap: SiteMapInfo;
};

/** Satu catatan dari HP petugas. `none` = hapus catatan rumah itu untuk malam tersebut. */
export type EntryInput = {
  clientId: string;
  houseId: number;
  status: CollectionStatus | "none";
  amount: number;
  method: CollectionMethod;
  recordedAt: string;
};

export type EntryResult =
  | { clientId: string; ok: true; date: string }
  | { clientId: string; ok: false; error: string };
