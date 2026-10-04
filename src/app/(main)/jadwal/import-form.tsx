"use client";

import { startTransition, useActionState, useMemo, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Alert, buttonClass, cx, inputClass } from "@/components/ui";
import { analyzeSchedule, DAY_NAMES, parseSchedule } from "@/lib/schedule";
import { clearScheduleAction, importScheduleAction } from "./actions";

const EXAMPLE = `Ahad (malam Senin)
Yusuf (AD-3)
Widi (AA-12)

Senin: Nino (AB-3), Sahrul (AF-19), (AB-5)`;

export function ScheduleImportForm({ houseKeys, hasSchedule }: { houseKeys: string[]; hasSchedule: boolean }) {
  const [text, setText] = useState("");
  const [state, formAction, pending] = useActionState(importScheduleAction, undefined);
  const [clearState, clearAction] = useActionState(clearScheduleAction, undefined);

  const preview = useMemo(() => parseSchedule(text), [text]);
  const known = useMemo(() => new Set(houseKeys), [houseKeys]);
  const analysis = useMemo(() => analyzeSchedule(preview.entries, known), [preview, known]);
  const perDay = DAY_NAMES.map((_, day) => preview.entries.filter((e) => e.day === day).length);

  return (
    <div className="mt-3 space-y-3">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          // Kirim manual supaya teks yang ditempel tidak hilang kalau ada kesalahan.
          e.preventDefault();
          if (hasSchedule && !window.confirm("Jadwal yang sekarang akan diganti. Lanjut?")) return;
          const formData = new FormData(e.currentTarget);
          startTransition(() => formAction(formData));
        }}
      >
        <p className="text-sm text-muted">
          Salin tabel jadwal dari Excel / Google Sheets (judul hari + isinya), lalu tempel di sini. Bisa juga diketik per
          hari, seperti contoh.
        </p>
        <textarea
          name="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          placeholder={EXAMPLE}
          className={cx(inputClass, "h-auto py-2 font-mono text-sm")}
          aria-label="Teks jadwal ronda"
        />

        {text.trim() && (
          <div className="space-y-2 rounded-xl bg-idle-soft p-3 text-sm">
            <p className="font-semibold">
              {preview.entries.length > 0
                ? `Terbaca ${preview.entries.length} baris jadwal`
                : "Belum ada jadwal yang terbaca — pastikan ada nama hari dan kode rumah seperti (AD-3)."}
            </p>
            {preview.entries.length > 0 && (
              <ul className="flex flex-wrap gap-1.5">
                {DAY_NAMES.map((name, day) => (
                  <li
                    key={name}
                    className={cx(
                      "rounded-full px-2.5 py-0.5 text-xs font-medium",
                      perDay[day] ? "bg-card text-fg" : "bg-card/50 text-muted",
                    )}
                  >
                    {name} {perDay[day]}
                  </li>
                ))}
              </ul>
            )}
            {analysis.unknown.length > 0 && (
              <p className="text-warn">Belum ada di data rumah: {analysis.unknown.join(", ")}</p>
            )}
            {analysis.conflicting.length > 0 && (
              <p className="text-warn">Nama ganda (nama KK-nya tidak akan diisi): {analysis.conflicting.join("; ")}</p>
            )}
            {preview.warnings.map((w) => (
              <p key={w} className="text-warn">
                {w}
              </p>
            ))}
          </div>
        )}

        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="fillNames" defaultChecked className="mt-0.5 size-4 accent-[var(--primary)]" />
          <span>Isi nama KK dari jadwal (hanya rumah yang nama KK-nya masih kosong)</span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="overwriteNames" className="mt-0.5 size-4 accent-[var(--primary)]" />
          <span>Ganti juga nama KK yang sudah terisi</span>
        </label>

        {state?.error && <Alert>{state.error}</Alert>}
        {state?.success && <Alert tone="success">{state.success}</Alert>}
        <button
          type="submit"
          disabled={pending || preview.entries.length === 0}
          className={cx(buttonClass("primary"), "w-full")}
        >
          {pending ? "Menyimpan…" : "Simpan jadwal"}
        </button>
      </form>

      {hasSchedule && (
        <form action={clearAction} className="border-t border-line pt-3">
          <SubmitButton variant="danger" size="sm" confirm="Hapus seluruh jadwal ronda?" pendingText="Menghapus…">
            Hapus jadwal
          </SubmitButton>
          {clearState?.success && <p className="mt-2 text-sm text-filled">{clearState.success}</p>}
        </form>
      )}
    </div>
  );
}
