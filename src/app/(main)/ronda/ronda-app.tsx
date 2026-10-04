"use client";

import {
  Box,
  CloudOff,
  CloudUpload,
  Keyboard,
  LayoutGrid,
  LogIn,
  Map as MapIcon,
  RefreshCw,
  ScanLine,
  ShieldAlert,
} from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { QrScanner } from "@/components/qr-scanner";
import { ShareRecap } from "@/components/share-recap";
import { SiteMap, type MarkerState } from "@/components/site-map";
import { SitePlanMap } from "@/components/site-plan-map";
import { Alert, Card, buttonClass, cx } from "@/components/ui";
import { formatDateLong } from "@/lib/dates";
import { formatAmountShort, formatRupiah } from "@/lib/format";
import { groupByBlock, houseLabel, houseLabelLong } from "@/lib/houses";
import { parseQrToken } from "@/lib/qr";
import { buildRecapText, summarize } from "@/lib/recap";
import { DEFAULT_MAP_SIZE } from "@/lib/site-map";
import { matchPlan } from "@/lib/site-plan";
import { SITE_PLAN } from "@/site-plan";
import type { CollectionMethod, CollectionStatus, HouseDTO } from "@/lib/types";
import { HouseSearch } from "./house-search";
import { HouseSheet } from "./house-sheet";
import { useRondaStore, type MergedCollection, type SyncStatus } from "./use-ronda-store";

type Toast = { text: string; tone: "ok" | "error" };
type View = "list" | "map" | "3d";

const VIEW_KEY = "jimpitan:ronda-view";

// three.js cukup besar; hanya diunduh saat tab 3D dibuka.
const SiteMap3D = dynamic(() => import("@/components/site-map-3d"), {
  ssr: false,
  loading: () => (
    <div className="flex aspect-[4/3] max-h-[60vh] min-h-72 items-center justify-center rounded-2xl border border-line bg-card text-muted">
      Memuat tampilan 3D…
    </div>
  ),
});

