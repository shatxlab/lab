// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { SourceEditor } from "@/components/workbench/SourceEditor";
import { mount, type, waitFor } from "../helpers/dom";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("SourceEditor", () => {
  it("renders a textarea holding the value", async () => {
    const view = await mount(<SourceEditor value="hello" onChange={() => {}} />);
    expect(document.querySelector<HTMLTextAreaElement>("textarea")!.value).toBe("hello");
    view.unmount();
  });

  it("keeps the textarea editable", async () => {
    const view = await mount(<SourceEditor value="hello" onChange={() => {}} />);
    expect(document.querySelector<HTMLTextAreaElement>("textarea")!.readOnly).toBe(false);
    view.unmount();
  });

  it("calls onChange as the user types", async () => {
    const onChange = vi.fn();
    const view = await mount(<SourceEditor value="hello" onChange={onChange} />);

    await type(document.querySelector<HTMLTextAreaElement>("textarea"), "hello world");

    expect(onChange).toHaveBeenCalledWith("hello world");
    view.unmount();
  });

  it("re-renders the highlighted markup when the value changes", async () => {
    const noop = () => {};
    const view = await mount(<SourceEditor value='{"name":"a"}' language="json" onChange={noop} />);
    const code = () => document.querySelector("code")!;
    expect(code().innerHTML).toContain("hljs-string");
    expect(code().textContent).toContain('"a"');

    await view.rerender(<SourceEditor value='{"name":"b"}' language="json" onChange={noop} />);

    await waitFor(() => expect(code().textContent).toContain('"b"'));
    expect(code().textContent).not.toContain('"a"');
    view.unmount();
  });

  it("escapes plain text without highlighting it", async () => {
    const view = await mount(<SourceEditor value={'a < b & "c"'} language="text" onChange={() => {}} />);
    const html = document.querySelector("code")!.innerHTML;
    expect(html).toContain("&lt;");
    expect(html).toContain("&amp;");
    expect(html).not.toContain("hljs-");
    view.unmount();
  });

  it("does not throw for each supported language", async () => {
    for (const language of ["text", "markdown", "html", "json", "yaml", "toml"] as const) {
      const view = await mount(<SourceEditor value={"key: value\n"} language={language} onChange={() => {}} />);
      expect(document.querySelector("textarea")).toBeTruthy();
      view.unmount();
    }
  });
});
