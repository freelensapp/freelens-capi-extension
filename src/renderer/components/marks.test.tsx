// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MarkSpinner, MarkView } from "./marks";
import styles from "./marks.module.scss";

import type { Tone } from "../../common/views/cluster-cells";

// The cases of SPEC-0004, "Tests", "Unit", `marks.test.tsx` (P21): each tone of SPEC-0003, P31, gives its token, a
// background mixed from it and a border of it, and Unknown keeps the background of the badge of the host.

const STYLESHEET = readFileSync(join(process.cwd(), "src", "renderer", "components", "marks.module.scss"), "utf8");

// The token of each tone (SPEC-0003, P31; DESIGN.md, "Tones and their tokens").
const TOKENS: Record<Tone, string> = {
  ok: "--colorOk",
  info: "--colorInfo",
  warning: "--colorWarning",
  error: "--colorError",
  terminated: "--colorTerminated",
  vague: "--colorVague",
};

// The declarations of the rule of a selector in the stylesheet.
function ruleOf(selector: string): string {
  const start = STYLESHEET.indexOf(`${selector} {`);

  if (start === -1) return "";
  return STYLESHEET.slice(start + selector.length + 2, STYLESHEET.indexOf("}", start))
    .replace(/\s+/g, " ")
    .trim();
}

afterEach(() => {
  cleanup();
});

describe("a mark of state (P21)", () => {
  it.each(Object.entries(TOKENS))("of the tone %s takes the token %s", (tone, token) => {
    expect(ruleOf(`.${tone}`)).toBe(`--markToken: var(${token});`);
  });

  it("has a background mixed from the token of its tone, and a border of it, and the color of the text of the theme", () => {
    const rule = ruleOf(".mark.mark[data-tone]");

    expect(rule).toMatch(/border: 1px solid var\(--markToken\);/);
    expect(rule).toMatch(/background: color-mix\(in srgb, var\(--markToken\) \d+%, transparent\);/);
    expect(rule).not.toMatch(/(^|[^-])color:/);
  });

  it("of the tone of Unknown keeps the background that the host gives every badge", () => {
    expect(ruleOf('.mark.mark[data-tone="vague"]')).toBe("background: var(--colorVague);");
  });

  it("stands with the other parts of a cell a quarter of an em after the part before it, a mark or a note, in whichever order they follow each other", () => {
    const rule = /((?:\.(?:mark|note) \+ \.(?:mark|note),\s*)*\.(?:mark|note) \+ \.(?:mark|note)) \{\s*([^}]*)\}/.exec(
      STYLESHEET,
    );

    expect(
      rule?.[1]
        .split(",")
        .map((selector) => selector.trim())
        .sort(),
    ).toEqual([".mark + .mark", ".mark + .note", ".note + .mark", ".note + .note"]);
    expect(rule?.[2].trim()).toBe("margin-left: 0.25em;");
  });

  it("in a cell, the spinner of a part that waits for its inputs is a note of the cell", () => {
    render(<MarkSpinner data-testid="spinner" />);

    expect(screen.getByTestId("spinner").className.split(" ")).toEqual([styles.note]);
  });

  it.each(Object.keys(TOKENS) as Tone[])("of the tone %s has its word, the class of its tone and its tone", (tone) => {
    render(<MarkView mark={{ word: `word of ${tone}`, tone }} data-testid="mark" />);

    const mark = screen.getByTestId("mark");

    expect(mark.textContent).toBe(`word of ${tone}`);
    expect(mark.className.split(" ")).toEqual(expect.arrayContaining([styles.mark, styles[tone]]));
    expect(mark.getAttribute("data-tone")).toBe(tone);
  });

  it("says the state of an activity that is not Progressing, and its duration from the time it started", () => {
    render(
      <MarkView
        mark={{
          word: "Rolling out",
          tone: "warning",
          state: "Blocked",
          since: { state: "written", text: "2025-12-31T23:50:00Z" },
        }}
        data-testid="mark"
      />,
    );

    expect(screen.getByTestId("mark").textContent).toBe("Rolling out Blocked 2025-12-31T23:50:00Z");
    expect(screen.getByTestId("host-duration").textContent).toBe("2025-12-31T23:50:00Z");
  });
});
