import { Menu as BaseMenu } from "@base-ui/react/menu";
import { MoreHorizontal } from "lucide-react";
import type { ReactNode } from "react";
import { Button, cx } from "./ui";

export type MenuItem =
  | { label: string; icon?: ReactNode; onSelect: () => void; danger?: boolean; disabled?: boolean }
  | { heading: string };

type Section = { heading?: string; items: Extract<MenuItem, { label: string }>[] };

/** Tombol "⋯" dengan daftar aksi (Base UI Menu). Esc atau klik di luar menutup menu. */
export function Menu({ label, items, className }: { label: string; items: MenuItem[]; className?: string }) {
  // `heading` membuka kelompok baru sampai heading berikutnya.
  const sections: Section[] = [];
  for (const item of items) {
    if ("heading" in item) sections.push({ heading: item.heading, items: [] });
    else {
      if (sections.length === 0) sections.push({ items: [] });
      sections[sections.length - 1].items.push(item);
    }
  }

  return (
    <BaseMenu.Root>
      <BaseMenu.Trigger aria-label={label} render={<Button variant="ghost" size="icon-sm" className={className} />}>
        <MoreHorizontal className="size-5" />
      </BaseMenu.Trigger>
      <BaseMenu.Portal>
        <BaseMenu.Positioner className="z-50 outline-none" sideOffset={4} align="end">
          <BaseMenu.Popup className="min-w-44 origin-[var(--transform-origin)] rounded-xl border border-line bg-card py-1 text-fg shadow-lg outline-none transition-[opacity,scale] duration-100 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0 motion-reduce:transition-none">
            {sections.map((section, i) => (
              <BaseMenu.Group key={i}>
                {section.heading && (
                  <BaseMenu.GroupLabel className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted">
                    {section.heading}
                  </BaseMenu.GroupLabel>
                )}
                {section.items.map((item) => (
                  <BaseMenu.Item
                    key={item.label}
                    disabled={item.disabled}
                    onClick={item.onSelect}
                    className={cx(
                      "flex w-full cursor-default select-none items-center gap-2 px-3 py-2 text-left text-sm outline-none data-disabled:opacity-40 data-highlighted:bg-idle-soft",
                      item.danger && "text-empty",
                    )}
                  >
                    {item.icon}
                    {item.label}
                  </BaseMenu.Item>
                ))}
              </BaseMenu.Group>
            ))}
          </BaseMenu.Popup>
        </BaseMenu.Positioner>
      </BaseMenu.Portal>
    </BaseMenu.Root>
  );
}
