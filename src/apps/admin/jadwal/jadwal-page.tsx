import { move } from "@dnd-kit/helpers";
import { DragDropProvider, useDroppable } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowDown,
  ArrowRightLeft,
  ArrowUp,
  CalendarDays,
  FileSpreadsheet,
  GripVertical,
  ImageDown,
  Plus,
  Trash2,
  UserRound,
  UsersRound,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useBlocker } from "react-router";
import { api, call } from "@/client/api";
import { invalidate } from "@/client/query";
import { Dialog } from "@/components/dialog";
import { guardColorClass } from "@/components/guard-color-class";
import { GuardColorLegend } from "@/components/guard-color-legend";
import { Menu, type MenuItem } from "@/components/menu";
import { QueryState } from "@/components/query-state";
import { Alert, Button, Card, PageHeader, cx } from "@/components/ui";
import { ScheduleImportForm } from "@/features/jadwal/import-form";
import { scheduleQuery } from "@/features/jadwal/queries";
import { rondaDate } from "@/lib/dates";
import { GUARD_COLOR_LABEL, GUARD_COLOR_MEANING, GUARD_COLORS, type GuardColor } from "@/lib/guard-color";
import { DAY_NAMES, dayLabel, scheduleDay, slotHouseLabel } from "@/lib/schedule";
import { createScheduleImage } from "@/lib/schedule-image";
import { houseKey } from "@/lib/site-plan";
import type { HouseDTO, ScheduleDTO } from "@/lib/types";
import type { Petugas } from "../petugas/petugas-dialog";
import { housesQuery, settingsQuery, usersQuery } from "../queries";
import { AddSlotDialog } from "./add-slot-dialog";
import { HouseNameDialog } from "./house-name-dialog";
import { RequestsPanel } from "./requests-panel";
import { SwapSlotDialog } from "./swap-slot-dialog";
import { applyKeysByDay, keysByDay, moveSlot, newKey, sameSchedule, shiftSlot, swapSlots, toDraft, toSlots, type DraftSlot } from "./draft";

const NIGHT = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];
const COLOR_CHOICES: [GuardColor | null, string][] = [
  ...GUARD_COLORS.map((c) => [c, GUARD_COLOR_LABEL[c]] as [GuardColor, string]),
  [null, "Putih"],
];
const colorMeaning = (color: GuardColor | null) => GUARD_COLOR_MEANING[color ?? "white"];

export function JadwalPage() {
  const queryClient = useQueryClient();
  const schedule = useQuery(scheduleQuery);
  const users = useQuery(usersQuery);
  const houses = useQuery(housesQuery);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  // Dinaikkan setelah impor supaya editor mulai lagi dari jadwal baru.
  const [version, setVersion] = useState(0);
  const tonight = scheduleDay(rondaDate(new Date()));
  const exporting = useMutation({
    mutationFn: async () => {
      const settings = await queryClient.ensureQueryData(settingsQuery);
      const blob = await createScheduleImage(schedule.data?.schedule ?? [], settings.communityName);
      const url = URL.createObjectURL(blob);
      const link = Object.assign(document.createElement("a"), { href: url, download: `jadwal-ronda-${rondaDate(new Date())}.png` });
      document.body.append(link);
      link.click();
      link.remove();
      // Beri browser waktu mengambil blob sebelum URL dilepas.
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    },
  });

  return (
    <>
      <PageHeader
        title="Jadwal ronda"
        subtitle={`Malam ini: ${dayLabel(tonight)}`}
        className="flex-wrap sm:flex-nowrap"
        action={
          <div className="flex w-full shrink-0 gap-2 sm:w-auto">
            <Button
              onClick={() => exporting.mutate()}
              disabled={editing || exporting.isPending || !schedule.data?.schedule.length}
              aria-busy={exporting.isPending}
              title={editing ? "Simpan atau batalkan perubahan sebelum mengekspor" : "Unduh tabel jadwal sebagai PNG"}
              variant="secondary"
              size="sm"
              className="h-11 sm:h-9"
            >
              <ImageDown className="size-4" /> {exporting.isPending ? "Menyiapkan…" : "Ekspor gambar"}
            </Button>
            <Button onClick={() => setImportOpen(true)} variant="secondary" size="sm" className="h-11 sm:h-9">
              <FileSpreadsheet className="size-4" /> Impor
            </Button>
          </div>
        }
      />
      {exporting.isError && (
        <div className="mb-4">
          <Alert>{exporting.error.message}</Alert>
        </div>
      )}
      <QueryState query={schedule}>
        {(data) => (
          <ScheduleEditor
            key={version}
            schedule={data.schedule}
            users={users.data?.users ?? []}
            houses={houses.data?.houses ?? []}
            tonight={tonight}
            onImport={() => setImportOpen(true)}
            onEditingChange={setEditing}
          />
        )}
      </QueryState>
      <Dialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Impor jadwal dari spreadsheet"
        description="Jadwal yang sekarang diganti seluruhnya. Nama yang sama dengan akun petugas otomatis terhubung."
        className="sm:max-w-2xl"
      >
        <ScheduleImportForm
          houseKeys={(houses.data?.houses ?? []).map(houseKey)}
          hasSchedule={(schedule.data?.schedule.length ?? 0) > 0}
          onChanged={() => setVersion((v) => v + 1)}
        />
      </Dialog>
    </>
  );
}

