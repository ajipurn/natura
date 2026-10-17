import { useMutation } from "@tanstack/react-query";
import { Field } from "@base-ui/react/field";
import {
  CalendarDays,
  ChevronRight,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Moon,
  Smartphone,
} from "lucide-react";
import { Link, useNavigate } from "react-router";
import { api, call } from "@/client/api";
import { useAuth } from "@/client/auth";
import { clearCache } from "@/client/query";
import { setTheme, useTheme } from "@/client/theme";
import { SwitchControl } from "@/components/choice";
import { Collapsible } from "@/components/collapsible";
import { ChangePinForm } from "@/features/auth/change-pin-form";
import {
  Alert,
  Button,
  Card,
  PageHeader,
} from "@/components/ui";
import { adminPath, petugasPath } from "@/lib/app-paths";
import { canRonda, isManager, ROLE_LABEL } from "@/lib/permissions";

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
      <PageHeader title="Akun" subtitle="Profil dan pengaturan akun." />

      <Card className="flex items-center gap-4 border-0 bg-primary p-5 text-primary-fg">
        <div
          aria-hidden
          className="flex size-16 shrink-0 items-center justify-center rounded-[1.25rem] bg-primary-fg/15 text-2xl font-semibold"
        >
          {Array.from(user.name.trim())[0]?.toLocaleUpperCase("id-ID")}
        </div>
        <div className="min-w-0">
          <h2 className="text-xl font-semibold tracking-tight [overflow-wrap:anywhere]">
            {user.name}
          </h2>
          <p className="mt-2 inline-flex rounded-full bg-primary-fg/15 px-2.5 py-1 text-xs font-medium">{ROLE_LABEL[user.role]}</p>
        </div>
      </Card>

      <nav
        aria-label="Akses cepat"
        className="mt-5 divide-y divide-line/70 overflow-hidden rounded-3xl border border-line/75 bg-card"
      >
        <Link
          to={petugasPath("/akun/jadwal")}
          className="flex items-center gap-3 p-4 transition-colors hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-primary focus-visible:-outline-offset-4 active:bg-primary/10"
        >
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary"><CalendarDays className="size-5" aria-hidden /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">Jadwal ronda</span>
            <span className="mt-0.5 block text-xs text-muted">
              {canRonda(user.role) ? "Giliran jaga dan permintaan jadwal." : "Lihat jadwal petugas ronda."}
            </span>
          </span>
          <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
        </Link>
        {isManager(user.role) && (
          <a
            href={adminPath("/")}
            className="flex items-center gap-3 p-4 transition-colors hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-primary focus-visible:-outline-offset-4 active:bg-primary/10"
          >
            <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-cadence-monthly-soft text-cadence-monthly">
              <LayoutDashboard className="size-5" aria-hidden />
            </span>
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

      <h2 className="mb-3 mt-7 text-base font-semibold tracking-tight">Pengaturan</h2>
      <Card className="divide-y divide-line p-0">
        <Field.Root className="flex items-center gap-3 p-4">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-bg text-muted"><Moon className="size-5" aria-hidden /></span>
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
              <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-bg text-muted"><KeyRound className="size-5" aria-hidden /></span>
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
              <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-bg text-muted"><Smartphone className="size-5" aria-hidden /></span>
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
              {canRonda(user.role) && " Pencatatan ronda tetap bisa dipakai saat offline."}
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
