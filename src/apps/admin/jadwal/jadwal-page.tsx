import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowDown,
  ArrowRightLeft,
  ArrowUp,
  CalendarDays,
  FileSpreadsheet,
  GripVertical,
  Plus,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState, type DragEvent } from "react";
import { useBlocker } from "react-router";
import { api, call } from "@/client/api";
import { invalidate } from "@/client/query";
import { Dialog } from "@/components/dialog";
import { guardColorClass } from "@/components/guard-color-class";
import { Menu, type MenuItem } from "@/components/menu";
import { QueryState } from "@/components/query-state";
import { Alert, Button, Card, PageHeader, cx } from "@/components/ui";
import { ScheduleImportForm } from "@/features/jadwal/import-form";
import { scheduleQuery } from "@/features/jadwal/queries";
import { rondaDate } from "@/lib/dates";
import { GUARD_COLOR_LABEL, GUARD_COLORS, type GuardColor } from "@/lib/guard-color";
import { DAY_NAMES, dayLabel, scheduleDay, slotHouseLabel } from "@/lib/schedule";
import { houseKey } from "@/lib/site-plan";
import type { HouseDTO, ScheduleDTO } from "@/lib/types";
import type { Petugas } from "../petugas/petugas-dialog";
import { housesQuery, usersQuery } from "../queries";
import { AddSlotDialog } from "./add-slot-dialog";
import { RequestsPanel } from "./requests-panel";
import { moveSlot, newKey, sameSchedule, shiftSlot, toDraft, toSlots, type DraftSlot } from "./draft";

const NIGHT = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];
const COLOR_CHOICES: [GuardColor | null, string][] = [
  ...GUARD_COLORS.map((c) => [c, GUARD_COLOR_LABEL[c]] as [GuardColor, string]),
  [null, "Putih"],
];

