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
};

export type CollectionDTO = {
  houseId: number;
  status: CollectionStatus;
  amount: number;
  method: CollectionMethod;
  recordedAt: string;
  collectorName: string | null;
};

/** Satu baris jadwal ronda, sudah dicocokkan dengan data rumah (kalau ada). */
export type ScheduleDTO = {
  day: number;
  position: number;
  name: string | null;
  block: string;
  number: string;
  houseId: number | null;
  ownerName: string | null;
};

export type RondaSnapshot = {
  date: string;
  serverTime: string;
  settings: { communityName: string; defaultAmount: number };
  user: { id: number; name: string; role: Role };
  houses: HouseDTO[];
  collections: CollectionDTO[];
  schedule: ScheduleDTO[];
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

/** Satu sel rekap bulanan (rumah × malam). */
export type MonthCell = { status: CollectionStatus; amount: number };

export type MonthRecap = {
  houses: HouseDTO[];
  /** Malam-malam ronda di bulan itu (YYYY-MM-DD, urut). */
  dates: string[];
  /** Kunci `${houseId}:${date}`. */
  cells: Record<string, MonthCell>;
};
