"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { rondaDate } from "@/lib/dates";
import { houseLabel } from "@/lib/houses";
import type {
  CollectionDTO,
  CollectionMethod,
  CollectionStatus,
  EntryInput,
  EntryResult,
  HouseDTO,
  RondaSnapshot,
} from "@/lib/types";

const SNAPSHOT_KEY = "jimpitan:snapshot:v1";
const PENDING_KEY = "jimpitan:pending:v1";
const POLL_MS = 15_000;

/** Catatan yang belum terkirim ke server. `date` dihitung di HP untuk tampilan. */
export type PendingEntry = EntryInput & { date: string; collectorName: string };

type StoredSnapshot = RondaSnapshot & {
  /** Selisih jam server − jam HP (ms), supaya HP dengan jam salah tetap mencatat waktu yang benar. */
  clockOffset: number;
};

export type MergedCollection = CollectionDTO & { pending: boolean };

export type SyncStatus = "idle" | "syncing" | "offline" | "auth";

export type Rejection = { clientId: string; label: string; error: string };

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Penyimpanan penuh/diblokir: catatan tetap ada di memori selama halaman terbuka.
  }
}

/** Masukkan catatan yang sudah diterima server ke salinan lokal, sebelum data terbaru diambil. */
function withAccepted(snapshot: StoredSnapshot, entries: (PendingEntry & { serverDate: string })[]): StoredSnapshot {
  const byHouse = new Map(snapshot.collections.map((c) => [c.houseId, c]));
  for (const e of entries) {
    if (e.serverDate !== snapshot.date) continue;
    if (e.status === "none") {
      byHouse.delete(e.houseId);
    } else {
      byHouse.set(e.houseId, {
        houseId: e.houseId,
        status: e.status,
        amount: e.amount,
        method: e.method,
        recordedAt: e.recordedAt,
        collectorName: e.collectorName,
      });
    }
  }
  return { ...snapshot, collections: [...byHouse.values()] };
}

