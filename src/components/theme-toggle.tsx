import { Moon, Sun } from "lucide-react";
import { setTheme, useTheme } from "@/client/theme";
import { SwitchControl } from "./choice";
import { Button, cx } from "./ui";

/** Tombol ikon mode gelap, mis. di kepala halaman warga. */
export function ThemeButton({ className }: { className?: string }) {
  const dark = useTheme() === "dark";
  return (
    <Button
      variant="secondary"
      size="icon-sm"
      aria-label="Mode gelap"
      aria-pressed={dark}
      title={dark ? "Ganti ke mode terang" : "Ganti ke mode gelap"}
      onClick={() => setTheme(dark ? "light" : "dark")}
      className={className}
    >
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}

/** Baris "Mode gelap" dengan sakelar, untuk menu seperti sidebar admin. */
export function ThemeSwitch({ className }: { className?: string }) {
  const dark = useTheme() === "dark";
  return (
    <label className={cx("flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2 text-sm font-medium hover:bg-idle-soft", className)}>
      <Moon className="size-5 text-primary" aria-hidden /> Mode gelap
      <SwitchControl checked={dark} onCheckedChange={(on) => setTheme(on ? "dark" : "light")} className="ml-auto" />
    </label>
  );
}
