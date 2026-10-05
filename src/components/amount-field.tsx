import { NumberField } from "@base-ui/react/number-field";
import { Minus, Plus } from "lucide-react";
import { buttonClass, cx } from "./ui";

/** Nominal rupiah dengan tombol kurang/tambah (Base UI NumberField), ditulis "1.000". */
export function AmountField({
  value,
  onValueChange,
  step = 500,
  max = 1_000_000,
  className,
  "aria-label": ariaLabel = "Nominal (Rp)",
}: {
  value: number;
  onValueChange: (value: number) => void;
  step?: number;
  max?: number;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <NumberField.Root
      value={value}
      onValueChange={(next) => onValueChange(next ?? 0)}
      min={0}
      max={max}
      step={step}
      locale="id-ID"
      format={{ maximumFractionDigits: 0 }}
      className={className}
    >
      <NumberField.Group className="flex items-center gap-2">
        <NumberField.Decrement className={buttonClass("secondary")} aria-label="Kurangi">
          <Minus className="size-5" />
        </NumberField.Decrement>
        <NumberField.Input
          aria-label={ariaLabel}
          className={cx(
            "h-11 min-w-0 flex-1 rounded-xl border border-line bg-card text-center text-xl font-semibold tabular-nums text-fg",
            "focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30",
          )}
        />
        <NumberField.Increment className={buttonClass("secondary")} aria-label="Tambah">
          <Plus className="size-5" />
        </NumberField.Increment>
      </NumberField.Group>
    </NumberField.Root>
  );
}