function newClientId(): string {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function useRondaStore() {
  const [snapshot, setSnapshot] = useState<StoredSnapshot | null>(null);
  const [pending, setPendingState] = useState<PendingEntry[]>([]);
  const [status, setStatus] = useState<SyncStatus>("idle");
  const [loaded, setLoaded] = useState(false);
  const [rejections, setRejections] = useState<Rejection[]>([]);
  const [now, setNow] = useState(() => Date.now());

  const pendingRef = useRef<PendingEntry[]>([]);
  const snapshotRef = useRef<StoredSnapshot | null>(null);
  const syncingRef = useRef(false);
  /** Ada permintaan sinkron baru saat sinkron sebelumnya masih berjalan. */
  const resyncRef = useRef(false);

  const setPending = useCallback((update: (prev: PendingEntry[]) => PendingEntry[]) => {
    const next = update(pendingRef.current);
    pendingRef.current = next;
    writeJson(PENDING_KEY, next);
    setPendingState(next);
  }, []);

  const clockOffset = snapshot?.clockOffset ?? 0;
  const serverNow = useCallback(() => new Date(Date.now() + (snapshotRef.current?.clockOffset ?? 0)), []);

  const saveSnapshot = useCallback((next: StoredSnapshot) => {
    snapshotRef.current = next;
    writeJson(SNAPSHOT_KEY, next);
    setSnapshot(next);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/ronda", { cache: "no-store" });
      if (res.status === 401) {
        setStatus("auth");
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as RondaSnapshot;
      saveSnapshot({ ...data, clockOffset: new Date(data.serverTime).getTime() - Date.now() });
      setStatus((s) => (s === "syncing" ? s : "idle"));
    } catch {
      setStatus("offline");
    }
  }, [saveSnapshot]);

  /** Kirim antrean sekali. `false` kalau gagal (offline / perlu login). */
  const pushPending = useCallback(async (): Promise<boolean> => {
    const batch = pendingRef.current;
    if (batch.length === 0) return true;

    setStatus("syncing");
    try {
      const res = await fetch("/api/setoran", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entries: batch.map((e) => ({
            clientId: e.clientId,
            houseId: e.houseId,
            status: e.status,
            amount: e.amount,
            method: e.method,
            recordedAt: e.recordedAt,
          })),
        }),
      });
      if (res.status === 401) {
        setStatus("auth");
        return false;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { results } = (await res.json()) as { results: EntryResult[] };

      const done = new Set(results.map((r) => r.clientId));
      const houses = new Map(snapshotRef.current?.houses.map((h) => [h.id, h]));
      const failed: Rejection[] = [];
      for (const r of results) {
        if (r.ok) continue;
        const entry = batch.find((e) => e.clientId === r.clientId);
        const house = entry && houses.get(entry.houseId);
        failed.push({ clientId: r.clientId, label: house ? houseLabel(house) : "?", error: r.error });
      }
      // Catatan yang diterima langsung masuk salinan lokal, supaya kotak rumah tidak sempat
      // kembali ke "belum dicek" selama menunggu data terbaru (bisa lama kalau sinyal lemah).
      const serverDates = new Map(results.flatMap((r) => (r.ok ? [[r.clientId, r.date] as const] : [])));
      const accepted = batch.flatMap((e) => {
        const serverDate = serverDates.get(e.clientId);
        return serverDate ? [{ ...e, serverDate }] : [];
      });
      if (snapshotRef.current && accepted.length > 0) saveSnapshot(withAccepted(snapshotRef.current, accepted));
      // Hanya buang yang sudah diproses; catatan baru selama sinkron tetap di antrean.
      setPending((prev) => prev.filter((e) => !done.has(e.clientId)));
      if (failed.length > 0) setRejections((prev) => [...prev, ...failed]);
      setStatus("idle");
      return true;
    } catch {
      setStatus("offline");
      return false;
    }
  }, [saveSnapshot, setPending]);

  const sync = useCallback(async () => {
    if (syncingRef.current) {
      // Catatan baru masuk saat sinkron berjalan: kirim lagi begitu yang ini selesai.
      resyncRef.current = true;
      return;
    }
    syncingRef.current = true;
    try {
      do {
        resyncRef.current = false;
        if (!(await pushPending())) return;
        await refresh();
      } while (resyncRef.current);
    } finally {
      syncingRef.current = false;
    }
  }, [pushPending, refresh]);

  // Muat data tersimpan dulu (bisa offline), lalu ambil yang terbaru dari server.
  useEffect(() => {
    const storedSnapshot = readJson<StoredSnapshot>(SNAPSHOT_KEY);
    const storedPending = readJson<PendingEntry[]>(PENDING_KEY) ?? [];
    snapshotRef.current = storedSnapshot;
    pendingRef.current = storedPending;
    /* eslint-disable react-hooks/set-state-in-effect -- localStorage hanya bisa dibaca setelah mount */
    setSnapshot(storedSnapshot);
    setPendingState(storedPending);
    setLoaded(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    sync();
  }, [sync]);

  useEffect(() => {
    const onOnline = () => sync();
    const onVisible = () => {
      if (document.visibilityState === "visible") sync();
    };
    const timer = setInterval(() => {
      setNow(Date.now());
      if (document.visibilityState === "visible") sync();
    }, POLL_MS);
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [sync]);

  /** Malam ronda yang sedang berjalan menurut jam server. */
  const date = useMemo(() => rondaDate(new Date(now + clockOffset)), [now, clockOffset]);

  const collections = useMemo(() => {
    const map = new Map<number, MergedCollection>();
    if (snapshot?.date === date) {
      for (const c of snapshot.collections) map.set(c.houseId, { ...c, pending: false });
    }
    for (const p of pending) {
      if (p.date !== date) continue;
      if (p.status === "none") {
        map.delete(p.houseId);
      } else {
        map.set(p.houseId, {
          houseId: p.houseId,
          status: p.status,
          amount: p.amount,
          method: p.method,
          recordedAt: p.recordedAt,
          collectorName: p.collectorName,
          pending: true,
        });
      }
    }
    return map;
  }, [snapshot, pending, date]);

  const record = useCallback(
    (house: HouseDTO, entryStatus: CollectionStatus | "none", amount: number, method: CollectionMethod) => {
      const at = serverNow();
      const entry: PendingEntry = {
        clientId: newClientId(),
        houseId: house.id,
        status: entryStatus,
        amount: entryStatus === "filled" ? amount : 0,
        method,
        recordedAt: at.toISOString(),
        date: rondaDate(at),
        collectorName: snapshotRef.current?.user.name ?? "",
      };
      // Catatan terbaru untuk rumah & malam yang sama menggantikan yang lama di antrean.
      setPending((prev) => [...prev.filter((p) => !(p.houseId === house.id && p.date === entry.date)), entry]);
      setNow(Date.now());
      sync();
    },
    [serverNow, setPending, sync],
  );

  const dismissRejections = useCallback(() => setRejections([]), []);

  return {
    loaded,
    snapshot,
    date,
    collections,
    pendingCount: pending.length,
    status,
    rejections,
    dismissRejections,
    record,
    sync,
  };
}
