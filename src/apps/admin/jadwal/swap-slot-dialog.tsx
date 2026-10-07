import { ArrowRightLeft } from "lucide-react";
import { useState } from "react";
import { Dialog } from "@/components/dialog";
import { Select } from "@/components/select";
import { Button } from "@/components/ui";
import { DAY_NAMES, dayLabel, slotHouseLabel } from "@/lib/schedule";
import { canSwapSlots, type DraftSlot } from "./draft";

const slotName = (slot: DraftSlot) => slot.name ?? slot.ownerName ?? slotHouseLabel(slot);

export function SwapSlotDialog({
  sourceKey,
  draft,
  onClose,
  onSwap,
}: {
  sourceKey: string | null;
  draft: DraftSlot[];
  onClose: () => void;
  onSwap: (targetKey: string) => void;
}) {
  const source = draft.find((s) => s.key === sourceKey);
  return (
    <Dialog
      open={!!source}
      onClose={onClose}
      title="Tukar jadwal"
      description="Perubahan berlaku untuk jadwal mingguan setelah kamu menyimpan jadwal."
    >
      {source && <Picker key={source.key} source={source} draft={draft} onClose={onClose} onSwap={onSwap} />}
    </Dialog>
  );
}

function Picker({
  source,
  draft,
  onClose,
  onSwap,
}: {
  source: DraftSlot;
  draft: DraftSlot[];
  onClose: () => void;
  onSwap: (targetKey: string) => void;
}) {
  const [targetKey, setTargetKey] = useState("");
  const candidates = draft.filter((s) => canSwapSlots(draft, source.key, s.key));
  const target = candidates.find((s) => s.key === targetKey);
  const house = slotHouseLabel(source);

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (target) onSwap(target.key);
      }}
    >
      <div className="rounded-xl border border-line p-3 text-sm">
        <p className="text-muted">Jadwal yang ditukar</p>
        <p className="mt-1 font-semibold [overflow-wrap:anywhere]">
          {slotName(source)}{house && house !== slotName(source) && <span className="font-normal text-muted"> · {house}</span>}
        </p>
        <p className="mt-0.5">{dayLabel(source.day)}</p>
      </div>
      {candidates.length > 0 ? (
        <Select
          label="Tukar dengan"
          value={targetKey}
          onValueChange={setTargetKey}
          placeholder="Pilih petugas dan malam jaga"
          searchPlaceholder="Cari nama atau kode rumah…"
          required
          groups={DAY_NAMES.map((_, day) => ({
            label: dayLabel(day),
            options: candidates.filter((s) => s.day === day).map((s) => ({
              value: s.key,
              label: slotName(s),
              hint: slotHouseLabel(s) !== slotName(s) ? slotHouseLabel(s) || undefined : undefined,
            })),
          })).filter((group) => group.options.length > 0)}
        />
      ) : (
        <p className="text-sm text-muted">Belum ada jadwal di malam lain yang bisa ditukar tanpa membuat jadwal ganda.</p>
      )}
      {target && (
        <div className="flex gap-3 rounded-xl bg-primary/10 p-3 text-sm">
          <ArrowRightLeft aria-hidden className="mt-0.5 size-5 shrink-0 text-primary" />
          <div className="min-w-0 space-y-1 [overflow-wrap:anywhere]">
            <p>{slotName(source)}: <strong>{dayLabel(source.day)} → {dayLabel(target.day)}</strong></p>
            <p>{slotName(target)}: <strong>{dayLabel(target.day)} → {dayLabel(source.day)}</strong></p>
          </div>
        </div>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Button onClick={onClose} variant="ghost">Batal</Button>
        <Button type="submit" disabled={!target}><ArrowRightLeft aria-hidden className="size-4" /> Tukar jadwal</Button>
      </div>
    </form>
  );
}
