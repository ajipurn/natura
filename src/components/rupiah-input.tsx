import { Input, cx } from "./ui";

const numberFormat = new Intl.NumberFormat("id-ID");

/** Isian rupiah: hanya angka, tampil dengan titik ribuan ("52.000"). `null` = kosong. */
export function RupiahInput({
  value,
  onValueChange,
  className,
  ...props
}: {
  value: number | null;
  onValueChange: (value: number | null) => void;
  className?: string;
  "aria-label"?: string;
  autoFocus?: boolean;
  required?: boolean;
}) {
  return (
    <div className={cx("relative", className)}>
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden>
        Rp
      </span>
      <Input
        inputMode="numeric"
        autoComplete="off"
        value={value === null ? "" : numberFormat.format(value)}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "").slice(0, 12);
          onValueChange(digits ? Number(digits) : null);
        }}
        className="pl-10 tabular-nums"
        {...props}
      />
    </div>
  );
}
