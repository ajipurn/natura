import { Combobox } from "@base-ui/react/combobox";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import type { ReactNode } from "react";
import { cx, inputClass } from "./ui";

/**
 * `label` dan `hint` (keterangan redup di kanan, mis. blok rumah) juga dipakai untuk pencarian,
 * jadi harus teks.
 */
export type SelectOption<T extends string> = { value: T; label: string; hint?: string };
export type SelectGroup<T extends string> = { label: string; options: readonly SelectOption<T>[] };

/** Kelompok untuk Combobox; `value` = judul kelompok ("" = tanpa judul). */
type ComboGroup<T extends string> = { value: string; items: readonly SelectOption<T>[] };

/** "Blok A No. 12", "a-12", "A 12" → "a12": supaya "a12" menemukan "A-12". */
const compact = (text: string) => text.toLocaleLowerCase("id").replace(/[^\p{L}\p{N}]/gu, "");

function matches(option: SelectOption<string>, query: string) {
  const q = query.trim();
  if (!q) return true;
  return [option.label, option.hint ?? ""].some(
    (text) => text.toLocaleLowerCase("id").includes(q.toLocaleLowerCase("id")) || compact(text).includes(compact(q)),
  );
}

/**
 * Pilihan dari daftar yang bisa dicari (Base UI Combobox, kolom cari di dalam popup). Isi `options`,
 * atau `groups` untuk daftar berkelompok. Beri `label` (tampil di atas) atau `aria-label`. Dengan
 * `name`, nilainya ikut terkirim bersama form. Label dan tombolnya dibungkus satu `<div>`, jadi aman
 * di dalam `space-y-*`; `className` untuk tombolnya.
 */
export function Select<T extends string>({
  value,
  onValueChange,
  options,
  groups,
  label,
  placeholder,
  searchPlaceholder = "Cari…",
  name,
  required,
  disabled,
  className,
  "aria-label": ariaLabel,
}: {
  value: T;
  onValueChange: (value: T) => void;
  options?: readonly SelectOption<T>[];
  groups?: readonly SelectGroup<T>[];
  label?: ReactNode;
  placeholder?: string;
  searchPlaceholder?: string;
  name?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  const all = [...(options ?? []), ...(groups ?? []).flatMap((g) => g.options)];
  // Nilai yang tidak ada di daftar (mis. "" sebelum memilih) = belum memilih: tampilkan placeholder.
  const selected = all.find((o) => o.value === value) ?? null;
  // Pilihan lepas di depan kelompok (mis. "Tanpa rumah") jadi kelompok tanpa judul.
  const grouped: ComboGroup<T>[] | null = groups?.length
    ? [...(options?.length ? [{ value: "", items: options }] : []), ...groups.map((g) => ({ value: g.label, items: g.options }))]
    : null;

  return (
    <div>
      <Combobox.Root
        items={grouped ?? all}
        value={selected}
        onValueChange={(next: SelectOption<T> | null) => next && onValueChange(next.value)}
        isItemEqualToValue={(a: SelectOption<T>, b: SelectOption<T>) => a.value === b.value}
        filter={(item: SelectOption<T>, query: string) => matches(item, query)}
        autoHighlight
        name={name}
        required={required}
        disabled={disabled}
      >
        {label && <Combobox.Label className="mb-1 block text-sm font-medium">{label}</Combobox.Label>}
        <Combobox.Trigger
          aria-label={ariaLabel}
          className={cx(
            inputClass,
            "flex cursor-default items-center justify-between gap-2 text-left data-disabled:opacity-50 data-popup-open:border-primary",
            className,
          )}
        >
          <Combobox.Value>
            {(option: SelectOption<T> | null) =>
              option ? <OptionText option={option} /> : <span className="truncate text-muted/70">{placeholder}</span>
            }
          </Combobox.Value>
          <Combobox.Icon className="shrink-0 text-muted">
            <ChevronsUpDown className="size-4" />
          </Combobox.Icon>
        </Combobox.Trigger>
        <Combobox.Portal>
          <Combobox.Positioner className="z-50 outline-none" align="start" sideOffset={4}>
            <Combobox.Popup
              aria-label={typeof label === "string" ? label : ariaLabel}
              className="flex max-h-[min(24rem,var(--available-height))] w-[var(--anchor-width)] min-w-60 max-w-[var(--available-width)] origin-[var(--transform-origin)] flex-col overflow-hidden rounded-xl border border-line bg-card text-fg shadow-lg outline-none transition-[opacity,scale] duration-100 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0 motion-reduce:transition-none"
            >
              <div className="relative border-b border-line p-2">
                <Search className="pointer-events-none absolute left-4.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
                <Combobox.Input
                  placeholder={searchPlaceholder}
                  aria-label={searchPlaceholder.replace(/…$/, "")}
                  // 16px di HP supaya iOS tidak memperbesar halaman saat kolom ini difokus.
                  className="h-9 w-full rounded-lg border border-line bg-bg pl-8 pr-2 text-base text-fg placeholder:text-muted/70 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 sm:text-sm"
                />
              </div>
              <Combobox.Empty>
                <p className="px-3 py-4 text-center text-sm text-muted">Tidak ada yang cocok.</p>
              </Combobox.Empty>
              <Combobox.List className="min-h-0 flex-1 scroll-py-1 overflow-y-auto overscroll-contain py-1 empty:p-0">
                {grouped
                  ? (group: ComboGroup<T>) => (
                      <Combobox.Group key={group.value || "_"} items={group.items}>
                        {group.value && (
                          <Combobox.GroupLabel className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted">
                            {group.value}
                          </Combobox.GroupLabel>
                        )}
                        <Combobox.Collection>{(option: SelectOption<T>) => <Item key={option.value} option={option} />}</Combobox.Collection>
                      </Combobox.Group>
                    )
                  : (option: SelectOption<T>) => <Item key={option.value} option={option} />}
              </Combobox.List>
            </Combobox.Popup>
          </Combobox.Positioner>
        </Combobox.Portal>
      </Combobox.Root>
    </div>
  );
}

function Item<T extends string>({ option }: { option: SelectOption<T> }) {
  return (
    <Combobox.Item
      value={option}
      className="grid cursor-default select-none grid-cols-[1rem_1fr] items-center gap-2 px-3 py-2 text-sm outline-none data-highlighted:bg-idle-soft"
    >
      <Combobox.ItemIndicator className="col-start-1 text-primary">
        <Check className="size-4" />
      </Combobox.ItemIndicator>
      <OptionText option={option} className="col-start-2 justify-between" />
    </Combobox.Item>
  );
}

/** Label + keterangan redup (mis. "Wawan   AD-5"). */
function OptionText<T extends string>({ option, className }: { option: SelectOption<T>; className?: string }) {
  return (
    <span className={cx("flex min-w-0 items-baseline gap-3", className)}>
      <span className="truncate">{option.label}</span>
      {/* Spasi supaya pembaca layar membaca "Wawan AC-9", bukan "WawanAC-9". */}
      {option.hint && <> <span className="shrink-0 text-xs tabular-nums text-muted">{option.hint}</span></>}
    </span>
  );
}
