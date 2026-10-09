import type { GeoAnchor } from "./geo";
import type { GuardColor } from "./guard-color";
import type { BillingPeriod, PaymentCadence, PaymentCell, PaymentPlanDTO, PeriodPayment } from "./payments";

export type Role = "admin" | "ketua" | "sekretaris" | "bendahara" | "petugas";
export type HouseStatus = "active" | "vacant";
export type CollectionStatus = "filled" | "empty";
export type CollectionMethod = "scan" | "manual";

export type HouseDTO = {
  id: number;
  block: string;
  number: string;
  /** Nama warga: nama akun petugas yang tinggal di sana, atau nama KK untuk rumah tanpa akun. */
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

/** Satu baris jadwal ronda, dengan nama dan rumah dari akun petugas atau data rumah. */
export type ScheduleDTO = {
  id: number;
  day: number;
  position: number;
  /** Nama akun petugas, atau nama bebas untuk baris tanpa akun dan rumah. Null = baris rumah tanpa akun. */
  name: string | null;
  /** Rumah petugas (dari akunnya) atau rumah di baris itu; "" = tanpa rumah. */
  block: string;
  number: string;
  houseId: number | null;
  /** Nama warga rumah itu. */
  ownerName: string | null;
  userId: number | null;
  /** Akun petugasnya masih aktif (null kalau tidak terhubung ke akun). */
  userActive: boolean | null;
  /** Warna di tabel jadwal; null = putih. */
  color: GuardColor | null;
};

export type RondaSnapshot = {
  date: string;
  serverTime: string;
  settings: { communityName: string; defaultAmount: number };
  user: { id: number; name: string; role: Role };
  houses: HouseDTO[];
  collections: CollectionDTO[];
  schedule: ScheduleDTO[];
  /** Kalibrasi denah ↔ GPS untuk "Lokasi saya" (salinan lama di HP belum punya). */
  planAnchors?: GeoAnchor[];
  paymentCells?: Record<string, PaymentCell>;
  paymentPeriods?: BillingPeriod[];
  paymentPlans?: PaymentPlanDTO[];
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
  /** Bulan rekap, termasuk saat belum ada malam ronda. Opsional untuk cache lama. */
  month?: string;
  houses: HouseDTO[];
  /** Malam-malam ronda di bulan itu (YYYY-MM-DD, urut). */
  dates: string[];
  /** Kunci `${houseId}:${date}`. */
  cells: Record<string, MonthCell>;
  /** Alokasi pembayaran sesuai periode, bukan uang yang diambil pada malam itu. */
  paymentCells?: Record<string, PaymentCell>;
  paymentPeriods?: BillingPeriod[];
  periodPayments?: PeriodPayment[];
  /** Urutan perubahan cara bayar selama bulan rekap; cara yang sama bisa muncul kembali. */
  paymentCadences?: Record<number, PaymentCadence[]>;
};
