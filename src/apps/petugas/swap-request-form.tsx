import { useMutation } from "@tanstack/react-query";
import { ArrowRightLeft } from "lucide-react";
import { useState } from "react";
import { api, call } from "@/client/api";
import { invalidate } from "@/client/query";
import { RadioCards } from "@/components/choice";
import { Select } from "@/components/select";
import { Alert, Button, Field, Textarea } from "@/components/ui";
import { DAY_NAMES, dayLabel, slotHouseLabel } from "@/lib/schedule";
import type { ScheduleDTO } from "@/lib/types";

export function SwapRequestForm({ schedule, userId, onDone }: { schedule: ScheduleDTO[]; userId: number; onDone: () => void }) {
  const myDays = [...new Set(schedule.filter((s) => s.userId === userId).map((s) => s.day))].sort((a, b) => a - b);
  const [fromDay, setFromDay] = useState(myDays[0]);
  const [selectedId, setSelectedId] = useState("");
  const [note, setNote] = useState("");
  const candidates = schedule.filter(
    (s) => s.userId !== null && s.userId !== userId && s.userActive === true && !myDays.includes(s.day) &&
      !schedule.some((other) => other.userId === s.userId && other.day === fromDay),
  );
  const selected = candidates.find((s) => String(s.id) === selectedId);
  const send = useMutation({
    mutationFn: () => call(api.jadwal.permintaan.$post({ json: { fromDay, toDay: selected!.day, targetUserId: selected!.userId, note } })),
    onSuccess: async () => {
      await invalidate(["jadwal"], ["admin"]);
      onDone();
    },
  });

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (selected) send.mutate();
      }}
    >
      <RadioCards
        legend="Malam jagamu yang mau ditukar"
        value={String(fromDay)}
        onValueChange={(value) => {
          setFromDay(Number(value));
          setSelectedId("");
          send.reset();
        }}
        options={myDays.map((day) => ({ value: String(day), label: dayLabel(day) }))}
        disabled={send.isPending}
        className="grid-cols-1"
      />
      {candidates.length ? (
        <Select
          label="Tukar dengan"
          value={selectedId}
          onValueChange={(value) => {
            setSelectedId(value);
            send.reset();
          }}
          placeholder="Pilih petugas dan malam jaga"
          searchPlaceholder="Cari nama atau kode rumah…"
          groups={DAY_NAMES.map((_, day) => ({
            label: dayLabel(day),
            options: candidates.filter((s) => s.day === day).map((s) => ({
              value: String(s.id),
              label: s.name ?? s.ownerName ?? "Petugas",
              hint: slotHouseLabel(s) || undefined,
            })),
          })).filter((group) => group.options.length > 0)}
          disabled={send.isPending}
          required
        />
      ) : (
        <p className="text-sm text-muted">Belum ada petugas dengan jadwal yang bisa ditukar. Minta admin untuk mengatur jadwalmu.</p>
      )}
      {selected && (
        <div className="flex gap-3 rounded-xl bg-primary/10 p-3 text-sm">
          <ArrowRightLeft aria-hidden className="mt-0.5 size-5 shrink-0 text-primary" />
          <div className="min-w-0 space-y-1 [overflow-wrap:anywhere]">
            <p>Kamu: <strong>{dayLabel(fromDay)} → {dayLabel(selected.day)}</strong></p>
            <p>{selected.name ?? selected.ownerName}: <strong>{dayLabel(selected.day)} → {dayLabel(fromDay)}</strong></p>
          </div>
        </div>
      )}
      <Field label="Alasan (opsional)">
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          maxLength={300}
          disabled={send.isPending}
          placeholder="Mis. bentrok dengan jadwal kerja."
        />
      </Field>
      {send.isError && <Alert>{send.error.message}</Alert>}
      <div className="flex flex-wrap justify-end gap-2">
        <Button onClick={onDone} variant="ghost" disabled={send.isPending}>Batal</Button>
        <Button type="submit" disabled={!selected || send.isPending}>{send.isPending ? "Mengirim…" : "Ajukan tukar jadwal"}</Button>
      </div>
    </form>
  );
}
