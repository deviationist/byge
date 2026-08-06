import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ListHeader } from "./ListHeader";

/**
 * The masthead carries the only branding in the app and the only always-visible
 * legend. Both went missing once already by being drawn nowhere at all.
 */

describe("ListHeader", () => {
  it("shows the wordmark", () => {
    render(<ListHeader count={3} ageMin={4} />);
    expect(screen.getByTestId("wordmark")).toHaveTextContent("byge");
  });

  it("announces the wordmark as a heading", () => {
    // A screen reader user gets "you are in byge" from the same element a
    // sighted user gets it from, rather than from nothing.
    render(<ListHeader count={3} ageMin={4} />);
    expect(screen.getByRole("heading", { name: "byge" })).toBeInTheDocument();
  });

  it("does not explain the swatches a second time", () => {
    // The shapes are explained once, in the legend card under the list, which
    // shows them in its collapsed header. A mono key line here as well said the
    // same thing twice on one screen — worse, in the harder-to-read of the two
    // registers.
    render(<ListHeader count={3} ageMin={4} />);
    expect(screen.queryByTestId("list-key")).not.toBeInTheDocument();
    expect(screen.queryByText(/FILLED/)).not.toBeInTheDocument();
  });

  it("counts the places, with the singular for one", () => {
    render(<ListHeader count={1} ageMin={4} />);
    expect(screen.getByTestId("list-caption")).toHaveTextContent("1 place ·");
  });

  it("pluralises for more than one", () => {
    render(<ListHeader count={3} ageMin={4} />);
    expect(screen.getByTestId("list-caption")).toHaveTextContent("3 places");
  });

  it("says it is checking rather than claiming an age it does not have", () => {
    // `ageMin` is undefined until the first verdict lands. Rendering "updated 0
    // min ago" there would be a freshness claim invented from nothing.
    render(<ListHeader count={3} />);
    expect(screen.getByTestId("list-caption")).toHaveTextContent("checking");
  });

  it("names the age when the answer is not fresh", () => {
    render(<ListHeader count={3} ageMin={12} />);
    expect(screen.getByTestId("list-caption")).toHaveTextContent("updated 12 min ago");
  });

  it("says 'just now' rather than '0 min ago'", () => {
    render(<ListHeader count={3} ageMin={0.4} />);
    expect(screen.getByTestId("list-caption")).toHaveTextContent("just now");
  });

  it("admits it is offline rather than presenting a cached age as fresh", () => {
    render(<ListHeader count={3} ageMin={34} offline />);
    const caption = screen.getByTestId("list-caption").textContent ?? "";
    expect(caption).toContain("offline");
    expect(caption).toContain("34 min");
  });
});
