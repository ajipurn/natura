import {
  Box,
  CheckCircle2,
  CloudOff,
  CloudUpload,
  History,
  LayoutGrid,
  LogIn,
  Map as MapIcon,
  RefreshCw,
  ScanLine,
  Search,
  ShieldAlert,
} from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { QrScanner } from "@/components/qr-scanner";
import { ShareRecap } from "@/components/share-recap";
import { PlanWithLocation } from "@/components/plan-with-location";
import { ThemeButton } from "@/components/theme-toggle";
import { SegmentedControl } from "@/components/toggle-group";
import { Alert, Button, Card, buttonClass, cx } from "@/components/ui";
import { formatDateLong, formatTime } from "@/lib/dates";
import { formatRupiah } from "@/lib/format";
import type { MarkerState } from "@/lib/house-state";
import { houseLabel } from "@/lib/houses";
import { parseQrToken } from "@/lib/qr";
import { buildRecapText, summarize } from "@/lib/recap";
import { DAY_NAMES, dayLabel, scheduleDay } from "@/lib/schedule";
import { matchPlan } from "@/lib/site-plan";
import { SITE_PLAN } from "@/site-plan";
import type { CollectionMethod, CollectionStatus, HouseDTO } from "@/lib/types";
import { HouseList, type ListFilter } from "./house-list";
import { HouseSearch } from "./house-search";
import { HouseSheet } from "./house-sheet";
import { TonightGuards } from "./tonight-guards";
import { useRondaStore, type MergedCollection, type SyncStatus } from "./use-ronda-store";

type Toast = { text: string; tone: "ok" | "error" };
type View = "list" | "map" | "3d";

const VIEW_KEY = "jimpitan:ronda-view";

const VIEWS = [
  { value: "list", label: "Daftar", icon: LayoutGrid },
  { value: "map", label: "Denah", icon: MapIcon },
  { value: "3d", label: "3D", icon: Box },
] as const;

// three.js cukup besar; hanya diunduh saat tab 3D dibuka.
const SiteMap3D = lazy(() => import("@/components/site-map-3d"));

function Loading3D() {
  return (
    <div className="flex aspect-[4/3] max-h-[60vh] min-h-72 items-center justify-center rounded-2xl border border-line bg-card text-muted">
      Memuat tampilan 3D…
    </div>
  );
}

