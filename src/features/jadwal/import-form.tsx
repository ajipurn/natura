import { startTransition, useActionState, useMemo, useState } from "react";
import { api, call } from "@/client/api";
import { checked, runForm, type FormState } from "@/client/form";
import { CheckboxField } from "@/components/choice";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Button, Textarea, cx } from "@/components/ui";
import { guardColorClass } from "@/components/guard-color-class";
import { GUARD_COLOR_LABEL, GUARD_COLORS, type GuardColor } from "@/lib/guard-color";
import { analyzeSchedule, DAY_NAMES, parseSchedule } from "@/lib/schedule";
import { tableFromHtml, type PastedTable } from "@/lib/table-paste";

const REFRESH = [["jadwal"], ["admin"], ["ronda"]];

function importScheduleAction(_prev: FormState, formData: FormData) {
  // Teks tidak dipangkas: sel kosong di awal baris judul tabel menentukan posisi kolom hari.
  const text = formData.get("text");
  const colors = formData.get("colors");
  return runForm(
    () =>
      call(
        api.admin.jadwal.$put({
          json: {
            text: typeof text === "string" ? text : "",
            fillNames: checked(formData, "fillNames"),
            overwriteNames: checked(formData, "overwriteNames"),
            ...(typeof colors === "string" && colors && { colors: JSON.parse(colors) as (GuardColor | null)[] }),
          },
        }),
      ),
    { invalidate: REFRESH },
  );
}

function clearScheduleAction() {
  return runForm(() => call(api.admin.jadwal.$delete()), { invalidate: REFRESH });
}

const EXAMPLE = `Ahad (malam Senin)
Yusuf (AD-3)
Widi (AA-12)

Senin: Nino (AB-3), Sahrul (AF-19), (AB-5)`;

export function ScheduleImportForm({
  houseKeys,
  hasSchedule,
  onChanged,
}: {
  houseKeys: string[];
  hasSchedule: boolean;
  /** Dipanggil setelah jadwal berhasil diganti atau dihapus. */
  onChanged?: () => void;
}) {
  const [text, setText] = useState("");
  // Tabel yang ditempel dari Excel/Sheets beserta warna selnya (berlaku selama teksnya belum diubah).
  const [pasted, setPasted] = useState<PastedTable | null>(null);
  const [state, formAction, pending] = useActionState(async (prev: FormState, formData: FormData) => {
    const result = await importScheduleAction(prev, formData);
    if (result?.success) onChanged?.();
    return result;
  }, undefined);
  const [clearState, clearAction] = useActionState(async () => {
    const result = await clearScheduleAction();
    if (result?.success) onChanged?.();
    return result;
  }, undefined);

  const preview = useMemo(() => parseSchedule(text), [text]);
  const known = useMemo(() => new Set(houseKeys), [houseKeys]);
  const analysis = useMemo(() => analyzeSchedule(preview.entries, known), [preview, known]);
  const perDay = DAY_NAMES.map((_, day) => preview.entries.filter((e) => e.day === day).length);
  const colors =
    pasted && pasted.text === text ? preview.entries.map((e) => (e.cell ? (pasted.colors[e.cell.row]?.[e.cell.col] ?? null) : null)) : null;
  const colorCounts = colors && GUARD_COLORS.map((c) => [c, colors.filter((x) => x === c).length] as const).filter(([, n]) => n > 0);

  return (
    <div className="space-y-3">
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
          Salin tabel jadwal dari Excel / Google Sheets (judul hari + isinya), lalu tempel di sini; warna selnya ikut
          terbawa. Bisa juga diketik per hari, seperti contoh.
        </p>
        <Textarea
          name="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onPaste={(e) => {
            // Tabel dari spreadsheet: pakai versi HTML-nya supaya warna sel ikut terbaca.
            const table = tableFromHtml(e.clipboardData.getData("text/html"));
            if (!table) return;
            e.preventDefault();
            setText(table.text);
            setPasted(table);
          }}
          rows={8}
          placeholder={EXAMPLE}
          className="font-mono text-sm"
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
            {colorCounts && colorCounts.length > 0 && (
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span>Warna sel ikut terbaca:</span>
                {colorCounts.map(([color, n]) => (
                  <span key={color} className="inline-flex items-center gap-1">
                    <span aria-hidden className={cx("size-3 rounded-full", guardColorClass(color))} />
                    {GUARD_COLOR_LABEL[color]} {n}
                  </span>
                ))}
              </p>
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

        <input type="hidden" name="colors" value={colors ? JSON.stringify(colors) : ""} />
        <CheckboxField
          name="fillNames"
          defaultChecked
          label="Isi nama KK dari jadwal untuk rumah tanpa akun petugas yang nama KK-nya masih kosong"
        />
        <CheckboxField name="overwriteNames" label="Ganti juga nama KK yang sudah terisi" />

        {state?.error && <Alert>{state.error}</Alert>}
        {state?.success && <Alert tone="success">{state.success}</Alert>}
        <Button type="submit" disabled={pending || preview.entries.length === 0} className="w-full">
          {pending ? "Menyimpan…" : "Simpan jadwal"}
        </Button>
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
