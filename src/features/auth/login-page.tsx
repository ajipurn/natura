import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router";
import { api, call, errorMessage } from "@/client/api";
import { loginNext, useAuth } from "@/client/auth";
import { clearCache, queryClient } from "@/client/query";
import { ErrorCard } from "@/components/query-state";
import { Select } from "@/components/select";
import { Alert, Button, Field, Input, PageTitle } from "@/components/ui";

const LAST_USER_KEY = "jimpitan:last-user";

function lastUser(): string {
  try {
    return localStorage.getItem(LAST_USER_KEY) ?? "";
  } catch {
    return "";
  }
}

/** Layar masuk dengan nama + PIN (dipakai app petugas dan admin). */
export function LoginPage({ title, homePath, setupPath }: { title: string; homePath: string; setupPath: string }) {
  const [params] = useSearchParams();
  const next = loginNext(params.get("next"), homePath);
  const navigate = useNavigate();
  const auth = useAuth();
  const users = useQuery({ queryKey: ["auth", "users"], queryFn: () => call(api.auth.users.$get()) });
  const [userId, setUserId] = useState(lastUser);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const pinRef = useRef<HTMLInputElement>(null);

  // PIN salah: kosongkan PIN saja, nama tetap terpilih.
  useEffect(() => {
    if (error && pinRef.current) {
      pinRef.current.value = "";
      pinRef.current.focus();
    }
  }, [error]);

  // Alamat di luar app ini (mis. /r/KODE dari halaman rumah) dibuka sebagai halaman baru.
  const go = (to: string) => (to.startsWith(homePath) ? navigate(to, { replace: true }) : window.location.replace(to));

  if (auth.data?.setupNeeded) return <ExternalOrRoute to={setupPath} homePath={homePath} />;
  if (auth.data?.user && !pending) return <ExternalOrRoute to={next} homePath={homePath} />;

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
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
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10">
      <PageTitle title="Masuk" />
      <p className="text-sm font-medium text-primary">Cluster Natura</p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight">{title}</h1>
      {users.isError ? (
        <div className="mt-6">
          <ErrorCard message={errorMessage(users.error)} onRetry={() => void users.refetch()} />
        </div>
      ) : (
        <form className="mt-6 space-y-4" onSubmit={submit}>
          <Select
            label="Nama"
            name="userId"
            required
            value={list.some((u) => String(u.id) === userId) ? userId : ""}
            onValueChange={setUserId}
            // Blok/nomor rumah tampil di samping nama, jadi nama kembar tetap bisa dibedakan.
            options={list.map((u) => ({ value: String(u.id), label: u.name, hint: u.house ?? undefined }))}
            placeholder={users.isPending ? "Memuat…" : "Pilih nama…"}
            disabled={users.isPending}
          />
          <Field label="PIN">
            <Input
              ref={pinRef}
              name="pin"
              required
              type="password"
              inputMode="numeric"
              pattern="\d{4,6}"
              autoComplete="current-password"
              className="text-center text-2xl tracking-[0.5em]"
            />
          </Field>
          {error && <Alert>{error}</Alert>}
          <Button type="submit" disabled={pending} size="lg" className="w-full">
            {pending ? "Memeriksa…" : "Masuk"}
          </Button>
          <p className="text-center text-sm text-muted">Lupa PIN? Minta admin untuk mengatur ulang.</p>
        </form>
      )}
    </main>
  );
}

function ExternalOrRoute({ to, homePath }: { to: string; homePath: string }) {
  const external = !to.startsWith(homePath);
  useEffect(() => {
    if (external) window.location.replace(to);
  }, [external, to]);
  return external ? null : <Navigate to={to} replace />;
}
