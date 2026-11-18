import axe from "axe-core";
import { act, type ReactElement } from "react";
import { createRoot } from "react-dom/client";

/** Mount a React element into document.body inside act(). */
export async function mount(ui: ReactElement) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(ui);
  });
  return {
    container,
    async rerender(next: ReactElement) {
      await act(async () => {
        root.render(next);
      });
    },
    unmount() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

export async function waitFor(assert: () => void, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      assert();
      return;
    } catch (error) {
      lastError = error;
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 25));
      });
    }
  }
  throw lastError;
}

export async function click(element: Element | null | undefined) {
  if (!element) throw new Error("click target not found");
  await act(async () => {
    (element as HTMLElement).click();
  });
}

/** Type into a React-controlled input/textarea. */
export async function type(element: HTMLInputElement | HTMLTextAreaElement | null, value: string) {
  if (!element) throw new Error("type target not found");
  const proto = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

export async function press(target: EventTarget, key: string, init: KeyboardEventInit = {}) {
  await act(async () => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }));
  });
}

/**
 * Run axe-core over an element and return human readable violations.
 * Colour contrast needs real layout/painting, so jsdom skips that rule.
 */
export async function axeViolations(element: Element = document.body): Promise<string[]> {
  const results = await axe.run(element, {
    rules: { "color-contrast": { enabled: false }, region: { enabled: false } },
  });
  return results.violations.map(
    (violation) => `${violation.id}: ${violation.help} (${violation.nodes.map((node) => node.target.join(" ")).join(", ")})`,
  );
}
