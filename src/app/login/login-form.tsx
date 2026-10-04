"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { Alert, Field, buttonClass, cx, inputClass } from "@/components/ui";
import { loginAction } from "./actions";

const LAST_USER_KEY = "jimpitan:last-user";

export function LoginForm({ users, next }: { users: { id: number; name: string }[]; next: string }) {
  const [state, formAction, pending] = useActionState(loginAction, undefined);
  const [userId, setUserId] = useState("");
  const pinRef = useRef<HTMLInputElement>(null);

  // Ingat nama terakhir supaya petugas cukup mengetik PIN.
  useEffect(() => {
    try {
      const last = localStorage.getItem(LAST_USER_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- baca localStorage hanya bisa setelah mount
      if (last && users.some((u) => String(u.id) === last)) setUserId(last);
    } catch {
      // localStorage bisa diblokir; abaikan.
    }
  }, [users]);

  // PIN salah: kosongkan PIN saja, nama tetap terpilih.
  useEffect(() => {
    if (state?.error && pinRef.current) {
      pinRef.current.value = "";
      pinRef.current.focus();
    }
  }, [state]);

  return (
    <form
      className="mt-6 space-y-4"
      onSubmit={(e) => {
        // Kirim manual supaya React tidak me-reset form (pilihan nama hilang) setelah PIN salah.
        e.preventDefault();
        try {
          localStorage.setItem(LAST_USER_KEY, userId);
        } catch {}
        const formData = new FormData(e.currentTarget);
        startTransition(() => formAction(formData));
      }}
    >
      <input type="hidden" name="next" value={next} />
      <Field label="Nama">
        <select
          name="userId"
          required
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          className={inputClass}
        >
          <option value="" disabled>
            Pilih nama…
          </option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="PIN">
        <input
          ref={pinRef}
          name="pin"
          required
          type="password"
          inputMode="numeric"
          pattern="\d{4,6}"
          autoComplete="current-password"
          className={`${inputClass} text-center text-2xl tracking-[0.5em]`}
        />
      </Field>
      {state?.error && <Alert>{state.error}</Alert>}
      <button type="submit" disabled={pending} className={cx(buttonClass("primary", "lg"), "w-full")}>
        {pending ? "Memeriksa…" : "Masuk"}
      </button>
      <p className="text-center text-sm text-muted">Lupa PIN? Minta admin untuk mengatur ulang.</p>
    </form>
  );
}
