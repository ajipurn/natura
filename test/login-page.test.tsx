// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LoginPage } from "@/features/auth/login-page";

const users = [
  { id: 1, name: "Aji", house: "AD-8" },
  { id: 2, name: "Aji", house: "AC-12" },
  { id: 3, name: "Budi Santoso", house: "AD-18" },
  { id: 4, name: "Admin", house: null },
];
let container: HTMLDivElement;
let root: Root;
let client: QueryClient;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(Response.json({ error: "PIN salah." }, { status: 401 }))));
  localStorage.clear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
  client.setQueryData(["auth"], { setupNeeded: false, user: null });
  client.setQueryData(["auth", "users"], { users });
});

afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  container.remove();
  localStorage.clear();
  vi.unstubAllGlobals();
});

async function render() {
  await act(async () => root.render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <LoginPage title="Masuk dashboard" homePath="/admin/" setupPath="/admin/setup" />
      </MemoryRouter>
    </QueryClientProvider>,
  ));
}

function searchField() {
  return document.querySelector<HTMLInputElement>('input[role="combobox"]')!;
}

function accountTrigger() {
  return container.querySelector<HTMLButtonElement>('button[aria-expanded]')!;
}

async function openSearch() {
  await act(async () => accountTrigger().click());
}

async function type(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
  });
}

async function search(query: string) {
  await openSearch();
  await type(searchField(), query);
}

function options() {
  return [...document.querySelectorAll<HTMLElement>('[role="option"]')];
}

describe("pencarian akun di halaman masuk", () => {
  it.each([
    ["bUdI", ["Budi Santoso AD-18"]],
    ["AD", ["Aji AD-8", "Budi Santoso AD-18", "Admin"]],
    ["AD-8", ["Aji AD-8"]],
    ["ad8", ["Aji AD-8"]],
    [" AD 8 ", ["Aji AD-8"]],
    ["12", ["Aji AC-12"]],
    ["admin", ["Admin"]],
  ])("mencari %s dari kolom di dalam popup", async (query, expected) => {
    await render();
    expect(container.querySelector('input[role="combobox"]')).toBeNull();
    const labels = accountTrigger().getAttribute("aria-labelledby")!.split(" ").map((id) => document.getElementById(id)?.textContent);
    expect(labels).toContain("Nama atau rumah");
    await search(query);
    expect(searchField().placeholder).toBe("Cari nama atau rumah…");
    expect(searchField().getAttribute("aria-label")).toBe("Cari nama atau rumah");
    expect(options().map((option) => option.textContent)).toEqual(expected);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("membedakan nama kembar lewat rumah dan mengirim ID akun yang dipilih", async () => {
    await render();
    await search("aji");
    expect(options().map((option) => option.textContent)).toEqual(["Aji AD-8", "Aji AC-12"]);
    await act(async () => options()[1].click());
    expect(accountTrigger().textContent).toBe("Aji AC-12");
    expect(new FormData(container.querySelector("form")!).get("userId")).toBe("2");
    await type(container.querySelector<HTMLInputElement>('input[name="pin"]')!, "1234");
    await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(fetch).toHaveBeenCalledWith("/api/auth/login", expect.objectContaining({ body: JSON.stringify({ userId: 2, pin: "1234" }) }));
    expect(accountTrigger().textContent).toBe("Aji AC-12");
  });

  it("memilih hasil pencarian dengan Enter", async () => {
    await render();
    await search("ac12");
    await act(async () => searchField().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    expect(accountTrigger().textContent).toBe("Aji AC-12");
    expect(accountTrigger().getAttribute("aria-expanded")).toBe("false");
    expect(new FormData(container.querySelector("form")!).get("userId")).toBe("2");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("menampilkan pesan kosong dan Escape menutup pencarian", async () => {
    await render();
    await search("ZZ-999");
    expect(options()).toHaveLength(0);
    expect(document.body.textContent).toContain("Tidak ada yang cocok.");
    await act(async () => searchField().dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(accountTrigger().getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(accountTrigger());
  });

  it("memulihkan akun terakhir dan mencari akun lain tanpa menghapus nama terpilih", async () => {
    localStorage.setItem("jimpitan:last-user", "1");
    await render();
    expect(new FormData(container.querySelector("form")!).get("userId")).toBe("1");
    await openSearch();
    expect(searchField().value).toBe("");
    expect(document.activeElement).toBe(searchField());
    expect(options()).toHaveLength(users.length);
    await type(searchField(), "Budi");
    expect(options().map((option) => option.textContent)).toEqual(["Budi Santoso AD-18"]);
    expect(accountTrigger().textContent).toBe("Aji AD-8");
    expect(new FormData(container.querySelector("form")!).get("userId")).toBe("1");
    await act(async () => options()[0].click());
    expect(accountTrigger().textContent).toBe("Budi Santoso AD-18");
    expect(new FormData(container.querySelector("form")!).get("userId")).toBe("3");
    await openSearch();
    expect(searchField().value).toBe("");
    expect(options()).toHaveLength(users.length);
  });

  it("membatalkan pencarian tanpa mengganti akun terakhir", async () => {
    localStorage.setItem("jimpitan:last-user", "2");
    await render();
    await search("Budi");
    await act(async () => searchField().dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(accountTrigger().textContent).toBe("Aji AC-12");
    expect(new FormData(container.querySelector("form")!).get("userId")).toBe("2");
    expect(document.activeElement).toBe(accountTrigger());
  });
});
