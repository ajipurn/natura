import { useActionState } from "react";
import { Navigate } from "react-router";
import { api, call, errorMessage } from "@/client/api";
import { useAuth } from "@/client/auth";
import { int, str, type FormState } from "@/client/form";
import { queryClient } from "@/client/query";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Card, Field, PageTitle, inputClass } from "@/components/ui";

async function setupAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const { user } = await call(
      api.auth.setup.$post({
        json: {
          communityName: str(formData, "communityName"),
          defaultAmount: int(formData, "defaultAmount"),
          name: str(formData, "name"),
          pin: str(formData, "pin"),
          pinConfirm: str(formData, "pinConfirm"),
        },
      }),
    );
    // Status login berubah → halaman ini pindah ke Ringkasan (berisi daftar yang perlu disiapkan).
    queryClient.setQueryData(["auth"], { setupNeeded: false, user });
    return undefined;
  } catch (err) {
    return { error: errorMessage(err) };
  }
}

/** Pertama kali dipakai: buat admin pertama. */
export function SetupPage() {
  const auth = useAuth();
  const [state, formAction] = useActionState(setupAction, undefined);

  if (auth.data && !auth.data.setupNeeded) return <Navigate to="/admin" replace />;

  return (
    <main className="mx-auto w-full max-w-md px-4 py-10">
      <PageTitle title="Mulai" />
      <p className="text-sm font-medium text-primary">Jimpitan</p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight">Siapkan aplikasi</h1>
      <p className="mt-2 text-muted">Isi sekali saja. Setelah ini kamu bisa menambah rumah dan petugas ronda.</p>
      <form action={formAction} className="mt-6 space-y-4">
        <Card className="space-y-4">
          <h2 className="font-semibold">Lingkungan</h2>
          <Field label="Nama lingkungan" hint="Muncul di rekap dan stiker QR.">
            <input name="communityName" required maxLength={80} placeholder="Cluster Natura" className={inputClass} />
          </Field>
          <Field label="Nominal jimpitan per rumah (Rp)" hint="Bisa diubah nanti dan saat mencatat.">
            <input name="defaultAmount" required inputMode="numeric" defaultValue="500" className={inputClass} />
          </Field>
        </Card>

        <Card className="space-y-4">
          <h2 className="font-semibold">Akun admin</h2>
          <Field label="Nama">
            <input name="name" required maxLength={40} autoComplete="name" placeholder="Pak Budi" className={inputClass} />
          </Field>
          <Field label="PIN (4–6 angka)">
            <input
              name="pin"
              required
              type="password"
              inputMode="numeric"
              pattern="\d{4,6}"
              autoComplete="new-password"
              className={inputClass}
            />
          </Field>
          <Field label="Ulangi PIN">
            <input
              name="pinConfirm"
              required
              type="password"
              inputMode="numeric"
              pattern="\d{4,6}"
              autoComplete="new-password"
              className={inputClass}
            />
          </Field>
        </Card>

        {state?.error && <Alert>{state.error}</Alert>}
        <SubmitButton size="lg" className="w-full" pendingText="Menyiapkan…">
          Mulai
        </SubmitButton>
      </form>
    </main>
  );
}
