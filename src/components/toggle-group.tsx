import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "./ui";

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
      itemClassName="inline-flex shrink-0 select-none items-center gap-1 whitespace-nowrap rounded-full border border-fg/15 bg-card px-3 py-1.5 text-sm font-medium text-muted transition -outline-offset-4 hover:border-fg/30 hover:text-fg focus-visible:outline-2 focus-visible:outline-primary data-disabled:opacity-40 data-pressed:border-primary data-pressed:bg-primary/10 data-pressed:text-primary data-pressed:hover:border-primary data-pressed:hover:text-primary"
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
  size = "md",
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
  size?: "md" | "sm";
}) {
  return (
    <SingleToggleGroup
      {...props}
      className={cx("flex rounded-xl border border-line bg-card p-0.5", props.className)}
      labelClassName={iconOnly ? "sr-only" : compact ? "max-sm:sr-only" : undefined}
      itemClassName={cx(
        "inline-flex select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-sm font-semibold text-muted transition hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 data-disabled:opacity-40 data-pressed:bg-primary data-pressed:text-primary-fg data-pressed:hover:text-primary-fg",
        iconOnly && "px-2.5",
        size === "md" ? "h-9.5" : "h-8",
        fill && "flex-1",
      )}
    />
  );
}
