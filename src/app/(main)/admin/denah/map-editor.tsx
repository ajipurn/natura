"use client";

import { ImageUp, LayoutGrid, MapPinOff, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { SiteMap, type MarkerState } from "@/components/site-map";
import { Alert, Card, buttonClass, cx } from "@/components/ui";
import { compareHouses, groupByBlock, houseLabel } from "@/lib/houses";
import { autoLayout, type MapPoint, type MapSize } from "@/lib/site-map";
import type { HouseDTO, SiteMapInfo } from "@/lib/types";
import { saveSiteMapLayout } from "./actions";

type Positions = Record<number, MapPoint | null>;
type Message = { tone: "error" | "success" | "info"; text: string };

function positionsFrom(houses: HouseDTO[]): Positions {
  return Object.fromEntries(
    houses.map((h) => [h.id, h.mapX != null && h.mapY != null ? { x: h.mapX, y: h.mapY } : null]),
  );
}

/** Rumah berikutnya (urut blok/nomor) yang belum ditaruh, mulai setelah `afterId`. */
function nextUnplaced(sorted: HouseDTO[], positions: Positions, afterId: number | null): number | null {
  const start = afterId == null ? 0 : sorted.findIndex((h) => h.id === afterId) + 1;
  for (let i = 0; i < sorted.length; i++) {
    const h = sorted[(start + i) % sorted.length];
    if (!positions[h.id]) return h.id;
  }
  return null;
}

/** Perkecil gambar di HP sebelum diunggah (maks. 2000 px, JPEG). */
async function resizeImage(file: File, maxSide = 2000) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const width = Math.round(img.naturalWidth * scale);
    const height = Math.round(img.naturalHeight * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob gagal"))), "image/jpeg", 0.85),
    );
    return { blob, width, height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function MapEditor({ houses, info }: { houses: HouseDTO[]; info: SiteMapInfo }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const sorted = useMemo(() => [...houses].sort(compareHouses), [houses]);
  const [positions, setPositions] = useState<Positions>(() => positionsFrom(houses));
  const [sizeOverride, setSizeOverride] = useState<MapSize | null>(null);
  const [dirty, setDirty] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(() =>
    nextUnplaced(sorted, positionsFrom(houses), null),
  );
  const [busy, setBusy] = useState<"save" | "upload" | "delete" | null>(null);
  const [message, setMessage] = useState<Message | null>(null);

  const size: MapSize = info.imageUrl
    ? { width: info.width, height: info.height }
    : (sizeOverride ?? { width: info.width, height: info.height });
  const mapHouses = sorted.map((h) => ({ ...h, mapX: positions[h.id]?.x ?? null, mapY: positions[h.id]?.y ?? null }));
  const placedCount = sorted.filter((h) => positions[h.id]).length;
  const selected = sorted.find((h) => h.id === selectedId) ?? null;
  const markers = Object.fromEntries(sorted.map((h) => [h.id, "neutral" as MarkerState]));

  // Jangan sampai posisi yang belum disimpan hilang karena halaman ditutup.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function place(point: MapPoint) {
    if (selectedId == null) {
      setMessage({ tone: "info", text: "Pilih rumah dulu (di daftar bawah atau di denah), lalu ketuk lokasinya." });
      return;
    }
    const wasPlaced = positions[selectedId] != null;
    const next = { ...positions, [selectedId]: point };
    setPositions(next);
    setDirty(true);
    setMessage(null);
    // Rumah baru: lanjut ke rumah berikutnya supaya bisa ketuk-ketuk cepat. Memindah: selesai.
    setSelectedId(wasPlaced ? null : nextUnplaced(sorted, next, selectedId));
  }

  function arrange() {
    if (placedCount > 0 && !window.confirm("Susun ulang posisi SEMUA rumah secara otomatis?")) return;
    const result = autoLayout(sorted, info.imageUrl ? size : undefined);
    setPositions(Object.fromEntries(sorted.map((h) => [h.id, result.positions.get(h.id) ?? null])));
    if (!info.imageUrl) setSizeOverride(result.size);
    setDirty(true);
    setSelectedId(null);
    setMessage({ tone: "info", text: "Rumah disusun per blok. Pindahkan yang tidak pas, lalu simpan." });
  }

  function unplace() {
    if (selectedId == null) return;
    setPositions({ ...positions, [selectedId]: null });
    setDirty(true);
  }

  function discard() {
    setPositions(positionsFrom(houses));
    setSizeOverride(null);
    setDirty(false);
    setSelectedId(null);
    setMessage(null);
  }

  async function save() {
    setBusy("save");
    try {
      const result = await saveSiteMapLayout({
        positions: sorted.map((h) => ({ id: h.id, x: positions[h.id]?.x ?? null, y: positions[h.id]?.y ?? null })),
        size: info.imageUrl ? null : size,
      });
      if (result.error) {
        setMessage({ tone: "error", text: result.error });
      } else {
        setDirty(false);
        setMessage({ tone: "success", text: "Denah tersimpan." });
      }
    } catch {
      setMessage({ tone: "error", text: "Gagal menyimpan. Periksa koneksi lalu coba lagi." });
    } finally {
      setBusy(null);
    }
  }

  async function upload(file: File) {
    setBusy("upload");
    setMessage(null);
    try {
      const { blob, width, height } = await resizeImage(file);
      const res = await fetch(`/api/denah/gambar?w=${width}&h=${height}`, {
        method: "POST",
        headers: { "Content-Type": blob.type },
        body: blob,
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setMessage({ tone: "error", text: body?.error ?? "Gagal mengunggah gambar." });
        return;
      }
      setMessage({
        tone: "success",
        text:
          placedCount > 0
            ? "Gambar denah tersimpan. Periksa posisi rumah dan geser yang tidak pas."
            : "Gambar denah tersimpan. Sekarang taruh rumah-rumah di atasnya.",
      });
      router.refresh();
    } catch {
      setMessage({ tone: "error", text: "Gambar tidak bisa dibaca. Coba file JPG atau PNG." });
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function removeImage() {
    if (!window.confirm("Hapus gambar denah? Posisi rumah tetap disimpan.")) return;
    setBusy("delete");
    try {
      const res = await fetch("/api/denah/gambar", { method: "DELETE" });
      setMessage(res.ok ? { tone: "success", text: "Gambar dihapus." } : { tone: "error", text: "Gagal menghapus gambar." });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="font-semibold">Gambar denah</h2>
        <p className="mt-1 text-sm text-muted">
          {info.imageUrl
            ? "Rumah ditaruh di atas gambar ini."
            : "Opsional. Bisa foto denah dari developer, denah gambar tangan, atau screenshot Google Maps (mode satelit). Tanpa gambar, rumah ditaruh di kotak-kotak kosong."}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload(file);
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy !== null}
            className={buttonClass("secondary", "sm")}
          >
            <ImageUp className="size-4" />
            {busy === "upload" ? "Mengunggah…" : info.imageUrl ? "Ganti gambar" : "Unggah gambar"}
          </button>
          {info.imageUrl && (
            <button type="button" onClick={removeImage} disabled={busy !== null} className={buttonClass("danger", "sm")}>
              <Trash2 className="size-4" /> Hapus gambar
            </button>
          )}
        </div>
      </Card>

      {message && <Alert tone={message.tone}>{message.text}</Alert>}

      <div className="flex items-end justify-between gap-3">
        <p className="text-sm">
          {selected ? (
            <>
              Ketuk denah untuk menaruh <strong className="text-primary">{houseLabel(selected)}</strong>
            </>
          ) : (
            <span className="text-muted">Ketuk rumah di daftar atau di denah untuk memilih.</span>
          )}
        </p>
        <p className="shrink-0 text-sm text-muted">
          {placedCount}/{sorted.length} di denah
        </p>
      </div>

      <SiteMap
        houses={mapHouses}
        size={size}
        imageUrl={info.imageUrl}
        markers={markers}
        selectedId={selectedId}
        onHouseClick={(h) => setSelectedId(h.id === selectedId ? null : h.id)}
        onMapClick={place}
      />

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={arrange} className={buttonClass("secondary", "sm")}>
          <LayoutGrid className="size-4" /> Susun otomatis
        </button>
        {selected && positions[selected.id] && (
          <button type="button" onClick={unplace} className={buttonClass("secondary", "sm")}>
            <MapPinOff className="size-4" /> Lepas {houseLabel(selected)} dari denah
          </button>
        )}
      </div>

      <div className="space-y-3 pb-20">
        {groupByBlock(sorted).map(([block, list]) => (
          <section key={block}>
            <h3 className="mb-1.5 text-sm font-semibold">Blok {block}</h3>
            <div className="flex flex-wrap gap-1.5">
              {list.map((h) => {
                const isPlaced = positions[h.id] != null;
                const isSelected = h.id === selectedId;
                return (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => setSelectedId(isSelected ? null : h.id)}
                    aria-pressed={isSelected}
                    title={isPlaced ? "Sudah di denah" : "Belum di denah"}
                    className={cx(
                      "h-9 min-w-9 rounded-lg border-2 px-2 text-sm font-bold",
                      isSelected
                        ? "border-primary bg-primary text-primary-fg"
                        : isPlaced
                          ? "border-line bg-card text-fg"
                          : "border-dashed border-warn bg-warn-soft text-warn",
                    )}
                  >
                    {h.number}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
        <p className="flex items-center gap-2 text-xs text-muted">
          <span className="inline-block size-3 rounded border-2 border-dashed border-warn bg-warn-soft" /> belum di denah
        </p>
      </div>

      {dirty && (
        <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+64px)] z-20 border-t border-line bg-card/95 px-4 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
            <p className="text-sm font-medium">Perubahan belum disimpan</p>
            <div className="flex gap-2">
              <button type="button" onClick={discard} disabled={busy !== null} className={buttonClass("ghost", "sm")}>
                Batal
              </button>
              <button type="button" onClick={save} disabled={busy !== null} className={buttonClass("primary", "sm")}>
                {busy === "save" ? "Menyimpan…" : "Simpan denah"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
