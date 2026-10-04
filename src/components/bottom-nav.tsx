"use client";

import { History, LayoutGrid, Menu, ScanLine } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./ui";

const ITEMS = [
  { href: "/ronda", label: "Ronda", icon: ScanLine },
  { href: "/riwayat", label: "Riwayat", icon: History },
  { href: "/rekap", label: "Rekap", icon: LayoutGrid },
  { href: "/menu", label: "Menu", icon: Menu },
];

export function BottomNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur print:hidden">
      <ul className="mx-auto grid max-w-3xl grid-cols-4">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active =
            pathname === href ||
            pathname.startsWith(`${href}/`) ||
            (href === "/menu" && pathname.startsWith("/admin"));
          return (
            <li key={href}>
              <Link
                href={href}
                className={cx(
                  "flex flex-col items-center gap-0.5 py-2 text-xs font-medium",
                  active ? "text-primary" : "text-muted",
                )}
              >
                <Icon className="size-6" strokeWidth={active ? 2.4 : 1.8} aria-hidden />
                {href === "/menu" && isAdmin ? "Admin" : label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
