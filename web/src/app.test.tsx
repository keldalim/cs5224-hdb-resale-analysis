import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import App from "./App";

// jsdom lacks these browser APIs.
beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as never;
  globalThis.ResizeObserver ??= class { observe() {} disconnect() {} unobserve() {} } as never;
  window.scrollTo = () => {};
  Element.prototype.scrollIntoView = () => {};
});

let root: Root | null = null;
let host: HTMLDivElement;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  localStorage.clear();
  window.history.replaceState(null, "", "/");
});

async function mount() {
  host = document.createElement("div");
  document.body.appendChild(host);
  await act(async () => {
    root = createRoot(host);
    root.render(<App />);
  });
}

const until = async (fn: () => boolean, ms = 3000) => {
  const end = Date.now() + ms;
  while (!fn()) {
    if (Date.now() > end) throw new Error("timed out");
    await act(async () => { await new Promise((r) => setTimeout(r, 25)); });
  }
};

const button = (text: string) =>
  [...host.querySelectorAll("button")].find((b) => b.textContent?.includes(text)) as HTMLButtonElement;

describe("App (demo mode)", () => {
  it("runs an example end to end and saves it to the shortlist", async () => {
    await mount();
    await act(async () => button("3-room in Ang Mo Kio").click());
    await until(() => Boolean(host.querySelector("#verdict-h")));
    expect(host.querySelector("#verdict-h")?.textContent).toMatch(/Asking price is|Not enough similar sales/);
    expect(host.querySelectorAll(".comps-table tbody tr").length).toBeGreaterThan(0);
    expect(window.location.search).toContain("town=ANG+MO+KIO");

    await act(async () => button("Save to shortlist").click());
    expect(button("Saved · View shortlist")).toBeTruthy();
    expect(JSON.parse(localStorage.getItem("hdb-resale-evidence.shortlist.v1") ?? "[]")).toHaveLength(1);
  });

  it("shows field errors in page order with a summary when several are missing", async () => {
    await mount();
    await act(async () => button("Check similar sales").click());
    const summary = host.querySelector(".error-summary");
    expect(summary).toBeTruthy();
    const first = summary?.querySelector("li")?.textContent ?? "";
    expect(first.startsWith("Town")).toBe(true);
  });

  it("loads a broken shared link into the form without running it", async () => {
    window.history.replaceState(null, "", "/?town=XYZ&flat_type=3+ROOM&floor_area_sqm=-5");
    await mount();
    expect(host.querySelector("#verdict-h")).toBeNull();
    expect(host.querySelectorAll(".field-error").length).toBeGreaterThan(0);
  });

  it("survives a corrupted shortlist in storage", async () => {
    localStorage.setItem("hdb-resale-evidence.shortlist.v1", JSON.stringify([{ id: "x" }, null, "junk"]));
    window.history.replaceState(null, "", "/?view=shortlist");
    await mount();
    expect(host.textContent).toContain("Your shortlist");
    expect(host.textContent).toContain("Save flats here");
  });
});
