import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "./ui";

/** Tinggi 44 px; inset = border 1 px + padding 2 px, jadi radius dalam = 12 - 3 = 9 px. */
export const segmentedFrameClass = "flex h-11 min-h-11 items-stretch rounded-xl border border-line bg-card p-0.5";
export const segmentedItemClass = "inline-flex h-9.5 select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-[9px] px-3 text-sm font-semibold text-muted transition-colors hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset data-disabled:opacity-40";

export type ToggleOption<T extends string> = {
  value: T;
  label: ReactNode;
  /** Angka kecil di belakang label (mis. jumlah hasil saringan). */
  count?: number;
  icon?: LucideIcon;
  /** Kelas tambahan untuk satu pilihan (mis. warna peringatan). */
  className?: string;
  disabled?: boolean;
  /** Keterangan saat kursor di atasnya. */
  title?: string;
};

/**
 * Satu pilihan aktif dari beberapa (Base UI ToggleGroup). Pilihan yang sudah aktif tidak bisa
 * dimatikan dengan mengetuknya lagi.
 */
function SingleToggleGroup<T extends string>({
  value,
  onValueChange,
  options,
  className,
  itemClassName,
  labelClassName,
  "aria-label": ariaLabel,
}: {
  value: T;
  onValueChange: (value: T) => void;
  options: readonly ToggleOption<T>[];
  className?: string;
  itemClassName: string;
  labelClassName?: string;
  "aria-label": string;
}) {
  return (
    <ToggleGroup
      value={[value]}
      onValueChange={(next) => next[0] !== undefined && onValueChange(next[0] as T)}
      aria-label={ariaLabel}
      className={className}
    >
      {options.map(({ value: v, label, count, icon: Icon, className: extra, disabled, title }) => (
        <Toggle
          key={v}
          value={v}
          disabled={disabled}
          className={cx(itemClassName, extra)}
          // Label disembunyikan (mis. di HP): nama tombol tetap terbaca dari teksnya.
          title={title ?? (typeof label === "string" && labelClassName ? label : undefined)}
        >
          {Icon && <Icon className="size-4 shrink-0" />}
          <span className={labelClassName}>{label}</span>
          {/* Spasi supaya pembaca layar membaca "Semua 76", bukan "Semua76". */}
          {count !== undefined && <> <span className="opacity-70">{count}</span></>}
        </Toggle>
      ))}
    </ToggleGroup>
  );
}

/** Chip saringan berbentuk pil (mis. Semua / Dihuni / Kosong). */
export function ChipGroup<T extends string>(props: {
  value: T;
  onValueChange: (value: T) => void;
  options: readonly ToggleOption<T>[];
  className?: string;
  "aria-label": string;
}) {
  return (
    <SingleToggleGroup
      {...props}
      className={cx("flex gap-1.5", props.className)}
      // Semua chip bertepi sama tegas dan chip aktif hanya diwarnai tipis: chip aktif yang diisi
      // warna penuh tampak lebih besar dari chip putih bertepi samar, walau ukurannya sama persis.
      // Tanda fokus di dalam chip supaya tidak terpotong oleh baris chip yang bisa digulir.
      itemClassName="inline-flex h-11 shrink-0 select-none items-center gap-1 whitespace-nowrap rounded-full border border-fg/15 bg-card px-3 text-sm font-medium text-muted transition -outline-offset-4 hover:border-fg/30 hover:text-fg focus-visible:outline-2 focus-visible:outline-primary data-disabled:opacity-40 data-pressed:border-primary data-pressed:bg-primary/10 data-pressed:text-primary data-pressed:hover:border-primary data-pressed:hover:text-primary"
    />
  );
}

/**
 * Pilihan tampilan berdampingan (mis. Daftar | Denah). `compact`: di HP label disembunyikan dan
 * hanya ikonnya yang tampil; `iconOnly`: label selalu disembunyikan (tetap dibaca pembaca layar).
 */
export function SegmentedControl<T extends string>({
  compact = false,
  iconOnly = false,
  fill = false,
  ...props
}: {
  value: T;
  onValueChange: (value: T) => void;
  options: readonly ToggleOption<T>[];
  className?: string;
  "aria-label": string;
  compact?: boolean;
  iconOnly?: boolean;
  /** Pilihan dibagi rata selebar wadahnya. */
  fill?: boolean;
}) {
  return (
    <SingleToggleGroup
      {...props}
      className={cx(
        segmentedFrameClass,
        fill && "w-full",
        iconOnly ? "gap-0.5" : compact && "max-sm:gap-0.5",
        props.className,
      )}
      labelClassName={iconOnly ? "sr-only" : compact ? "max-sm:sr-only" : undefined}
      itemClassName={cx(
        segmentedItemClass,
        "data-pressed:bg-primary data-pressed:text-primary-fg data-pressed:hover:text-primary-fg",
        iconOnly && "w-9.5 shrink-0 gap-0 px-0 [&>svg]:size-4.5",
        compact && "max-sm:w-9.5 max-sm:shrink-0 max-sm:gap-0 max-sm:px-0 max-sm:[&>svg]:size-4.5",
        fill && "min-w-0 flex-1 whitespace-normal leading-tight",
      )}
    />
  );
}
