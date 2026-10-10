import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

type Rule = {
  text?: string;
  contains?: string;
  formula?: string;
  greaterThan?: number;
  color?: string;
  background?: string;
  bold?: boolean;
  ranges?: unknown[];
};

function recapRules() {
  let rules: Rule[] = [];
  let frozenRows = 0;
  const range = {
    setFontSize() { return this; }, setFontWeight() { return this; },
    setBackground() { return this; }, setFontColor() { return this; }, setNumberFormat() { return this; },
    setHorizontalAlignment() { return this; },
  };
  const sheet = {
    getMaxColumns: () => 41, getMaxRows: () => 1000,
    getRange: (...coordinates: number[]) => ({ ...range, coordinates }),
    setFrozenRows(value: number) { frozenRows = value; },
    setFrozenColumns() {}, setColumnWidth() {}, setColumnWidths() {},
    setConditionalFormatRules(value: Rule[]) { rules = value; },
  };
  const SpreadsheetApp = {
    getActiveSheet: () => sheet,
    newConditionalFormatRule() {
      const rule: Rule = {};
      return {
        whenTextEqualTo(value: string) { rule.text = value; return this; },
        whenTextContains(value: string) { rule.contains = value; return this; },
        whenFormulaSatisfied(value: string) { rule.formula = value; return this; },
        whenNumberGreaterThan(value: number) { rule.greaterThan = value; return this; },
        setFontColor(value: string) { rule.color = value; return this; },
        setBackground(value: string) { rule.background = value; return this; },
        setBold(value: boolean) { rule.bold = value; return this; },
        setRanges(value: unknown[]) { rule.ranges = value; return this; },
        build() { return rule; },
      };
    },
  };
  const script = readFileSync(new URL("../scripts/google-sheets.gs", import.meta.url), "utf8");
  runInNewContext(script + "\nrapikanRekap();", { SpreadsheetApp });
  return { rules, frozenRows };
}

describe("format rekap Google Sheets", () => {
  it("nominal positif tetap hijau memakai kondisi angka bawaan, tanpa rumus bergantung kepala kolom atau lokal", () => {
    const { rules } = recapRules();
    expect(rules.find((rule) => rule.greaterThan === 0)).toMatchObject({ color: "#15803d", background: "#dcfce7" });
    // Total periode tetap biru: aturan kepala kolom berada sebelum aturan angka hijau.
    const green = rules.findIndex((rule) => rule.greaterThan === 0);
    for (const label of ["Bulanan (Rp)", "Mingguan (Rp)"]) {
      const blue = rules.findIndex((rule) => rule.formula === `=H$2="${label}"`);
      expect(blue).toBeGreaterThanOrEqual(0);
      expect(blue).toBeLessThan(green);
    }
    expect(rules.some((rule) => rule.formula?.includes("AND(") || rule.formula?.includes("OR("))).toBe(false);
    expect(rules[green].ranges).toMatchObject([{ coordinates: [3, 8, 998, 34] }]);
  });

  it("status bulanan dan hasil kosong tetap punya warna masing-masing", () => {
    const { rules } = recapRules();
    expect(rules.find((rule) => rule.text === "Belum")).toMatchObject({ background: "#fef9c3" });
    expect(rules.find((rule) => rule.text === "Lunas")).toMatchObject({ background: "#dcfce7" });
    expect(rules.find((rule) => rule.text === "kosong")).toMatchObject({ background: "#ffe4e6" });
  });

  it("teks Status dibedakan, termasuk perubahan cara bayar di tengah bulan", () => {
    const { rules } = recapRules();
    expect(rules.find((rule) => rule.text === "Dihuni")).toMatchObject({ color: "#15803d" });
    expect(rules.find((rule) => rule.contains === "Bulanan")).toMatchObject({ color: "#7e22ce" });
    expect(rules.find((rule) => rule.contains === "Mingguan")).toMatchObject({ color: "#1d4ed8" });
    expect(rules.find((rule) => rule.contains === "Bulanan")?.ranges).toMatchObject([{ coordinates: [3, 3, 998, 1] }]);
    expect(rules.find((rule) => rule.formula === '=$C3="Mudik"')).toMatchObject({ color: "#94a3b8" });
  });

  it("total di bawah dikenali dinamis dan lebih dahulu dari warna sel", () => {
    const { rules, frozenRows } = recapRules();
    expect(rules[0]).toMatchObject({ formula: '=$A3="Total"', bold: true, background: "#f1f5f9", ranges: [{ coordinates: [3, 1, 998, 41] }] });
    expect(frozenRows).toBe(2);
  });
});
