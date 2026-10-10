import { useMutation } from "@tanstack/react-query";
import { Field } from "@base-ui/react/field";
import {
  ChevronRight,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Moon,
  Smartphone,
} from "lucide-react";
import { useNavigate } from "react-router";
import { api, call } from "@/client/api";
import { useAuth } from "@/client/auth";
import { clearCache } from "@/client/query";
import { setTheme, useTheme } from "@/client/theme";
import { SwitchControl } from "@/components/choice";
import { Collapsible } from "@/components/collapsible";
import { ChangePinForm } from "@/features/auth/change-pin-form";
import { MySchedule } from "./my-schedule";
import {
  Alert,
  Button,
  Card,
  PageHeader,
  SectionTitle,
  cx,
} from "@/components/ui";
import { adminPath, petugasPath } from "@/lib/app-paths";
import { isManager, ROLE_LABEL } from "@/lib/permissions";

export function AkunPage() {
  const user = useAuth().data?.user;
  const dark = useTheme() === "dark";
  const navigate = useNavigate();
  const logout = useMutation({
    mutationFn: () => call(api.auth.logout.$post()),
    onSuccess: () => {
      clearCache();
      try {
        localStorage.removeItem("jimpitan:auth");
      } catch {}
      navigate(petugasPath("/masuk"), { replace: true });
    },
  });
  if (!user) return null;

  return (
    <main>
      <PageHeader title="Akun" subtitle="Pengaturan akun dan jadwal jagamu." />

      <Card className="flex items-center gap-4">
        <div
          aria-hidden
          className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-2xl font-semibold text-primary"
        >
          {Array.from(user.name.trim())[0]?.toLocaleUpperCase("id-ID")}
        </div>
        <div className="min-w-0">
          <h2 className="text-xl font-semibold tracking-tight [overflow-wrap:anywhere]">
            {user.name}
          </h2>
          <p className="mt-1 text-sm text-muted">{ROLE_LABEL[user.role]}</p>
        </div>
      </Card>

      <nav
        aria-label="Akses cepat"
        className={cx(
          "mt-3 grid gap-3",
          isManager(user.role) && "sm:grid-cols-2",
        )}
      >
        {/* <Link
          to={wargaPath()}
          className="flex items-center gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4 transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 active:bg-primary/15"
        >
          <Megaphone className="size-5 shrink-0 text-primary" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-primary">Buka info warga</span>
            <span className="mt-0.5 block text-xs text-muted">Pengumuman, rekap, dan kas</span>
          </span>
          <ChevronRight className="size-4 shrink-0 text-primary" aria-hidden />
        </Link> */}
        {isManager(user.role) && (
          <a
            href={adminPath("/")}
            className="flex items-center gap-3 rounded-2xl border border-line bg-card p-4 transition-colors hover:bg-idle-soft/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 active:bg-idle-soft"
          >
            <LayoutDashboard
              className="size-5 shrink-0 text-primary"
              aria-hidden
            />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">
                Buka dashboard pengurus
              </span>
              <span className="mt-0.5 block text-xs text-muted">
                Kelola jimpitan dan ronda
              </span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
          </a>
        )}
      </nav>

      <SectionTitle>Jadwal jagamu</SectionTitle>
      <MySchedule />

      <SectionTitle>Pengaturan</SectionTitle>
      <Card className="divide-y divide-line p-0">
        <Field.Root className="flex items-center gap-3 p-4">
          <Moon className="size-5 shrink-0 text-muted" aria-hidden />
          <div className="min-w-0 flex-1">
            <Field.Label className="block cursor-pointer text-sm font-medium">
              Mode gelap
            </Field.Label>
            <Field.Description className="mt-0.5 block text-xs text-muted">
              Lebih nyaman di malam hari. Berlaku di HP ini.
            </Field.Description>
          </div>
          <SwitchControl
            checked={dark}
            onCheckedChange={(on) => setTheme(on ? "dark" : "light")}
            className="after:absolute after:-inset-x-1 after:-inset-y-2.5"
          />
        </Field.Root>

        <Collapsible
          triggerClassName="gap-3 rounded-xl p-4 transition-colors hover:bg-idle-soft/40"
          title={
            <span className="flex items-center gap-3">
              <KeyRound className="size-5 shrink-0 text-muted" aria-hidden />
              <span className="min-w-0">
                <span className="block text-sm font-medium">Ganti PIN</span>
                <span className="mt-0.5 block text-xs text-muted">
                  Perbarui PIN untuk masuk ke akunmu.
                </span>
              </span>
            </span>
          }
        >
          <div className="px-4 pb-4 pt-1">
            <ChangePinForm />
          </div>
        </Collapsible>

        <Collapsible
          triggerClassName="gap-3 rounded-xl p-4 transition-colors hover:bg-idle-soft/40"
          title={
            <span className="flex items-center gap-3">
              <Smartphone className="size-5 shrink-0 text-muted" aria-hidden />
              <span className="min-w-0">
                <span className="block text-sm font-medium">
                  Pasang di layar utama
                </span>
                <span className="mt-0.5 block text-xs text-muted">
                  Buka aplikasi lebih cepat dari HP.
                </span>
              </span>
            </span>
          }
        >
          <div className="space-y-3 px-4 pb-4 pt-1 text-sm">
            <p className="text-muted">
              Pasang Cluster Natura agar app mudah dibuka dari layar utama HP.
              Pencatatan ronda tetap bisa dipakai saat offline.
            </p>
            <dl className="space-y-2">
              <div>
                <dt className="font-medium">Chrome (Android)</dt>
                <dd className="text-muted">
                  Buka menu browser → Tambahkan ke layar utama.
                </dd>
              </div>
              <div>
                <dt className="font-medium">Safari (iPhone)</dt>
                <dd className="text-muted">
                  Pilih Bagikan → Tambah ke Layar Utama.
                </dd>
              </div>
            </dl>
          </div>
        </Collapsible>
      </Card>

      <Button
        variant="danger"
        disabled={logout.isPending}
        onClick={() => logout.mutate()}
        className="mt-6 w-full"
      >
        <LogOut className="size-5" aria-hidden />{" "}
        {logout.isPending ? "Keluar…" : "Keluar dari akun"}
      </Button>
      {logout.isError && (
        <div className="mt-2">
          <Alert>{logout.error.message}</Alert>
        </div>
      )}
    </main>
  );
}
