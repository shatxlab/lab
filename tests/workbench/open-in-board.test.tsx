// @vitest-environment jsdom
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import WorkbenchApp from "@/components/workbench/WorkbenchApp";
import { takeBoardHandoff } from "@/lib/board/handoff";
import { createBoard } from "@/lib/board/model";
import { serializeBoard } from "@/lib/board/storage";
import type { OperationProps } from "@/lib/workbench/operation";
import { wb } from "@/lib/workbench/i18n";
import { click, mount, waitFor } from "../helpers/dom";

afterEach(() => {
  document.body.innerHTML = "";
  localStorage.clear();
  vi.restoreAllMocks();
});

const stub = ({ assets }: OperationProps) => <p>open: {assets.map((a) => a.name).join(", ")}</p>;
const operations = { "doc.open": stub, "qr.generate": stub } as never;

async function addFile(file: File) {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  await act(async () => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
const boardButton = (name: string) => document.querySelector<HTMLButtonElement>(`button[aria-label="${wb("en", "sendBoard", { name })}"]`);

const BOARD = serializeBoard({ ...createBoard("Plan"), elements: [{ id: "r", type: "rect", x: 0, y: 0, w: 10, h: 10, color: "ink", fill: false, width: 4 }] });

describe("Open in Whiteboard", () => {
  it("is offered for a JSON file that is a board, and hands it over in a new tab", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue({} as Window);
    const view = await mount(<WorkbenchApp operations={operations} />);
    await addFile(new File([BOARD], "plan.json", { type: "application/json" }));
    await waitFor(() => expect(boardButton("plan.json")).toBeTruthy());
    await click(boardButton("plan.json"));
    expect(String(open.mock.calls[0]![0])).toMatch(/\/board\/?$/);
    expect(open.mock.calls[0]![1]).toBe("_blank");
    expect(takeBoardHandoff()).toEqual({ name: "plan.json", text: BOARD });
    view.unmount();
  });

  it("is not offered for other JSON, or for files that are not JSON", async () => {
    const view = await mount(<WorkbenchApp operations={operations} />);
    await addFile(new File(['{"hello":"world"}'], "data.json", { type: "application/json" }));
    await waitFor(() => expect(document.body.textContent).toContain("data.json"));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(document.querySelector('button[aria-label*="Whiteboard"]')).toBeNull();
    view.unmount();
  });

  it("says so when the browser blocks the new tab, and keeps the board waiting", async () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    const view = await mount(<WorkbenchApp operations={operations} />);
    await addFile(new File([BOARD], "plan.json", { type: "application/json" }));
    await waitFor(() => expect(boardButton("plan.json")).toBeTruthy());
    await click(boardButton("plan.json"));
    await waitFor(() => expect(document.body.textContent).toContain(wb("en", "boardBlocked")));
    expect(takeBoardHandoff()).not.toBeNull();
    view.unmount();
  });
});