export function RondaApp({ isAdmin }: { isAdmin: boolean }) {
  const store = useRondaStore();
  const [scannerOpen, setScannerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [active, setActive] = useState<{ house: HouseDTO; method: CollectionMethod } | null>(null);
  const [onlyUnchecked, setOnlyUnchecked] = useState(false);
  const [view, setView] = useState<View>("list");
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const snapshot = store.snapshot;
  const houses = useMemo(() => snapshot?.houses ?? [], [snapshot]);
  const byToken = useMemo(() => new Map(houses.map((h) => [h.token, h])), [houses]);
  const collectionList = useMemo(() => [...store.collections.values()], [store.collections]);
  const summary = useMemo(() => summarize(houses, collectionList), [houses, collectionList]);
  const groups = useMemo(() => groupByBlock(houses), [houses]);
  const siteMap = snapshot?.siteMap ?? { imageUrl: null, ...DEFAULT_MAP_SIZE };
  // Rumah yang tampil di denah: dari denah kode (cocok blok+nomor) atau dari penanda denah manual.
  const placedCount = useMemo(
    () =>
      SITE_PLAN
        ? matchPlan(SITE_PLAN, houses).lotHouse.size
        : houses.filter((h) => h.mapX != null && h.mapY != null).length,
    [houses],
  );
  const markers = useMemo(() => {
    const result: Record<number, MarkerState> = {};
    for (const h of houses) {
      result[h.id] = store.collections.get(h.id)?.status ?? (h.status === "vacant" ? "vacant" : "unchecked");
    }
    return result;
  }, [houses, store.collections]);
  const pendingIds = useMemo(
    () => new Set(collectionList.filter((c) => c.pending).map((c) => c.houseId)),
    [collectionList],
  );

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(VIEW_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- pilihan tampilan tersimpan di HP
      if (saved === "map" || saved === "3d") setView(saved);
    } catch {}
  }, []);

  // Ambil gambar denah sekali saat online supaya ikut tersimpan untuk dipakai offline.
  useEffect(() => {
    if (siteMap.imageUrl) fetch(siteMap.imageUrl).catch(() => {});
  }, [siteMap.imageUrl]);

  function changeView(next: View) {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {}
  }

  function showToast(text: string, tone: Toast["tone"] = "ok") {
    clearTimeout(toastTimer.current);
    setToast({ text, tone });
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  }

  function handleDetect(text: string) {
    const token = parseQrToken(text);
    const house = token ? byToken.get(token) : undefined;
    if (!house) {
      showToast(
        token ? "QR rumah tidak dikenal. Coba lagi atau ketik manual." : "Ini bukan QR jimpitan.",
        "error",
      );
      if (token) store.sync();
      return;
    }
    setActive({ house, method: "scan" });
  }

  function handleRecord(status: CollectionStatus | "none", amount: number) {
    if (!active) return;
    store.record(active.house, status, amount, active.method);
    const label = houseLabel(active.house);
    showToast(
      status === "filled"
        ? `${label} ✓ Ada ${formatRupiah(amount)}`
        : status === "empty"
          ? `${label} dicatat kosong`
          : `Catatan ${label} dihapus`,
    );
    setActive(null);
  }

  if (!store.loaded) {
    return <p className="py-20 text-center text-muted">Memuat…</p>;
  }

  if (!snapshot) {
    return (
      <div className="py-12">
        <StatusNotice status={store.status} />
        <Card className="text-center">
          <CloudOff className="mx-auto size-10 text-muted" />
          <p className="mt-3 font-semibold">Data rumah belum terunduh</p>
          <p className="mt-1 text-sm text-muted">Sambungkan internet sekali supaya halaman ini bisa dipakai offline.</p>
          <button type="button" onClick={() => store.sync()} className={cx(buttonClass("primary"), "mt-4")}>
            <RefreshCw className="size-5" /> Coba lagi
          </button>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <header className="mb-4">
        <div className="flex items-center justify-between gap-3">
          <p className="truncate text-sm font-medium text-primary">Jimpitan {snapshot.settings.communityName}</p>
          <SyncChip status={store.status} pendingCount={store.pendingCount} onRetry={() => store.sync()} />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Ronda malam ini</h1>
        <p className="text-sm text-muted">{formatDateLong(store.date)}</p>
      </header>

      <StatusNotice status={store.status} />
      {store.rejections.length > 0 && (
        <div className="mb-4">
          <Alert>
            <span className="block font-semibold">Beberapa catatan ditolak server:</span>
            {store.rejections.map((r) => (
              <span key={r.clientId} className="block">
                {r.label}: {r.error}
              </span>
            ))}
            <button type="button" onClick={store.dismissRejections} className="mt-1 font-semibold underline">
              Tutup
            </button>
          </Alert>
        </div>
      )}

      {houses.length === 0 ? (
        <Card className="text-center">
          <p className="font-semibold">Belum ada data rumah</p>
          <p className="mt-1 text-sm text-muted">Admin perlu menambahkan rumah dan mencetak QR-nya dulu.</p>
          {isAdmin && (
            <Link href="/admin/rumah" className={cx(buttonClass("primary"), "mt-4")}>
              Tambah rumah
            </Link>
          )}
        </Card>
      ) : (
        <>
          <Card>
            <div className="flex items-baseline justify-between">
              <p className="text-sm text-muted">
                <strong className="text-2xl text-fg">{summary.checked}</strong> / {summary.expected} rumah dicek
              </p>
              <p className="text-xl font-bold">{formatRupiah(summary.total)}</p>
            </div>
            <div
              className="mt-3 h-2.5 overflow-hidden rounded-full bg-idle-soft"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={summary.expected}
              aria-valuenow={summary.checked}
              aria-label="Progres ronda"
            >
              <div
                className="h-full rounded-full bg-filled transition-all"
                style={{ width: `${summary.expected ? (summary.checked / summary.expected) * 100 : 0}%` }}
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <Legend className="bg-filled" label={`Ada ${summary.filled.length}`} />
              <Legend className="bg-empty" label={`Kosong ${summary.empty.length}`} />
              <Legend className="border border-line bg-card" label={`Belum ${summary.unchecked.length}`} />
              {summary.vacant.length > 0 && (
                <Legend className="border border-dashed border-muted" label={`Mudik ${summary.vacant.length}`} />
              )}
            </div>
            <ShareRecap
              className="mt-4"
              text={buildRecapText({
                communityName: snapshot.settings.communityName,
                date: store.date,
                houses,
                collections: collectionList,
              })}
            />
          </Card>

          <div className="mt-5 flex items-center justify-between gap-3">
            <div role="tablist" aria-label="Tampilan" className="flex rounded-xl border border-line bg-card p-0.5">
              {(
                [
                  ["list", "Daftar", LayoutGrid],
                  ["map", "Denah", MapIcon],
                  ["3d", "3D", Box],
                ] as const
              ).map(([value, label, Icon]) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={view === value}
                  onClick={() => changeView(value)}
                  className={cx(
                    "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold",
                    view === value ? "bg-primary text-primary-fg" : "text-muted",
                  )}
                >
                  <Icon className="size-4" /> {label}
                </button>
              ))}
            </div>
            {view === "list" && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={onlyUnchecked}
                  onChange={(e) => setOnlyUnchecked(e.target.checked)}
                  className="size-4 accent-[var(--primary)]"
                />
                Yang belum saja
              </label>
            )}
          </div>

          {view !== "list" ? (
            <div className="mt-3">
              {placedCount === 0 ? (
                <Card className="text-center">
                  <MapIcon className="mx-auto size-10 text-muted" />
                  <p className="mt-2 font-semibold">{SITE_PLAN ? "Rumah belum terdaftar" : "Denah belum diatur"}</p>
                  <p className="mt-1 text-sm text-muted">
                    {SITE_PLAN
                      ? "Admin perlu mendaftarkan rumah dari denah dulu."
                      : "Admin perlu menaruh rumah-rumah di denah dulu."}
                  </p>
                  {isAdmin && (
                    <Link href="/admin/denah" className={cx(buttonClass("primary"), "mt-4")}>
                      Atur denah
                    </Link>
                  )}
                </Card>
              ) : (
                <>
                  {view === "map" && SITE_PLAN ? (
                    <SitePlanMap
                      plan={SITE_PLAN}
                      houses={houses}
                      markers={markers}
                      pending={pendingIds}
                      onHouseClick={(h) => setActive({ house: h, method: "manual" })}
                    />
                  ) : view === "map" ? (
                    <SiteMap
                      houses={houses}
                      size={siteMap}
                      imageUrl={siteMap.imageUrl}
                      markers={markers}
                      pending={pendingIds}
                      onHouseClick={(h) => setActive({ house: h, method: "manual" })}
                    />
                  ) : (
                    <SiteMap3D
                      houses={houses}
                      plan={SITE_PLAN}
                      size={siteMap}
                      imageUrl={siteMap.imageUrl}
                      markers={markers}
                      onHouseClick={(h) => setActive({ house: h, method: "manual" })}
                    />
                  )}
                  {placedCount < houses.length && (
                    <p className="mt-2 text-sm text-muted">
                      {houses.length - placedCount} rumah belum ada di denah — lihat tampilan Daftar.
                    </p>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="mt-2 space-y-4">
              {groups.map(([block, list]) => {
                const visible = onlyUnchecked
                  ? list.filter((h) => h.status === "active" && !store.collections.has(h.id))
                  : list;
                if (visible.length === 0) return null;
                const checked = list.filter((h) => store.collections.has(h.id)).length;
                return (
                  <section key={block}>
                    <h3 className="mb-2 flex items-baseline justify-between font-semibold">
                      Blok {block}
                      <span className="text-sm font-normal text-muted">
                        {checked}/{list.length}
                      </span>
                    </h3>
                    <div className="grid grid-cols-5 gap-2 sm:grid-cols-8">
                      {visible.map((h) => (
                        <HouseTile
                          key={h.id}
                          house={h}
                          collection={store.collections.get(h.id)}
                          onClick={() => setActive({ house: h, method: "manual" })}
                        />
                      ))}
                    </div>
                  </section>
                );
              })}
              {onlyUnchecked && summary.unchecked.length === 0 && (
                <p className="py-6 text-center text-muted">Semua rumah sudah dicek 🎉</p>
              )}
            </div>
          )}
          {/* Ruang supaya baris terakhir tidak tertutup tombol Manual / Scan QR. */}
          <div className="h-20" aria-hidden />

          <div className="fixed bottom-[calc(env(safe-area-inset-bottom)+76px)] left-1/2 z-20 flex -translate-x-1/2 items-center gap-2">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="flex h-14 items-center gap-1.5 rounded-full border border-line bg-card px-4 font-semibold text-fg shadow-lg shadow-black/20 active:scale-[0.97]"
            >
              <Keyboard className="size-5" /> Manual
            </button>
            <button
              type="button"
              onClick={() => setScannerOpen(true)}
              className="flex h-14 items-center gap-2 whitespace-nowrap rounded-full bg-primary px-7 text-lg font-bold text-primary-fg shadow-lg shadow-black/20 active:scale-[0.97]"
            >
              <ScanLine className="size-6" /> Scan QR
            </button>
          </div>
        </>
      )}

      {scannerOpen && (
        <QrScanner
          paused={active !== null || searchOpen}
          onDetect={handleDetect}
          onClose={() => setScannerOpen(false)}
          onManual={() => setSearchOpen(true)}
        />
      )}

      {searchOpen && (
        <HouseSearch
          houses={houses}
          collections={store.collections}
          onPick={(house) => {
            setSearchOpen(false);
            setActive({ house, method: "manual" });
          }}
          onClose={() => setSearchOpen(false)}
        />
      )}

      {active && (
        <HouseSheet
          key={`${active.house.id}-${active.method}`}
          house={active.house}
          existing={store.collections.get(active.house.id)}
          defaultAmount={snapshot.settings.defaultAmount}
          method={active.method}
          onRecord={handleRecord}
          onClose={() => setActive(null)}
        />
      )}

      {toast && (
        <div
          role="status"
          className={cx(
            "fixed inset-x-4 top-[max(env(safe-area-inset-top),16px)] z-[60] mx-auto max-w-sm rounded-2xl px-4 py-3 text-center font-semibold shadow-lg",
            toast.tone === "ok" ? "bg-filled text-white dark:text-black" : "bg-empty text-white dark:text-black",
          )}
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cx("inline-block size-3 rounded", className)} />
      {label}
    </span>
  );
}

function HouseTile({
  house,
  collection,
  onClick,
}: {
  house: HouseDTO;
  collection: MergedCollection | undefined;
  onClick: () => void;
}) {
  const vacant = house.status === "vacant";
  const state = collection?.status ?? (vacant ? "vacant" : "unchecked");
  const stateText = {
    filled: `ada ${collection ? formatRupiah(collection.amount) : ""}`,
    empty: "kosong",
    vacant: "rumah kosong/mudik",
    unchecked: "belum dicek",
  }[state];

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${houseLabelLong(house)}, ${stateText}${collection?.pending ? ", belum terkirim" : ""}`}
      className={cx(
        "relative flex aspect-square flex-col items-center justify-center rounded-xl border-2 text-lg font-bold leading-none active:scale-95",
        state === "filled" && "border-filled bg-filled-soft text-filled",
        state === "empty" && "border-empty bg-empty-soft text-empty",
        state === "unchecked" && "border-line bg-card text-fg",
        state === "vacant" && "border-dashed border-muted/60 bg-transparent text-muted",
      )}
    >
      {house.number}
      {state === "filled" && collection && (
        <span className="mt-1 text-[10px] font-semibold">{formatAmountShort(collection.amount)}</span>
      )}
      {state === "empty" && <span className="mt-1 text-[10px] font-semibold">kosong</span>}
      {state === "vacant" && <span className="mt-1 text-[10px] font-medium">mudik</span>}
      {collection?.pending && <span className="absolute right-1 top-1 size-2 rounded-full bg-warn" aria-hidden />}
    </button>
  );
}

function SyncChip({
  status,
  pendingCount,
  onRetry,
}: {
  status: SyncStatus;
  pendingCount: number;
  onRetry: () => void;
}) {
  if (status === "auth") return null;
  const offline = status === "offline";
  const label =
    status === "syncing"
      ? "Mengirim…"
      : pendingCount > 0
        ? `${pendingCount} belum terkirim`
        : offline
          ? "Offline"
          : "Tersimpan";

  return (
    <button
      type="button"
      onClick={onRetry}
      className={cx(
        "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold",
        pendingCount > 0 || offline ? "bg-warn-soft text-warn" : "bg-filled-soft text-filled",
      )}
      title="Kirim ulang sekarang"
    >
      {offline ? <CloudOff className="size-4" /> : <CloudUpload className="size-4" />}
      {label}
    </button>
  );
}

function StatusNotice({ status }: { status: SyncStatus }) {
  if (status !== "auth") return null;
  return (
    <div className="mb-4 flex items-start gap-3 rounded-2xl bg-warn-soft p-3 text-sm text-warn">
      <ShieldAlert className="mt-0.5 size-5 shrink-0" />
      <div>
        <p className="font-semibold">Sesi login habis</p>
        <p>Catatan tetap aman di HP ini dan akan terkirim setelah kamu masuk lagi.</p>
        <Link href="/login?next=/ronda" className="mt-2 inline-flex items-center gap-1 font-semibold underline">
          <LogIn className="size-4" /> Masuk lagi
        </Link>
      </div>
    </div>
  );
}