export function RondaApp({ isAdmin }: { isAdmin: boolean }) {
  const store = useRondaStore();
  const [scannerOpen, setScannerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [active, setActive] = useState<{ house: HouseDTO; method: CollectionMethod } | null>(null);
  const [filter, setFilter] = useState<ListFilter>("belum");
  const [view, setView] = useState<View>("list");
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const snapshot = store.snapshot;
  const houses = useMemo(() => snapshot?.houses ?? [], [snapshot]);
  const byToken = useMemo(() => new Map(houses.map((h) => [h.token, h])), [houses]);
  const collectionList = useMemo(() => [...store.collections.values()], [store.collections]);
  const summary = useMemo(() => summarize(houses, collectionList), [houses, collectionList]);
  // Catatan terbaru malam ini (dari siapa pun), untuk baris "Terakhir".
  const lastEntry = useMemo(() => {
    const entry = collectionList.reduce<MergedCollection | null>(
      (latest, c) => (!latest || c.recordedAt > latest.recordedAt ? c : latest),
      null,
    );
    const house = entry && houses.find((h) => h.id === entry.houseId);
    return entry && house ? { entry, house } : null;
  }, [collectionList, houses]);
  // Rumah yang tampil di denah (cocok blok+nomor dengan kavling di denah).
  const placedCount = useMemo(() => matchPlan(SITE_PLAN, houses).lotHouse.size, [houses]);
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

  // Hanya yang dijadwalkan jaga malam ini yang bisa scan/catat, admin juga (server juga memeriksa).
  const mySchedule = (snapshot?.schedule ?? []).filter((e) => e.userId === snapshot?.user.id);
  const onDuty = mySchedule.some((e) => e.day === scheduleDay(store.date));
  const canRecord = onDuty;

  function openHouse(house: HouseDTO) {
    if (canRecord) setActive({ house, method: "manual" });
    else showToast("Bukan jadwal jagamu malam ini.", "error");
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
          <Button onClick={() => store.sync()} className="mt-4">
            <RefreshCw className="size-5" /> Coba lagi
          </Button>
        </Card>
      </div>
    );
  }

  const viewSwitch = (
    <SegmentedControl
      aria-label="Tampilan"
      fill
      value={view}
      onValueChange={changeView}
      options={VIEWS}
      className="[&>button]:h-11"
    />
  );
  const allDone = summary.unchecked.length === 0 && summary.checked > 0;
  const recap = (
    <ShareRecap
      text={buildRecapText({
        communityName: snapshot.settings.communityName,
        date: store.date,
        houses,
        collections: collectionList,
      })}
    />
  );

  return (
    <main>
      {/* Ringkasan tetap menempel di atas pada semua ukuran layar. */}
      <>
        <div className="sticky top-0 z-20 -mx-4 -mt-5 bg-bg px-4 pb-2 pt-3">
          <div className="rounded-2xl border border-line bg-card p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-base font-bold leading-tight">Ronda malam ini</h1>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <SyncChip status={store.status} pendingCount={store.pendingCount} onRetry={() => store.sync()} />
                {/* Ronda di luar malam hari: mode gelap cukup sekali ketuk dari sini. */}
                <ThemeButton />
              </div>
            </div>
            <p className="mt-1 text-xs text-muted">{formatDateLong(store.date)}</p>
            {houses.length > 0 && (
              <>
                <div className="mt-2 flex items-baseline justify-between">
                  <p className="text-sm text-muted">
                    <strong className="text-2xl text-fg">{summary.checked}</strong> / {summary.expected} dicek
                  </p>
                  <p className="text-xl font-bold">{formatRupiah(summary.total)}</p>
                </div>
                <div
                  className="mt-2 flex h-2 overflow-hidden rounded-full bg-idle-soft"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={summary.expected}
                  aria-valuenow={summary.checked}
                  aria-label="Progres ronda"
                >
                  <div className="h-full bg-filled transition-all" style={{ width: `${percent(summary.filled.length, summary.expected)}%` }} />
                  <div className="h-full bg-empty transition-all" style={{ width: `${percent(summary.empty.length, summary.expected)}%` }} />
                </div>
                {/* Titik warnanya sama dengan bilah progres dan kotak rumah. */}
                <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">
                  <LegendItem swatch="bg-filled">Ada {summary.filled.length}</LegendItem>
                  <LegendItem swatch="bg-empty">Kosong {summary.empty.length}</LegendItem>
                  <LegendItem swatch="border border-line bg-idle-soft">Belum {summary.unchecked.length}</LegendItem>
                  {summary.vacant.length > 0 && (
                    <LegendItem swatch="border border-dashed border-muted/60">Mudik {summary.vacant.length}</LegendItem>
                  )}
                </p>
              </>
            )}
          </div>
        </div>

        <div className="mt-1 space-y-3">
          <StatusNotice status={store.status} />
          {/* Data lama di HP (sebelum ada jadwal) belum punya `schedule`. */}
          <TonightGuards schedule={snapshot.schedule ?? []} date={store.date} userId={snapshot.user.id} />
          {!canRecord && (
            <div className="flex gap-3 rounded-2xl border border-warn/40 bg-warn-soft p-3 text-sm text-warn" role="note">
              <ShieldAlert className="size-5 shrink-0" aria-hidden />
              <div>
                <p className="font-semibold">Bukan jadwal jagamu malam ini</p>
                <p className="mt-0.5">
                  Pencatatan dibuka untuk petugas yang jaga {dayLabel(scheduleDay(store.date))}.
                </p>
                <p className="mt-2">
                  {mySchedule.length > 0
                    ? `Jadwalmu: ${[...new Set(mySchedule.map((e) => e.day))]
                        .sort()
                        .map((d) => DAY_NAMES[d])
                        .join(", ")}.`
                    : "Kamu belum dijadwalkan."}
                </p>
                {isAdmin && (
                  <p className="mt-1 text-xs">Koreksi catatan tersedia di Riwayat pada dashboard admin.</p>
                )}
                <Link to="/petugas/jadwal" className="mt-2 inline-block font-semibold underline">
                  Lihat jadwal atau minta ubah jadwal
                </Link>
              </div>
            </div>
          )}
          {store.rejections.length > 0 && (
            <Alert>
              <span className="block font-semibold">Beberapa catatan ditolak server:</span>
              {store.rejections.map((r) => (
                <span key={r.clientId} className="block">
                  {r.label}: {r.error}
                </span>
              ))}
              <Button variant="plain" onClick={store.dismissRejections} className="mt-1 font-semibold underline">
                Tutup
              </Button>
            </Alert>
          )}
          {lastEntry && (
            <LastEntry
              house={lastEntry.house}
              entry={lastEntry.entry}
              mine={lastEntry.entry.collectorName === snapshot.user.name}
              onEdit={canRecord ? () => setActive({ house: lastEntry.house, method: "manual" }) : undefined}
            />
          )}
        </div>
      </>

      <section aria-label="Rumah" className="mt-5">
        {houses.length === 0 ? (
          <Card className="text-center">
            <p className="font-semibold">Belum ada data rumah</p>
            <p className="mt-1 text-sm text-muted">Admin perlu menambahkan rumah dan mencetak QR-nya dulu.</p>
            {isAdmin && (
              <a href="/admin/rumah" className={cx(buttonClass("primary"), "mt-4")}>
                Tambah rumah
              </a>
            )}
          </Card>
        ) : (
          <>
            <div className="mb-4 space-y-3">
              {viewSwitch}
              {view === "list" && (
                <SegmentedControl
                  aria-label="Saring rumah"
                  fill
                  value={filter}
                  onValueChange={setFilter}
                  options={(
                    [
                      ["belum", "Belum", summary.unchecked.length],
                      ["sudah", "Sudah", summary.checked],
                      ["semua", "Semua", houses.length],
                    ] as const
                  ).map(([value, label, count]) => ({
                    value,
                    label: (
                      <>
                        {label} <span className="text-xs font-normal">{count}</span>
                      </>
                    ),
                    className: "px-2",
                  }))}
                  className="[&>button]:h-11"
                />
              )}
            </div>

            {view !== "list" ? (
              placedCount === 0 ? (
                <Card className="text-center">
                  <MapIcon className="mx-auto size-10 text-muted" />
                  <p className="mt-2 font-semibold">Rumah belum terdaftar</p>
                  <p className="mt-1 text-sm text-muted">Admin perlu mendaftarkan rumah dari denah dulu.</p>
                  {isAdmin && (
                    <a href="/admin/rumah?tampilan=denah" className={cx(buttonClass("primary"), "mt-4")}>
                      Buka Rumah & QR di admin
                    </a>
                  )}
                </Card>
              ) : (
                <>
                  {view === "map" ? (
                    <PlanWithLocation
                      plan={SITE_PLAN}
                      houses={houses}
                      markers={markers}
                      pending={pendingIds}
                      onHouseClick={openHouse}
                      anchors={snapshot.planAnchors ?? []}
                      calibrateHint={
                        isAdmin ? (
                          <a href="/admin/rumah?tampilan=denah&lokasi=1" className="font-semibold underline">
                            Atur di Admin → Rumah & QR
                          </a>
                        ) : (
                          "Minta admin mengaturnya."
                        )
                      }
                    />
                  ) : (
                    <Suspense fallback={<Loading3D />}>
                      <SiteMap3D houses={houses} plan={SITE_PLAN} markers={markers} onHouseClick={openHouse} />
                    </Suspense>
                  )}
                  {placedCount < houses.length && (
                    <p className="mt-2 text-sm text-muted">
                      {houses.length - placedCount} rumah belum ada di denah — lihat tampilan Daftar.
                    </p>
                  )}
                </>
              )
            ) : filter === "belum" && summary.unchecked.length === 0 ? (
              <Card className="text-center">
                <CheckCircle2 className="mx-auto size-10 text-filled" />
                <p className="mt-2 font-semibold">{allDone ? "Semua rumah sudah dicek" : "Tidak ada rumah yang perlu dicek"}</p>
                {allDone && <p className="mt-1 text-sm text-muted">Kirim rekapnya ke grup warga.</p>}
                {allDone && <div className="mt-4">{recap}</div>}
              </Card>
            ) : (
              <HouseList houses={houses} collections={store.collections} filter={filter} onOpen={openHouse} />
            )}

            {/* Rekap bisa dibagikan kapan saja; saat semua selesai tombolnya ada di kartu di atas. */}
            {!(allDone && view === "list" && filter === "belum") && (
              <div className="mt-6 border-t border-line pt-4">
                <p className="mb-2 text-sm font-semibold">Rekap malam ini</p>
                {recap}
              </div>
            )}
          </>
        )}
      </section>

      {canRecord && houses.length > 0 && (
        <>
          {/* Ruang supaya bagian bawah daftar tidak tertutup bar aksi. */}
          <div className="h-16" aria-hidden />
          {/* Bar aksi menempel tepat di atas navigasi bawah (tingginya h-14, lihat PetugasLayout). */}
          <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+3.5rem)] z-20 border-t border-line bg-card/95 py-2 backdrop-blur">
            <div className="mx-auto flex max-w-3xl gap-2 px-4">
              <ActionButtons onSearch={() => setSearchOpen(true)} onScan={() => setScannerOpen(true)} />
            </div>
          </div>
        </>
      )}

      {scannerOpen && canRecord && (
        <QrScanner
          paused={active !== null || searchOpen}
          onDetect={handleDetect}
          onClose={() => setScannerOpen(false)}
          onManual={() => setSearchOpen(true)}
        />
      )}

      {searchOpen && canRecord && (
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

      {active && canRecord && (
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
    </main>
  );
}

const percent = (part: number, whole: number) => (whole ? (part / whole) * 100 : 0);

function ActionButtons({ onSearch, onScan }: { onSearch: () => void; onScan: () => void }) {
  return (
    <>
      {/* Ukuran teks, ikon, dan bayangannya sama; tepi Cari dipertegas supaya tidak tampak lebih kecil
          di samping tombol yang berwarna penuh. */}
      <Button onClick={onSearch} variant="secondary" className="h-12 shrink-0 border-fg/15 px-4 text-lg shadow-sm">
        <Search className="size-5" /> Cari
      </Button>
      <Button onClick={onScan} variant="primary" className="h-12 flex-1 text-lg">
        <ScanLine className="size-5" /> Scan QR
      </Button>
    </>
  );
}

/** Catatan terakhir malam ini, supaya salah ketuk bisa langsung dibetulkan. */
function LastEntry({
  house,
  entry,
  mine,
  onEdit,
}: {
  house: HouseDTO;
  entry: MergedCollection;
  mine: boolean;
  onEdit?: () => void;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-2xl border border-line bg-card px-3 py-2.5 text-sm">
      <History className="size-4 shrink-0 text-muted" aria-hidden />
      <p className="min-w-0 flex-1 truncate">
        <span className="text-muted">Terakhir: </span>
        <strong>{houseLabel(house)}</strong>{" "}
        <span className={entry.status === "filled" ? "text-filled" : "text-empty"}>
          {entry.status === "filled" ? formatRupiah(entry.amount) : "kosong"}
        </span>
        <span className="text-muted">
          {" "}
          · {formatTime(entry.recordedAt)}
          {!mine && entry.collectorName && ` · ${entry.collectorName}`}
          {entry.pending && " · belum terkirim"}
        </span>
      </p>
      {onEdit && (
        <Button variant="plain" onClick={onEdit} className="shrink-0 font-semibold text-primary">
          Ubah
        </Button>
      )}
    </div>
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
    <Button
      variant="plain"
      onClick={onRetry}
      className={cx(
        "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold",
        pendingCount > 0 || offline ? "bg-warn-soft text-warn" : "bg-filled-soft text-filled",
      )}
      title="Kirim ulang sekarang"
    >
      {offline ? <CloudOff className="size-4" /> : <CloudUpload className="size-4" />}
      {label}
    </Button>
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
        <Link to="/petugas/masuk?next=/petugas" className="mt-2 inline-flex items-center gap-1 font-semibold underline">
          <LogIn className="size-4" /> Masuk lagi
        </Link>
      </div>
    </div>
  );
}

function LegendItem({ swatch, children }: { swatch: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span aria-hidden className={cx("size-2 shrink-0 rounded-full", swatch)} />
      {children}
    </span>
  );
}
