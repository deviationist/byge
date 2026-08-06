import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StaleBanner } from "./StaleBanner";

describe("StaleBanner", () => {
  it("names the age of the verdict it is qualifying", () => {
    const { container } = render(<StaleBanner ageMin={34} />);
    expect(container.textContent).toContain("34 min ago");
  });

  it("says we are offline, and that it will come back on its own", () => {
    // Both halves matter: the cause (offline, not broken) and the remedy
    // (nothing for the reader to do).
    const { container } = render(<StaleBanner ageMin={34} />);
    expect(container.textContent).toMatch(/offline/i);
    expect(container.textContent).toMatch(/refresh the moment you are back/i);
  });

  it("never claims the request failed — that is ErrorState's sentence", () => {
    const { container } = render(<StaleBanner ageMin={12} />);
    expect(container.textContent).not.toMatch(/failed|could not|error/i);
  });

  it("rounds to whole minutes", () => {
    const { container } = render(<StaleBanner ageMin={7.4} />);
    expect(container.textContent).toContain("7 min ago");
  });

  it("never says '0 min ago' — a zero would read as fresh", () => {
    // The banner's whole job is to say the answer is old. Rounding a 20-second
    // gap down to zero contradicts the sentence it appears in.
    const { container } = render(<StaleBanner ageMin={0.3} />);
    expect(container.textContent).toContain("1 min ago");
    expect(container.textContent).not.toContain("0 min ago");
  });

  it("is a polite live region, so it is announced without stealing focus", () => {
    const { container } = render(<StaleBanner ageMin={5} />);
    expect(container.firstElementChild?.getAttribute("role")).toBe("status");
  });

  it("carries the state in a word, not only in colour", () => {
    const { container } = render(<StaleBanner ageMin={5} />);
    expect(container.textContent).toMatch(/offline/i);
  });
});
