import { cx } from "@/components/ui";

/** Variasi per malam, tetap sama saat daftar dimuat ulang atau detailnya dibuka. */
function placement(date: string) {
  let hash = 2166136261;
  for (const char of date) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  const seed = hash >>> 0;
  return {
    angle: [-8, -5, 4, 7][(seed >>> 8) % 4],
    offset: (seed >>> 16) % 3 - 1,
  };
}

export function PatrolStamp({
  date,
  checked,
  expected,
  className,
}: {
  date: string;
  checked: number;
  expected: number;
  className?: string;
}) {
  if (expected === 0 || checked !== expected) return null;
  const { angle, offset } = placement(date);

  return (
    <span
      role="img"
      aria-label="Jimpitan selesai, semua rumah sudah tercatat"
      title="Semua rumah yang perlu dicek sudah tercatat."
      data-stamp-side="right"
      className={cx(
        "pointer-events-none inline-flex shrink-0 flex-col items-center rounded-[3px] border-[3px] border-double border-primary px-1.5 py-1 font-mono leading-none text-primary",
        "order-last ml-auto",
        className,
      )}
      style={{ transform: `translateY(${offset}px) rotate(${angle}deg)` }}
    >
      <span aria-hidden className="text-[11px] font-medium tracking-[0.12em]">JIMPITAN</span>
      <span aria-hidden className="mt-0.5 text-[13px] font-bold tracking-wider">SELESAI</span>
    </span>
  );
}
