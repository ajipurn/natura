// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { classifyCellColor } from "@/lib/guard-color";
import { parseSchedule } from "@/lib/schedule";
import { tableFromHtml } from "@/lib/table-paste";

describe("warna sel jadwal", () => {
  it("mengenali warna khas Excel/Google Sheets dan foto jadwal Natura", () => {
    expect(classifyCellColor("#74AA4E")).toBe("green");
    expect(classifyCellColor("#92d050")).toBe("green");
    expect(classifyCellColor("rgb(253, 252, 94)")).toBe("yellow");
    expect(classifyCellColor("#ffff00")).toBe("yellow");
    expect(classifyCellColor("#F4B407")).toBe("orange");
    expect(classifyCellColor("#ffc000")).toBe("orange");
    expect(classifyCellColor("#ffffff")).toBeNull();
    expect(classifyCellColor("transparent")).toBeNull();
    expect(classifyCellColor("rgba(0, 0, 0, 0)")).toBeNull();
    expect(classifyCellColor(null)).toBeNull();
  });

  it("membaca tabel tempelan Google Sheets (warna inline) dan Excel (warna di kelas)", () => {
    const sheets = `<table><tr><td></td><td>AHAD<br>(MALAM SENIN)</td><td>SENIN</td></tr>
      <tr><td>1</td><td style="background-color:#93c47d">YUSUF (AD-3)</td><td style="background-color:#ffff00">NINO (AB-3)</td></tr>
      <tr><td>2</td><td>(AB-1)</td><td colspan="1" style="background-color:#f6b26b">SAHRUL (AF-19)</td></tr></table>`;
    const table = tableFromHtml(sheets)!;
    const { entries } = parseSchedule(table.text);
    const colors = entries.map((e) => [e.name ?? `${e.block}-${e.number}`, table.colors[e.cell!.row][e.cell!.col]]);
    // Dibaca per baris tabel.
    expect(colors).toEqual([
      ["Yusuf", "green"],
      ["Nino", "yellow"],
      ["AB-1", null],
      ["Sahrul", "orange"],
    ]);

    const excel = `<style>.xl65 {mso-number-format:General; background:#92D050; mso-pattern:black none;} .xl66 {background:#FFC000;}</style>
      <table><tr><td></td><td>AHAD</td><td>SENIN</td></tr><tr><td>1</td><td class=xl65>WIDI (AA-12)</td><td class=xl66>EKO (A-1)</td></tr></table>`;
    const fromExcel = tableFromHtml(excel)!;
    expect(fromExcel.colors[1]).toEqual([null, "green", "orange"]);
    expect(tableFromHtml("<p>bukan tabel</p>")).toBeNull();
  });
});