export function JadwalPage() {
  const schedule = useQuery(scheduleQuery);
  const users = useQuery(usersQuery);
  const houses = useQuery(housesQuery);
  const [importOpen, setImportOpen] = useState(false);
  // Dinaikkan setelah impor supaya editor mulai lagi dari jadwal baru.
  const [version, setVersion] = useState(0);
  const tonight = scheduleDay(rondaDate(new Date()));

  return (
    <>
      <PageHeader
        title="Jadwal ronda"
        subtitle={`Malam ini: ${dayLabel(tonight)}`}
        action={
          <Button onClick={() => setImportOpen(true)} variant="secondary" size="sm">
            <FileSpreadsheet className="size-4" /> Impor
          </Button>
        }
      />
      <QueryState query={schedule}>
        {(data) => (
          <ScheduleEditor
            key={version}
            schedule={data.schedule}
            users={users.data?.users ?? []}
            houses={houses.data?.houses ?? []}
            tonight={tonight}
            onImport={() => setImportOpen(true)}
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
}: {
  schedule: ScheduleDTO[];
  users: Petugas[];
  houses: HouseDTO[];
  tonight: number;
  onImport: () => void;
}) {
  const initial = useMemo(() => toDraft(schedule), [schedule]);
  // Jadwal terakhir dari server, jadwal yang dianggap tersimpan, dan jadwal yang sedang diedit.
  const [server, setServer] = useState(initial);
  const [base, setBase] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [adding, setAdding] = useState<number | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropDay, setDropDay] = useState<number | null>(null);
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
  const stats = {
    total: draft.length,
    linked: draft.filter((s) => s.userId).length,
    inactive: draft.filter((s) => s.userActive === false).length,
  };

  function drop(e: DragEvent, day: number, beforeKey?: string) {
    e.preventDefault();
    e.stopPropagation();
    const key = e.dataTransfer.getData("text/plain") || dragging;
    if (key) setDraft((d) => moveSlot(d, key, day, beforeKey));
    setDragging(null);
    setDropDay(null);
  }

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
      <p className="mb-3 text-sm text-muted">
        {stats.total} baris · {stats.linked} terhubung ke akun petugas.{" "}
        <span className="hidden sm:inline">
          Geser baris untuk mengurutkan atau memindah ke malam lain, atau pakai menu ⋯.
        </span>
        <span className="sm:hidden">Pakai menu ⋯ untuk mengurutkan atau memindah ke malam lain.</span>
      </p>
      {stats.inactive > 0 && (
        <p className="mb-3 flex gap-2 rounded-xl bg-warn-soft px-3 py-2 text-sm text-warn">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>{stats.inactive} petugas di jadwal sudah nonaktif.</span>
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

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {days.map((day) => {
          const slots = draft.filter((s) => s.day === day);
          return (
            <section
              key={day}
              id={`malam-${day}`}
              aria-label={dayLabel(day)}
              onDragOver={(e) => {
                if (!dragging) return;
                e.preventDefault();
                setDropDay(day);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropDay(null);
              }}
              onDrop={(e) => drop(e, day)}
              className={cx(
                "flex scroll-mt-28 flex-col rounded-2xl border bg-card transition",
                day === tonight ? "border-primary/60" : "border-line",
                dropDay === day && "ring-2 ring-primary",
              )}
            >
              <header className="flex items-baseline justify-between gap-2 px-4 pb-2 pt-3">
                <h2 className="font-semibold">
                  {DAY_NAMES[day]} <span className="text-sm font-normal text-muted">(malam {NIGHT[day]})</span>
                  {day === tonight && (
                    <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-fg">
                      Malam ini
                    </span>
                  )}
                </h2>
                <span className="shrink-0 text-sm text-muted">{slots.length} orang</span>
              </header>
              <ol className="flex-1 divide-y divide-line border-y border-line">
                {slots.length === 0 && <li className="px-4 py-3 text-sm text-muted">Belum ada yang jaga.</li>}
                {slots.map((slot, i) => (
                  <SlotRow
                    key={slot.key}
                    slot={slot}
                    index={i}
                    count={slots.length}
                    dragging={dragging === slot.key}
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", slot.key);
                      e.dataTransfer.effectAllowed = "move";
                      setDragging(slot.key);
                    }}
                    onDragEnd={() => {
                      setDragging(null);
                      setDropDay(null);
                    }}
                    onDrop={(e) => drop(e, day, slot.key)}
                    actions={[
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
              </ol>
              <Button
                variant="plain"
                onClick={() => setAdding(day)}
                className="flex items-center gap-2 rounded-b-2xl px-4 py-2.5 text-sm font-semibold text-primary hover:bg-idle-soft"
              >
                <Plus className="size-4" /> Tambah
              </Button>
            </section>
          );
        })}
      </div>

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

function SlotRow({
  slot,
  index,
  count,
  dragging,
  onDragStart,
  onDragEnd,
  onDrop,
  actions,
}: {
  slot: DraftSlot;
  index: number;
  count: number;
  dragging: boolean;
  onDragStart: (e: DragEvent) => void;
  onDragEnd: () => void;
  onDrop: (e: DragEvent) => void;
  actions: MenuItem[];
}) {
  const [over, setOver] = useState(false);
  const house = slotHouseLabel(slot);
  // Baris tanpa nama petugas ditampilkan dengan kode rumahnya.
  const title = slot.name ?? house;
  return (
    <li
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        onDrop(e);
      }}
      aria-label={`${index + 1} dari ${count}: ${title}`}
      className={cx(
        "flex items-center gap-2 px-2 py-1.5",
        dragging && "opacity-40",
        over && !dragging && "shadow-[inset_0_2px_0_var(--primary)]",
      )}
    >
      <GripVertical className="hidden size-4 shrink-0 cursor-grab text-muted sm:block" aria-hidden />
      <span
        className={cx("h-8 w-1.5 shrink-0 rounded-full", guardColorClass(slot.color))}
        title={slot.color ? `Warna ${GUARD_COLOR_LABEL[slot.color].toLowerCase()}` : "Warna putih"}
      />
      <span className="w-5 shrink-0 text-right text-xs text-muted">{index + 1}</span>
      <span className="min-w-0 flex-1">
        <span className={cx("block truncate font-medium", slot.userActive === false && "line-through")}>{title}</span>
        <span className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
          {slot.name ? house || "tanpa rumah" : <span>{slot.ownerName ? `KK: ${slot.ownerName}` : "belum ada nama KK"}</span>}
          {!slot.userId && <span title="Belum punya akun petugas">· tanpa akun</span>}
          {slot.userActive === false && <span className="text-warn">· nonaktif</span>}
        </span>
      </span>
      <Menu label={`Aksi untuk ${title}`} items={actions} />
    </li>
  );
}
