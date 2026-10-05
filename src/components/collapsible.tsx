import { Collapsible as BaseCollapsible } from "@base-ui/react/collapsible";
import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "./ui";

/**
 * Bagian yang bisa dibuka-tutup (Base UI Collapsible). Status bukanya disimpan di komponen, jadi
 * tidak ikut tertutup saat halaman dirender ulang setelah menyimpan.
 * `title` = isi tombol pembuka; `card` = tampil sebagai kartu.
 */
export function Collapsible({
  title,
  defaultOpen = false,
  card = false,
  className,
  triggerClassName,
  children,
}: {
  title: ReactNode;
  defaultOpen?: boolean;
  card?: boolean;
  className?: string;
  triggerClassName?: string;
  children: ReactNode;
}) {
  return (
    <BaseCollapsible.Root defaultOpen={defaultOpen} className={cx(card && "rounded-2xl border border-line bg-card p-4", className)}>
      <BaseCollapsible.Trigger
        className={cx(
          "group flex w-full cursor-pointer items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
          triggerClassName,
        )}
      >
        <span className="min-w-0 flex-1">{title}</span>
        <ChevronDown className="size-4 shrink-0 text-muted transition-transform group-data-panel-open:rotate-180 motion-reduce:transition-none" />
      </BaseCollapsible.Trigger>
      <BaseCollapsible.Panel>{children}</BaseCollapsible.Panel>
    </BaseCollapsible.Root>
  );
}