function ScheduleEditor({
  schedule,
  users,
  houses,
  tonight,
  onImport,
  onEditingChange,
}: {
  schedule: ScheduleDTO[];
  users: Petugas[];
  houses: HouseDTO[];
  tonight: number;
  onImport: () => void;
  onEditingChange: (editing: boolean) => void;
}) {
  const initial = useMemo(() => toDraft(schedule), [schedule]);
  // Jadwal terakhir dari server, jadwal yang dianggap tersimpan, dan jadwal yang sedang diedit.
  const [server, setServer] = useState(initial);
  const [base, setBase] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [adding, setAdding] = useState<number | null>(null);
  const [naming, setNaming] = useState<HouseDTO | null>(null);
  const [swapping, setSwapping] = useState<string | null>(null);
  const beforeDrag = useRef(draft);
  const dirty = !sameSchedule(draft, base);

  // Data baru dari server (mis. setelah disimpan): pakai, kecuali sedang ada perubahan lokal.
  if (initial !== server) {
    setServer(initial);
    if (!dirty) {
      setBase(initial);
      setDraft(initial);
    }
  }

  const save = useMutation({
    mutationFn: () => call(api.admin.jadwal.slot.$put({ json: { slots: toSlots(draft) } })),
    onSuccess: async () => {
      setBase(draft);
      await invalidate(["jadwal"], ["admin"], ["ronda"]);
    },
  });
  useEffect(() => onEditingChange(dirty || save.isPending), [dirty, save.isPending, onEditingChange]);

  // Jangan sampai perubahan hilang karena pindah halaman atau menutup tab.
  const blocker = useBlocker(dirty);
  useEffect(() => {
    if (blocker.state !== "blocked") return;
    if (window.confirm("Perubahan jadwal belum disimpan. Tinggalkan halaman ini?")) blocker.proceed();
    else blocker.reset();
  }, [blocker]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const days = DAY_NAMES.map((_, i) => (tonight + i) % 7);
  const houseById = useMemo(() => new Map(houses.map((h) => [h.id, h])), [houses]);
  const inactiveCount = draft.filter((s) => s.userActive === false).length;

  if (draft.length === 0 && !dirty) {
    return (
      <>
        <RequestsPanel locked={false} />
        <Card className="text-center">
          <CalendarDays className="mx-auto size-10 text-muted" />
          <p className="mt-2 font-semibold">Belum ada jadwal ronda</p>
          <p className="mt-1 text-sm text-muted">Impor tabel jadwal dari spreadsheet, atau isi langsung per malam.</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button onClick={onImport}>
              <FileSpreadsheet className="size-5" /> Impor dari spreadsheet
            </Button>
            <Button onClick={() => setAdding(tonight)} variant="secondary">
              <Plus className="size-5" /> Isi manual
            </Button>
          </div>
          <AddSlotDialog
            day={adding}
            onClose={() => setAdding(null)}
            users={users}
            houses={houses}
            slotsOfDay={[]}
            onAdd={(slot) => {
              setDraft((d) => [...d, { ...slot, day: adding!, key: newKey() }]);
              setAdding(null);
            }}
          />
        </Card>
      </>
    );
  }

  return (
    <div>
      <RequestsPanel locked={dirty} />
      <GuardColorLegend />
      {inactiveCount > 0 && (
        <p className="mb-3 flex gap-2 rounded-xl bg-warn-soft px-3 py-2 text-sm text-warn">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>{inactiveCount} petugas di jadwal sudah nonaktif.</span>
        </p>
      )}

      {/* Di HP semua malam bertumpuk: pintasan untuk lompat ke malam tertentu. */}
      <nav
        aria-label="Lompat ke malam"
        className="sticky top-14 z-10 -mx-4 mb-3 flex gap-1.5 overflow-x-auto bg-bg/95 px-4 py-2 backdrop-blur md:hidden"
      >
        {days.map((day) => (
          <a
            key={day}
            href={`#malam-${day}`}
            className={cx(
              "shrink-0 rounded-full border px-3 py-1 text-sm font-medium",
              day === tonight ? "border-primary bg-primary text-primary-fg" : "border-line bg-card",
            )}
          >
            {DAY_NAMES[day]} <span className="opacity-70">{draft.filter((s) => s.day === day).length}</span>
          </a>
        ))}
      </nav>

      {/*
        Drag and drop (dnd kit): baris lain bergeser memberi tempat selama diseret, juga antar malam.
        Draf diubah setiap kali target berubah, supaya React sendiri yang memindahkan baris antar malam
        (kalau tidak, dnd kit memindahkan elemennya langsung di DOM dan React tidak bisa menghapusnya
        lagi); dibatalkan (Esc) = kembali ke draf saat mulai diseret. Mouse: geser 5px; layar sentuh:
        tekan lama.
      */}
      <DragDropProvider
        onDragStart={() => {
          beforeDrag.current = draft;
        }}
        onDragOver={(event) => {
          setDraft((d) => {
            const groups = keysByDay(d);
            const moved = move(groups, event);
            return moved === groups ? d : applyKeysByDay(d, moved);
          });
        }}
        onDragEnd={(event) => {
          if (event.canceled) setDraft(beforeDrag.current);
        }}
      >
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {days.map((day) => {
            const slots = draft.filter((s) => s.day === day);
            return (
              <NightColumn key={day} day={day} tonight={day === tonight} slots={slots} onAdd={() => setAdding(day)}>
                {slots.map((slot, i) => (
                  <SlotRow
                    key={slot.key}
                    slot={slot}
                    index={i}
                    count={slots.length}
                    actions={[
                      ...(slot.houseId && !slot.name && !slot.ownerName
                        ? [
                            {
                              label: "Isi nama KK",
                              icon: <UserRound className="size-4" />,
                              disabled: !houseById.has(slot.houseId),
                              onSelect: () => setNaming(houseById.get(slot.houseId!) ?? null),
                            },
                          ]
                        : []),
                      {
                        label: "Naikkan",
                        icon: <ArrowUp className="size-4" />,
                        disabled: i === 0,
                        onSelect: () => setDraft((d) => shiftSlot(d, slot.key, -1)),
                      },
                      {
                        label: "Turunkan",
                        icon: <ArrowDown className="size-4" />,
                        disabled: i === slots.length - 1,
                        onSelect: () => setDraft((d) => shiftSlot(d, slot.key, 1)),
                      },
                      {
                        label: "Tukar jadwal",
                        icon: <ArrowRightLeft className="size-4" />,
                        disabled: save.isPending,
                        onSelect: () => setSwapping(slot.key),
                      },
                      { heading: "Pindah ke" },
                      ...days
                        .filter((d) => d !== day)
                        .map((target) => ({
                          label: dayLabel(target),
                          icon: <ArrowRightLeft className="size-4" />,
                          onSelect: () => setDraft((d) => moveSlot(d, slot.key, target)),
                        })),
                      { heading: "Warna" },
                      ...COLOR_CHOICES.map(([color, label]) => ({
                        label: slot.color === color ? `${label} ✓` : label,
                        hint: colorMeaning(color),
                        icon: <span aria-hidden className={cx("size-4 rounded-full", guardColorClass(color))} />,
                        onSelect: () => setDraft((d) => d.map((s) => (s.key === slot.key ? { ...s, color } : s))),
                      })),
                      {
                        label: "Hapus dari jadwal",
                        icon: <Trash2 className="size-4" />,
                        danger: true,
                        onSelect: () => setDraft((d) => d.filter((s) => s.key !== slot.key)),
                      },
                    ]}
                  />
                ))}
              </NightColumn>
            );
          })}
        </div>
      </DragDropProvider>

      {(dirty || save.isError || save.isSuccess) && (
        <div className="sticky bottom-4 z-20 mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-card p-3 shadow-lg">
          {dirty ? (
            <>
              <p className="min-w-0 flex-1 text-sm font-medium">Ada perubahan yang belum disimpan.</p>
              <Button
                disabled={save.isPending}
                onClick={() => {
                  save.reset();
                  setDraft(base);
                }}
                variant="ghost"
                size="sm"
              >
                Batalkan
              </Button>
              <Button disabled={save.isPending} onClick={() => save.mutate()} size="sm">
                {save.isPending ? "Menyimpan…" : "Simpan jadwal"}
              </Button>
            </>
          ) : (
            <p className="min-w-0 flex-1 text-sm text-filled">{save.data?.success}</p>
          )}
          {save.isError && (
            <div className="w-full">
              <Alert>{save.error.message}</Alert>
            </div>
          )}
        </div>
      )}

      <SwapSlotDialog
        sourceKey={swapping}
        draft={draft}
        onClose={() => setSwapping(null)}
        onSwap={(targetKey) => {
          setDraft((d) => swapSlots(d, swapping!, targetKey));
          setSwapping(null);
        }}
      />
      <HouseNameDialog
        house={naming}
        onClose={() => setNaming(null)}
        onSaved={(houseId, ownerName) => {
          // Tampil juga di jadwal yang sedang diedit; nama KK tidak ikut disimpan bersama jadwal.
          const withName = (d: DraftSlot[]) => d.map((s) => (s.houseId === houseId && !s.userId ? { ...s, ownerName } : s));
          setDraft(withName);
          setBase(withName);
          setNaming(null);
        }}
      />
      <AddSlotDialog
        day={adding}
        onClose={() => setAdding(null)}
        users={users}
        houses={houses}
        slotsOfDay={adding === null ? [] : draft.filter((s) => s.day === adding)}
        onAdd={(slot) => {
          const key = newKey();
          // Ditaruh di urutan terakhir malam itu.
          setDraft((d) => moveSlot([...d, { ...slot, day: adding!, key }], key, adding!));
          setAdding(null);
        }}
      />
    </div>
  );
}

/** Satu malam di jadwal: kepala kolom, baris-baris (bisa diseret), dan tombol tambah. */
function NightColumn({
  day,
  tonight,
  slots,
  onAdd,
  children,
}: {
  day: number;
  tonight: boolean;
  slots: DraftSlot[];
  onAdd: () => void;
  children: ReactNode;
}) {
  // Malam juga tujuan seret, supaya baris bisa dipindah ke malam yang masih kosong. Prioritasnya di
  // bawah baris (CollisionPriority.Low), jadi baris yang ditunjuk tetap menentukan posisinya.
  const { ref, isDropTarget } = useDroppable({ id: String(day), type: "malam", accept: "slot", collisionPriority: 1 });
  return (
    <section
      ref={ref}
      id={`malam-${day}`}
      aria-label={dayLabel(day)}
      className={cx(
        "flex scroll-mt-28 flex-col rounded-2xl border bg-card transition",
        tonight ? "border-primary/60" : "border-line",
        isDropTarget && "ring-2 ring-primary",
      )}
    >
      <header className="px-4 pb-2 pt-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex min-w-0 items-center gap-2 font-semibold">
            <span className="truncate">{DAY_NAMES[day]}</span>
            {tonight && (
              <span className="shrink-0 whitespace-nowrap rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-fg">
                Malam ini
              </span>
            )}
          </h2>
          <span title={`${slots.length} orang`} className="inline-flex shrink-0 items-center gap-1 text-sm text-muted">
            <UsersRound aria-hidden className="size-3.5" />
            {slots.length}
            <span className="sr-only"> orang</span>
          </span>
        </div>
        {/* Satu baris di semua lebar, supaya baris pertama tiap malam sejajar. */}
        <div className="mt-0.5 flex items-center justify-between gap-2 text-xs text-muted">
          <span className="truncate">malam {NIGHT[day]}</span>
          <ColorMix slots={slots} />
        </div>
      </header>
      <ol className="flex-1 divide-y divide-line border-y border-line">
        {slots.length === 0 && <li className="px-4 py-3 text-sm text-muted">Belum ada yang jaga.</li>}
        {children}
      </ol>
      <Button
        variant="plain"
        onClick={onAdd}
        className="flex items-center gap-2 rounded-b-2xl px-4 py-2.5 text-sm font-semibold text-primary hover:bg-idle-soft"
      >
        <Plus className="size-4" /> Tambah
      </Button>
    </section>
  );
}

function SlotRow({ slot, index, count, actions }: { slot: DraftSlot; index: number; count: number; actions: MenuItem[] }) {
  const { ref, isDragging } = useSortable({ id: slot.key, index, group: String(slot.day), type: "slot", accept: "slot" });
  const house = slotHouseLabel(slot);
  // Nama petugas (atau nama bebas), atau nama KK untuk baris rumah tanpa akun.
  const name = slot.name ?? slot.ownerName;
  // Rumah yang belum ada namanya: cukup kode rumahnya, satu baris.
  const title = name ?? house;
  return (
    <li
      ref={ref}
      aria-label={`${index + 1} dari ${count}: ${title}`}
      className={cx(
        "flex cursor-grab touch-manipulation items-center gap-2 bg-card px-2 py-1.5 active:cursor-grabbing",
        // Baris yang sedang diseret terangkat di atas kolom.
        isDragging && "rounded-xl shadow-lg ring-1 ring-line",
      )}
    >
      <GripVertical className="size-4 shrink-0 text-muted" aria-hidden />
      <span
        className={cx("h-8 w-1.5 shrink-0 rounded-full", guardColorClass(slot.color))}
        title={slot.color ? `Warna ${GUARD_COLOR_LABEL[slot.color].toLowerCase()}` : "Warna putih"}
      />
      <span className="w-5 shrink-0 text-right text-xs text-muted">{index + 1}</span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-baseline gap-1.5">
          {/* Kode rumah pendek, jadi tidak dipotong; yang dipotong keterangannya kalau kolomnya sempit. */}
          <span
            title={title}
            className={cx("font-medium", name ? "truncate" : "shrink-0", slot.userActive === false && "line-through")}
          >
            {title}
          </span>
          {!name && <span className="truncate text-xs text-muted">tanpa nama</span>}
        </span>
        {name && (
          <span className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
            {house || "tanpa rumah"}
            {!slot.userId && <span title="Belum punya akun petugas">· tanpa akun</span>}
            {slot.userActive === false && <span className="text-warn">· nonaktif</span>}
          </span>
        )}
      </span>
      <Menu label={`Aksi untuk ${title}`} items={actions} />
    </li>
  );
}

/** Banyaknya orang per warna di satu malam, dari yang paling aktif. */
function ColorMix({ slots }: { slots: DraftSlot[] }) {
  return (
    <span className="flex shrink-0 gap-1.5">
      {COLOR_CHOICES.map(([color]) => {
        const count = slots.filter((s) => s.color === color).length;
        if (!count) return null;
        return (
          <span key={color ?? "white"} className="inline-flex items-center gap-0.5" title={`${colorMeaning(color)}: ${count}`}>
            <span aria-hidden className={cx("size-2.5 rounded-full", guardColorClass(color))} />
            <span className="sr-only">{colorMeaning(color)}</span>
            {count}
          </span>
        );
      })}
    </span>
  );
}
