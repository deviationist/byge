import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Attribution } from "./Attribution";

describe("Attribution", () => {
  it("carries the required credit line verbatim", () => {
    const { container } = render(<Attribution />);
    expect(container.textContent?.replace(/\s+/g, " ")).toContain(
      "Data from MET Norway · NLOD 2.0 / CC BY 4.0",
    );
  });

  it("links MET Norway — the terms require identification, not a mention", () => {
    const { container } = render(<Attribution />);
    const met = Array.from(container.querySelectorAll("a")).find(
      (a) => a.textContent === "MET Norway",
    );
    expect(met?.getAttribute("href")).toBe("https://www.met.no/");
  });

  it("links both licences — CC BY 4.0 requires the licence be reachable", () => {
    const { container } = render(<Attribution />);
    const hrefs = Array.from(container.querySelectorAll("a")).map((a) =>
      a.getAttribute("href"),
    );
    expect(hrefs.some((h) => h?.includes("nlod"))).toBe(true);
    expect(hrefs.some((h) => h?.includes("creativecommons.org/licenses/by/4.0"))).toBe(true);
  });

  it("opens links away from the app without leaking the referrer chain", () => {
    const { container } = render(<Attribution />);
    for (const a of Array.from(container.querySelectorAll("a"))) {
      expect(a.getAttribute("target")).toBe("_blank");
      expect(a.getAttribute("rel")).toBe("noreferrer");
    }
  });

  it("is NOT navigation — nothing here routes into the app", () => {
    // The comp hung About and Settings off this line, which buried the theme
    // switcher behind a 9.5px legal footnote. A licence obligation carries an
    // obligation-sized affordance; it must not double as the way in.
    const { container } = render(<Attribution />);
    expect(container.textContent).not.toMatch(/about|settings/i);
    for (const a of Array.from(container.querySelectorAll("a"))) {
      expect(a.getAttribute("href")).toMatch(/^https:\/\//);
    }
  });

  it("takes no navigation callback at all", () => {
    // Enforced by the type, and restated here so re-adding one is a visible
    // decision rather than a quiet convenience.
    expect(Attribution.length).toBe(0);
  });

  it("marks the links up as links", () => {
    const { container } = render(<Attribution />);
    expect(container.querySelectorAll("a").length).toBe(3);
  });
});
