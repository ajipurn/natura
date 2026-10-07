// @vitest-environment happy-dom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DatePicker } from "@/components/date-picker";
import { Dialog } from "@/components/dialog";

let container: HTMLDivElement;
let root: Root;
const today = "2026-10-07";

function Form({ onChange = () => {}, inDialog = false }: { onChange?: (date: string) => void; inDialog?: boolean }) {
  const [date, setDate] = useState(today);
  const [open, setOpen] = useState(true);
  const field = <DatePicker label="Tanggal transaksi" value={date} today={today} onValueChange={(next) => { setDate(next); onChange(next); }} />;
  return inDialog ? <Dialog open={open} onClose={() => setOpen(false)} title="Catat transaksi">{field}</Dialog> : field;
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function trigger() {
  return document.querySelector<HTMLButtonElement>('button[aria-haspopup="dialog"]')!;
}

function day(date: string) {
  return document.querySelector<HTMLButtonElement>(`button[data-date="${date}"]`)!;
}

async function click(button: HTMLButtonElement) {
  await act(async () => button.click());
}

async function press(button: HTMLButtonElement, key: string) {
  await act(async () => button.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })));
}

describe("pemilih tanggal transaksi", () => {
  it("memilih tanggal dengan nilai ISO dan membatasi tanggal setelah hari ini", async () => {
    const onChange = vi.fn();
    await act(async () => root.render(<Form onChange={onChange} />));
    await click(trigger());
    expect(day("2026-10-08").disabled).toBe(true);
    await click(day("2026-10-08"));
    expect(onChange).not.toHaveBeenCalled();
    await click(day("2026-10-05"));
    expect(onChange).toHaveBeenCalledWith("2026-10-05");
    expect(trigger().textContent).toContain("5 Okt 2026");
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
  });

  it("memindahkan fokus antarbulan lewat keyboard tanpa mengubah tanggal sampai dipilih", async () => {
    const onChange = vi.fn();
    await act(async () => root.render(<Form onChange={onChange} />));
    await click(trigger());
    await press(day(today), "PageUp");
    expect(document.activeElement).toBe(day("2026-09-07"));
    expect(onChange).not.toHaveBeenCalled();
    await press(day("2026-09-07"), "ArrowLeft");
    expect(document.activeElement).toBe(day("2026-09-06"));
    await click(day("2026-09-06"));
    expect(onChange).toHaveBeenCalledWith("2026-09-06");
  });

  it("Escape menutup kalender di dalam dialog tanpa menutup form transaksi", async () => {
    await act(async () => root.render(<Form inDialog />));
    await click(trigger());
    await press(day(today), "Escape");
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Catat transaksi");
  });
});
