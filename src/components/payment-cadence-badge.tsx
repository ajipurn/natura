import { CADENCE_LABEL, type PaymentCadence } from "@/lib/payments";
import { cx } from "./ui";

const COLORS: Record<PaymentCadence, string> = {
  daily: "bg-idle-soft text-fg/80",
  weekly: "bg-cadence-weekly-soft text-cadence-weekly",
  monthly: "bg-cadence-monthly-soft text-cadence-monthly",
};

export function PaymentCadenceBadge({ cadence, className }: { cadence: PaymentCadence; className?: string }) {
  const label = CADENCE_LABEL[cadence];
  return (
    <span
      className={cx("rounded-full px-2 py-0.5 text-[11px] font-medium", COLORS[cadence], className)}
      aria-label={`Jimpitan ${label.toLowerCase()}`}
    >
      {label}
    </span>
  );
}
