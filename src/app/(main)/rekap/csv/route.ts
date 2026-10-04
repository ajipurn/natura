import type { NextRequest } from "next/server";
import { isMonth, rondaDate } from "@/lib/dates";
import { getCurrentUser } from "@/server/auth";
import { getMonthRecap } from "@/server/queries";
import { summarizeMonth } from "../summarize";

function csvCell(value: string | number): string {
  const text = String(value);
  // Cegah formula injection saat dibuka di Excel/Sheets.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Unduh rekap bulanan sebagai CSV (bisa dibuka di Excel / Google Sheets). */
export async function GET(request: NextRequest) {
  if (!(await getCurrentUser())) return new Response("Perlu login.", { status: 401 });

  const bulan = request.nextUrl.searchParams.get("bulan") ?? "";
  const month = isMonth(bulan) ? bulan : rondaDate(new Date()).slice(0, 7);
  const recap = await getMonthRecap(month);
  const { rows, dateTotals, grandTotal } = summarizeMonth(recap);

  const lines: (string | number)[][] = [
    ["Blok", "No", "Nama KK", ...recap.dates, "Jumlah Ada", "Total (Rp)"],
    ...rows.map(({ house, cells, filledCount, total }) => [
      house.block,
      house.number,
      house.ownerName ?? "",
      // Angka = nominal, K = kosong, kosong = belum dicek.
      ...cells.map((c) => (c?.status === "filled" ? c.amount : c?.status === "empty" ? "K" : "")),
      filledCount,
      total,
    ]),
    ["", "", "Total", ...dateTotals, "", grandTotal],
  ];

  const body = "﻿" + lines.map((row) => row.map(csvCell).join(",")).join("\r\n");
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="jimpitan-${month}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
