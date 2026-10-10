import { Home, Search, UserPlus, UserRound } from "lucide-react";
import { useState } from "react";
import { Dialog } from "@/components/dialog";
import { Button, Input } from "@/components/ui";
import { NEW_SLOT_COLOR } from "@/lib/guard-color";
import { compareHouses, houseLabel, searchHouses } from "@/lib/houses";
import { dayLabel } from "@/lib/schedule";
import type { HouseDTO } from "@/lib/types";
import type { Resident } from "../warga/warga-dialog";
import type { DraftSlot } from "./draft";
import { canRonda } from "@/lib/permissions";

/** Pilih warga yang ditugaskan; rumah/nama hanya penanda bila orangnya belum didata. */
export function AddSlotDialog({
  day,
  onClose,
  onAdd,
  people,
  houses,
  slotsOfDay,
}: {
  day: number | null;
  onClose: () => void;
  onAdd: (slot: Omit<DraftSlot, "key" | "day">) => void;
  people: Resident[];
  houses: HouseDTO[];
  slotsOfDay: DraftSlot[];
}) {
  return (
    <Dialog open={day !== null} onClose={onClose} title={`Tambah ke ${day === null ? "" : dayLabel(day)}`}>
      {day !== null && <Picker people={people} houses={houses} slotsOfDay={slotsOfDay} onAdd={onAdd} />}
    </Dialog>
  );
}

function Picker({
  people,
  houses,
  slotsOfDay,
  onAdd,
}: {
  people: Resident[];
  houses: HouseDTO[];
  slotsOfDay: DraftSlot[];
  onAdd: (slot: Omit<DraftSlot, "key" | "day">) => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const houseById = new Map(houses.map((h) => [h.id, h]));
  const taken = new Set(slotsOfDay.flatMap((s) => s.residentId ? [s.residentId] : []));
  const takenAccounts = new Set(slotsOfDay.flatMap((s) => s.userId ? [s.userId] : []));
  const isTaken = (r: Resident) => taken.has(r.id) || (r.userId !== null && takenAccounts.has(r.userId));
  const address = (r: Resident) => r.block ? `${r.block}-${r.number}` : null;

  const matchedPeople = people
    .filter((u) => !u.role || (canRonda(u.role) && u.accountActive))
    .filter((u) => !q || u.name.toLowerCase().includes(q) || address(u)?.toLowerCase().replace("-", "").includes(q.replace(/[-\s]/g, "")))
    .sort((a, b) => Number(isTaken(a)) - Number(isTaken(b)) || a.name.localeCompare(b.name, "id"))
    .slice(0, q ? 20 : 8);
  // Pilih orangnya jika rumah sudah memiliki data warga.
  const inhabited = new Set(people.map((u) => u.houseId));
  const matchedHouses = q ? searchHouses(houses.filter((h) => !inhabited.has(h.id)), query, 8) : [];
  const exactPerson = people.some((u) => u.name.toLowerCase() === q);

  function addPerson(u: Resident) {
    const house = u.houseId ? houseById.get(u.houseId) : undefined;
    onAdd({
      name: u.name,
      residentId: u.id,
      userId: u.userId,
      userActive: u.accountActive,
      color: NEW_SLOT_COLOR,
      block: house?.block ?? "",
      number: house?.number ?? "",
      houseId: house?.id ?? null,
      ownerName: house?.ownerName ?? null,
    });
  }

  return (
    <div className="space-y-4">
      <label className="relative block">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted" />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          data-autofocus
          placeholder="Nama petugas atau rumah (mis. AD3)"
          aria-label="Cari petugas atau rumah"
          className="pl-10"
        />
      </label>

      <section>
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Warga</h3>
        {matchedPeople.length === 0 ? (
          <p className="py-2 text-sm text-muted">Tidak ada petugas yang cocok.</p>
        ) : (
          <ul className="divide-y divide-line">
            {matchedPeople.map((u) => {
              const already = isTaken(u);
              return (
                <li key={u.id}>
                  <Button
                    variant="plain"
                    disabled={already}
                    onClick={() => addPerson(u)}
                    className="flex w-full items-center gap-3 px-1 py-2.5 text-left hover:bg-idle-soft disabled:opacity-50"
                  >
                    <UserRound className="size-5 shrink-0 text-primary" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{u.name}</span>
                      <span className="block truncate text-xs text-muted">
                        {address(u) ?? "Tanpa rumah"}
                        {!u.userId && " · belum punya akun"}
                      </span>
                    </span>
                    {already && <span className="shrink-0 text-xs text-muted">sudah di malam ini</span>}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {matchedHouses.length > 0 && (
        <section>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Rumah (petugas belum ditentukan)</h3>
          <ul className="divide-y divide-line">
            {[...matchedHouses].sort(compareHouses).map((h) => (
              <li key={h.id}>
                <Button
                  variant="plain"
                  onClick={() =>
                    onAdd({ name: null, userId: null, userActive: null, color: NEW_SLOT_COLOR, block: h.block, number: h.number, houseId: h.id, ownerName: h.ownerName })
                  }
                  className="flex w-full items-center gap-3 px-1 py-2.5 text-left hover:bg-idle-soft"
                >
                  <Home className="size-5 shrink-0 text-muted" />
                  <span className="font-medium">{houseLabel(h)}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-muted">{h.ownerName ?? "—"}</span>
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {q && !exactPerson && (
        <Button
          variant="plain"
          onClick={() =>
            onAdd({ name: query.trim().slice(0, 60), userId: null, userActive: null, color: NEW_SLOT_COLOR, block: "", number: "", houseId: null, ownerName: null })
          }
          className="flex w-full items-center gap-3 rounded-xl border border-dashed border-line px-3 py-2.5 text-left text-sm hover:bg-idle-soft"
        >
          <UserPlus className="size-5 shrink-0 text-muted" />
          <span>
            Tambah “<strong>{query.trim()}</strong>” tanpa akun
            <span className="block text-xs text-muted">Belum terhubung ke warga; pilih orangnya setelah didata.</span>
          </span>
        </Button>
      )}
    </div>
  );
}
