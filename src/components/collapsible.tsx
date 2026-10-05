import { useState, type ReactNode } from "react";
import { cx } from "./ui";

/**
 * Bagian yang bisa dibuka-tutup. Status buka disimpan di sini, jadi tidak ikut tertutup
 * saat halaman dirender ulang setelah Server Action (mis. pesan hasil tetap terlihat).
 */
export function Collapsible({
  title,
  defaultOpen = false,
  className,
  children,
}: {
  title: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <details
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
      className={cx("group rounded-2xl border border-line bg-card p-4", className)}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between font-semibold">
        {title}
        <span className="text-sm font-semibold text-muted group-open:hidden">Buka</span>
        <span className="hidden text-sm font-semibold text-muted group-open:inline">Tutup</span>
      </summary>
      {children}
    </details>
  );
}
