import { CheckCircle2, ChevronDown } from "lucide-react";
import { useState } from "react";
import { ScrollArea } from "@/components/scroll-area";
import { Button, cx } from "@/components/ui";
import { formatAmountShort, formatRupiah } from "@/lib/format";
import { groupByBlock, houseLabel } from "@/lib/houses";
import type { HouseDTO } from "@/lib/types";
import type { MergedCollection } from "./use-ronda-store";

export type ListFilter = "belum" | "sudah" | "semua";

/** Rumah yang masih perlu dicek malam ini (rumah kosong/mudik tidak dihitung). */
const isOpen = (h: HouseDTO, collections: Map<number, MergedCollection>) => h.status === "active" && !collections.has(h.id);

/**
 * Daftar rumah per blok. "Belum" (bawaan) hanya menampilkan rumah yang belum dicek; blok yang sudah
 * selesai dilipat jadi satu baris, jadi daftarnya makin pendek seiring malam berjalan.
 */
export function HouseList({
  houses,
  collections,
  filter,
  onOpen,
}: {
  houses: HouseDTO[];
  collections: Map<number, MergedCollection>;
  filter: ListFilter;
  onOpen: (house: HouseDTO) => void;
}) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const toggle = (block: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(block)) next.delete(block);
      else next.add(block);
      return next;
    });

  const groups = groupByBlock(houses);
  const sections = groups.flatMap(([block, list]) => {
    const active = list.filter((h) => h.status === "active");
    const open = list.filter((h) => isOpen(h, collections));
    const checked = list.filter((h) => collections.has(h.id));
    const visible = filter === "belum" ? open : filter === "sudah" ? checked : list;
    if (filter === "sudah" && visible.length === 0) return [];
    return [{ block, list, done: active.length - open.length, total: active.length, open: open.length, visible }];
  });

  if (sections.length === 0) {
    return <p className="py-10 text-center text-muted">Belum ada rumah yang dicek malam ini.</p>;
  }

  // Blok yang masih ada kotak rumahnya (yang sudah selesai dan terlipat tidak perlu dituju).
  const jumpable = sections.filter((s) => !(filter === "belum" && s.open === 0) && s.visible.length > 0);

  return (
    <div className="space-y-4">
      {jumpable.length >= 3 && <BlockJump sections={jumpable} filter={filter} />}
      {sections.map(({ block, list, done, total, open, visible }) => {
        // Di tab "Belum", blok yang sudah selesai dilipat (bisa dibuka untuk melihat/mengoreksi).
        const finished = filter === "belum" && open === 0;
        const isExpanded = expanded.has(block);
        const tiles = finished ? (isExpanded ? list : []) : visible;
        return (
          // Ruang di atas saat dituju dari BlockJump: ringkasan ronda menempel di atas.
          <section key={block} id={blockId(block)} aria-label={`Blok ${block}`} className="scroll-mt-52">
            {finished ? (
              <Button
                variant="plain"
                onClick={() => toggle(block)}
                aria-expanded={isExpanded}
                className="flex w-full items-center gap-2 rounded-xl border border-filled/30 bg-filled-soft px-3 py-2.5 text-left text-sm font-semibold text-filled"
              >
                <CheckCircle2 className="size-4 shrink-0" aria-hidden />
                <span className="flex-1">
                  Blok {block} selesai · {done}/{total}
                </span>
                <ChevronDown className={cx("size-4 shrink-0 transition-transform", isExpanded && "rotate-180")} aria-hidden />
              </Button>
            ) : (
              <BlockHeader block={block} done={done} total={total} open={open} />
            )}
            {tiles.length > 0 && (
              <div className={cx("grid grid-cols-5 gap-2 sm:grid-cols-6", finished ? "mt-2" : "mt-2.5")}>
                {tiles.map((h) => (
                  <HouseTile key={h.id} house={h} collection={collections.get(h.id)} onClick={() => onOpen(h)} />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

const blockId = (block: string) => `blok-${block}`;

/**
 * Deretan blok untuk langsung lompat ke bloknya, dengan jumlah kotak rumah yang tampil di tiap blok
 * (di tab "Belum" = yang belum dicek). Daftar rumah di HP panjang digulir.
 */
function BlockJump({ sections, filter }: { sections: { block: string; visible: HouseDTO[] }[]; filter: ListFilter }) {
  function jump(block: string) {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById(blockId(block))?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }
  return (
    <ScrollArea element="nav" aria-label="Lompat ke blok" className="-mx-4 overflow-x-auto">
      <ul className="flex w-max gap-1.5 px-4 pb-1">
        {sections.map(({ block, visible }) => (
          <li key={block}>
            <Button
              variant="plain"
              onClick={() => jump(block)}
              aria-label={`Blok ${block}, ${visible.length} ${filter === "belum" ? "belum dicek" : "rumah"}`}
              className="inline-flex items-baseline gap-1 rounded-full border border-line bg-card px-2.5 py-1 text-sm font-semibold hover:border-primary/50 active:scale-95"
            >
              {block} <span className="text-xs font-normal text-muted">{visible.length}</span>
            </Button>
          </li>
        ))}
      </ul>
    </ScrollArea>
  );
}

function BlockHeader({ block, done, total, open }: { block: string; done: number; total: number; open: number }) {
  return (
    <div>
      <h3 className="flex items-baseline justify-between gap-2 font-semibold">
        Blok {block}
        <span className="text-sm font-normal text-muted">
          {done}/{total}
          {open > 0 && ` · ${open} belum`}
        </span>
      </h3>
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-idle-soft" aria-hidden>
        <div className="h-full rounded-full bg-filled" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
      </div>
    </div>
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
    <Button
      variant="plain"
      onClick={onClick}
      aria-label={`${houseLabel(house)}, ${stateText}${collection?.pending ? ", belum terkirim" : ""}`}
      className={cx(
        "relative flex min-h-16 flex-col items-center justify-center rounded-xl border px-1 py-2 text-sm font-semibold leading-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 active:scale-[0.96] motion-reduce:transform-none",
        state === "filled" && "border-filled bg-filled-soft text-filled",
        state === "empty" && "border-empty bg-empty-soft text-empty",
        state === "unchecked" && "border-line bg-card text-fg hover:border-primary/50",
        state === "vacant" && "border-dashed border-muted/60 bg-transparent text-muted",
      )}
    >
      {houseLabel(house)}
      {state === "filled" && collection && (
        <span className="mt-1 text-[10px] font-semibold">{formatAmountShort(collection.amount)}</span>
      )}
      {state === "empty" && <span className="mt-1 text-[10px] font-semibold">kosong</span>}
      {state === "vacant" && <span className="mt-1 text-[10px] font-medium">mudik</span>}
      {collection?.pending && <span className="absolute right-1 top-1 size-2 rounded-full bg-warn" aria-hidden />}
    </Button>
  );
}
