// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useItemStore, type ItemStore } from "@/lib/workbench/item-store";
import { mount } from "../helpers/dom";

interface Row {
  id: number;
  value: number;
}

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

/** Mounts a probe that exposes the store and counts how often it rendered. */
async function probe(interval = 100) {
  const handle: { store: ItemStore<Row> | null; renders: number } = { store: null, renders: 0 };
  function Probe() {
    handle.store = useItemStore<Row>(interval);
    handle.renders += 1;
    return <p>{handle.store.items.length}</p>;
  }
  const view = await mount(<Probe />);
  return { handle, view, text: () => view.container.textContent };
}

const rows = (n: number): Row[] => Array.from({ length: n }, (_, i) => ({ id: i + 1, value: 0 }));

describe("useItemStore", () => {
  it("publishes a reset straight away", async () => {
    const { handle, text, view } = await probe();
    await act(async () => handle.store!.reset(rows(5)));
    expect(text()).toBe("5");
    view.unmount();
  });

  it("folds many quick updates into a single render", async () => {
    vi.useFakeTimers();
    const { handle, view } = await probe(100);
    await act(async () => handle.store!.reset(rows(1000)));
    const before = handle.renders;
    await act(async () => {
      for (let i = 1; i <= 1000; i += 1) handle.store!.update(i, { value: i });
    });
    // Nothing has been published yet…
    expect(handle.renders).toBe(before);
    expect(handle.store!.get(500)?.value).toBe(500);
    expect(handle.store!.items[499]!.value).toBe(0);
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    // …and one tick later all of it is, in one render.
    expect(handle.renders).toBe(before + 1);
    expect(handle.store!.items[499]!.value).toBe(500);
    view.unmount();
  });

  it("publishes at once when asked", async () => {
    const { handle, view } = await probe(10_000);
    await act(async () => handle.store!.reset(rows(3)));
    await act(async () => handle.store!.update(2, { value: 9 }, true));
    expect(handle.store!.items[1]!.value).toBe(9);
    view.unmount();
  });

  it("replaces only the item that changed, so memoised rows can skip the rest", async () => {
    const { handle, view } = await probe();
    await act(async () => handle.store!.reset(rows(4)));
    const before = handle.store!.items.slice();
    await act(async () => handle.store!.update(3, { value: 1 }, true));
    const after = handle.store!.items;
    expect(after[0]).toBe(before[0]);
    expect(after[1]).toBe(before[1]);
    expect(after[2]).not.toBe(before[2]);
    expect(after[3]).toBe(before[3]);
    view.unmount();
  });

  it("updates many items with one publish and ignores ids it does not have", async () => {
    const { handle, view } = await probe();
    await act(async () => handle.store!.reset(rows(5)));
    const before = handle.renders;
    await act(async () => handle.store!.updateMany([1, 3, 99], { value: 7 }));
    expect(handle.renders).toBe(before + 1);
    expect(handle.store!.items.map((r) => r.value)).toEqual([7, 0, 7, 0, 0]);
    await act(async () => handle.store!.update(99, { value: 1 }, true));
    expect(handle.store!.items).toHaveLength(5);
    view.unmount();
  });

  it("does not publish after it is unmounted", async () => {
    vi.useFakeTimers();
    const { handle, view } = await probe(100);
    await act(async () => handle.store!.reset(rows(2)));
    handle.store!.update(1, { value: 1 });
    view.unmount();
    const renders = handle.renders;
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(handle.renders).toBe(renders);
  });
});
