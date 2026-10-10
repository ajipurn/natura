import type { CashMonth } from "@/server/kas";

export const cashFixture: CashMonth = {
  month: "2026-10", tonight: "2026-10-10", opening: 200000, deposits: 215000,
  directPayments: 15000, duesIncome: 40000, income: 250000, expenses: 50000, closing: 670000, balance: 670000,
  transactions: [
    { id: "entry:2", source: "entry", sourceId: 2, date: "2026-10-10", direction: "out", amount: 50000, description: "Lampu dan kabel pos ronda", note: null, recordedByName: "Bendahara", relatedMonth: "2026-10" },
    { id: "entry:1", source: "entry", sourceId: 1, date: "2026-10-09", direction: "in", amount: 250000, description: "Sumbangan kegiatan warga", note: null, recordedByName: "Bendahara", relatedMonth: "2026-10" },
    { id: "dues:1", source: "dues", sourceId: 1, date: "2026-10-09", direction: "in", amount: 40000, description: "Kebersihan · AF-13", note: "Transfer", recordedByName: "Bendahara", relatedMonth: "2026-10" },
    { id: "payment:1", source: "payment", sourceId: 1, date: "2026-10-08", direction: "in", amount: 15000, description: "Jimpitan bulanan · AF-13", note: "Untuk November", recordedByName: "Bendahara", relatedMonth: "2026-11" },
    { id: "deposit:1", source: "deposit", sourceId: 1, date: "2026-10-07", direction: "in", amount: 215000, description: "Setoran ronda", note: "Diterima lengkap", recordedByName: "Bendahara", relatedMonth: "2026-10" },
  ],
  entries: [
    { id: 2, date: "2026-10-10", direction: "out", amount: 50000, description: "Lampu dan kabel pos ronda", recordedByName: "Bendahara" },
    { id: 1, date: "2026-10-09", direction: "in", amount: 250000, description: "Sumbangan kegiatan warga", recordedByName: "Bendahara" },
  ],
  nights: [
    { date: "2026-10-09", recorded: 24500, periodPayments: 0, filled: 49, deposit: null },
    { date: "2026-10-07", recorded: 215000, periodPayments: 0, filled: 60, deposit: { id: 1, date: "2026-10-07", amount: 215000, note: "Diterima lengkap", recordedByName: "Bendahara", updatedAt: "2026-10-07T12:00:00.000Z" } },
  ],
  directReceipts: [], undeposited: ["2026-10-09"],
};
