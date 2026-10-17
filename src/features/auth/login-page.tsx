import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Eye, EyeOff, KeyRound, LoaderCircle } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router";
import { api, call, errorMessage, errorTitle } from "@/client/api";
import { loginNext, useAuth } from "@/client/auth";
import { clearCache, queryClient } from "@/client/query";
import { ErrorCard } from "@/components/query-state";
import { Select } from "@/components/select";
import { ThemeButton } from "@/components/theme-toggle";
import { Tooltip } from "@/components/tooltip";
import { Alert, Button, cx, Field, Input, PageTitle } from "@/components/ui";
import { DEFAULT_LOGO_URL } from "@/lib/branding";
import { petugasPath, sameAppPath } from "@/lib/app-paths";

const LAST_USER_KEY = "jimpitan:last-user";

function lastUser(): string {
  try {
    return localStorage.getItem(LAST_USER_KEY) ?? "";
  } catch {
    return "";
  }
}

/** Layar masuk dengan nama + PIN untuk app warga/petugas dan dashboard. */
export function LoginPage({ title, homePath, setupPath }: { title: string; homePath: string; setupPath: string }) {
  const [params] = useSearchParams();
  const next = loginNext(params.get("next"), homePath);
  const navigate = useNavigate();
  const auth = useAuth();
  const users = useQuery({ queryKey: ["auth", "users"], queryFn: () => call(api.auth.users.$get()) });
  const [userId, setUserId] = useState(lastUser);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const pinRef = useRef<HTMLInputElement>(null);
  const pinId = useId();
  const errorId = useId();

  // PIN salah: kosongkan PIN saja, nama tetap terpilih.
  useEffect(() => {
    if (error && pinRef.current) {
      pinRef.current.value = "";
      pinRef.current.focus();
    }
  }, [error]);

  // Alamat di luar app ini (mis. /r/KODE dari halaman rumah) dibuka sebagai halaman baru.
  const go = (to: string) => (sameAppPath(to, homePath) ? navigate(to, { replace: true }) : window.location.replace(to));

  if (auth.data?.setupNeeded) return <ExternalOrRoute to={setupPath} homePath={homePath} />;
  if (auth.data?.user && !pending) return <ExternalOrRoute to={next} homePath={homePath} />;

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending || users.isPending) return;
    const pin = pinRef.current?.value ?? "";
    setPending(true);
    setError(null);
    try {
      const { user } = await call(api.auth.login.$post({ json: { userId: Number(userId), pin } }));
      try {
        localStorage.setItem(LAST_USER_KEY, userId);
      } catch {}
      clearCache();
      queryClient.setQueryData(["auth"], { setupNeeded: false, user });
      go(next);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  const list = users.data?.users ?? [];
  return (
    <main className="mobile-app flex min-h-dvh w-full flex-1 flex-col justify-center px-5 pb-[max(2rem,env(safe-area-inset-bottom,0px))] pt-[max(2rem,env(safe-area-inset-top,0px))] sm:py-12">
      <PageTitle title={title} />
      <div className="mx-auto w-full max-w-md">
        <header className="mb-8 flex items-center justify-between gap-4 px-1">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-line/60"><img src={DEFAULT_LOGO_URL} alt="" className="size-9 object-contain" /></span>
            <div>
              <p className="font-semibold tracking-tight">Cluster Natura</p>
              <p className="text-xs text-muted">{homePath === petugasPath() ? "Info warga & ronda" : "Dashboard pengurus"}</p>
            </div>
          </div>
          <ThemeButton className="size-11 rounded-xl transition-[background-color,color,box-shadow,scale] active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100" />
        </header>

        <div className="rounded-[2rem] bg-card p-6 shadow-[0_8px_40px_-20px_#0f172a30] ring-1 ring-line/60 sm:p-8">
          <span className="mb-6 flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><KeyRound className="size-6" aria-hidden /></span>
          <h1 className="text-balance text-3xl font-bold tracking-tight">{title}</h1>
          <p className="mt-2 text-pretty text-sm leading-relaxed text-muted">Pilih nama atau rumah, lalu masukkan PIN untuk melanjutkan.</p>
          {users.isError ? (
            <div className="mt-6">
              <ErrorCard title={errorTitle(users.error)} message={errorMessage(users.error)} onRetry={() => void users.refetch()} />
            </div>
          ) : (
            <form className="mt-6 space-y-5" onSubmit={submit} aria-busy={pending}>
              <Select
                label="Nama atau rumah"
                searchPlaceholder="Cari nama atau rumah…"
                name="userId"
                required
                value={list.some((u) => String(u.id) === userId) ? userId : ""}
                onValueChange={setUserId}
                // Blok/nomor rumah tampil di samping nama, jadi nama kembar tetap bisa dibedakan.
                options={list.map((u) => ({ value: String(u.id), label: u.name, hint: u.house ?? undefined }))}
                placeholder={users.isPending ? "Memuat nama…" : "Pilih nama atau rumah…"}
                disabled={users.isPending || pending}
                className="h-12 rounded-2xl bg-bg/60"
              />
              <Field label="PIN" hint="Gunakan PIN 4–6 angka.">
                <div className="relative">
                  <Input
                    ref={pinRef}
                    id={pinId}
                    name="pin"
                    required
                    type={showPin ? "text" : "password"}
                    inputMode="numeric"
                    pattern="\d{4,6}"
                    maxLength={6}
                    autoComplete="current-password"
                    enterKeyHint="go"
                    placeholder="••••"
                    readOnly={pending}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? errorId : undefined}
                    className={cx("h-12 rounded-2xl bg-bg/60 pe-14 text-xl tracking-[0.35em]", error && "border-empty focus:border-empty focus:ring-empty")}
                  />
                  <Tooltip label={showPin ? "Sembunyikan PIN" : "Tampilkan PIN"}>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Tampilkan PIN"
                      aria-pressed={showPin}
                      aria-controls={pinId}
                      disabled={pending}
                      onClick={() => setShowPin((shown) => !shown)}
                      className="absolute end-0 top-0 size-12 rounded-2xl transition-[background-color,color,box-shadow,scale] active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100"
                    >
                      <Eye className={cx("size-5 transition-[opacity,scale,filter] duration-300 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none", showPin ? "scale-[0.25] opacity-0 blur-[4px]" : "scale-100 opacity-100 blur-0")} aria-hidden />
                      <EyeOff className={cx("absolute size-5 transition-[opacity,scale,filter] duration-300 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none", showPin ? "scale-100 opacity-100 blur-0" : "scale-[0.25] opacity-0 blur-[4px]")} aria-hidden />
                    </Button>
                  </Tooltip>
                </div>
              </Field>
              {error && <div id={errorId}><Alert>{error}</Alert></div>}
              <Button
                type="submit"
                disabled={pending || users.isPending}
                focusableWhenDisabled
                size="lg"
                className="h-12 w-full rounded-2xl text-base transition-[background-color,box-shadow,scale] hover:bg-primary/90 active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100"
              >
                {pending ? <LoaderCircle className="size-5 motion-safe:animate-spin" aria-hidden /> : null}
                {pending ? "Memeriksa…" : "Masuk"}
                {!pending && <ArrowRight className="size-5" aria-hidden />}
              </Button>
            </form>
          )}
        </div>

        <p className="mt-6 px-4 text-center text-pretty text-sm leading-relaxed text-muted">
          <span className="font-medium text-fg">Lupa PIN?</span> Minta admin untuk mengatur ulang.
        </p>
      </div>
    </main>
  );
}

function ExternalOrRoute({ to, homePath }: { to: string; homePath: string }) {
  const external = !sameAppPath(to, homePath);
  useEffect(() => {
    if (external) window.location.replace(to);
  }, [external, to]);
  return external ? null : <Navigate to={to} replace />;
}
