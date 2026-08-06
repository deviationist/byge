import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { legend } from "../lib/scale";
import { PrecipitationLegend } from "./PrecipitationLegend";

const toggle = () => screen.getByRole("button", { name: "Reading the list" });

describe("PrecipitationLegend disclosure", () => {
  it("starts collapsed — it is one-time orientation, not a permanent key", () => {
    render(<PrecipitationLegend theme="light" />);
    expect(screen.queryByTestId("legend-body")).toBeNull();
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
  });

  it("is labelled 'Reading the list', never 'markers'", () => {
    // "Marker" means map pin once MapField and RadarMap exist. This explains
    // list glyphs, which are swatches.
    const { container } = render(<PrecipitationLegend theme="light" defaultOpen />);
    expect(toggle()).toBeTruthy();
    expect(container.textContent?.toLowerCase()).not.toContain("marker");
  });

  it("expands in place when pressed", () => {
    render(<PrecipitationLegend theme="light" />);
    fireEvent.click(toggle());
    expect(screen.getByTestId("legend-body")).toBeTruthy();
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
  });

  it("collapses again", () => {
    render(<PrecipitationLegend theme="light" defaultOpen />);
    fireEvent.click(toggle());
    expect(screen.queryByTestId("legend-body")).toBeNull();
  });

  it("reports its state so a screen can remember it", () => {
    const onToggle = vi.fn();
    render(<PrecipitationLegend theme="light" onToggle={onToggle} />);
    fireEvent.click(toggle());
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it("gives the row a thumb-sized target", () => {
    render(<PrecipitationLegend theme="light" />);
    expect(Number.parseFloat(toggle().style.minHeight)).toBeGreaterThanOrEqual(44);
  });
});

describe("PrecipitationLegend content", () => {
  it("shows the three swatch states at real size", () => {
    render(<PrecipitationLegend theme="light" defaultOpen />);
    for (const label of ["Raining now", "Rain on the way", "No radar coverage"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    // filled / outline / hatched, each rendered by the same Swatch component.
    expect(screen.getAllByRole("img")).toHaveLength(3);
  });

  it("carries the whole intensity ramp, so the map needs no second legend", () => {
    render(<PrecipitationLegend theme="light" defaultOpen />);
    for (const row of legend()) {
      expect(screen.getByText(row.label)).toBeTruthy();
      expect(screen.getByText(row.range)).toBeTruthy();
    }
  });

  it("colours the ramp from the band lookup, per theme", () => {
    const swatchFor = (c: Element, text: string) => {
      const label = [...c.querySelectorAll("div")].find((d) => d.textContent === text);
      const swatch = (label as HTMLElement).previousElementSibling as HTMLElement;
      return swatch.style.backgroundColor;
    };
    const { container: light } = render(<PrecipitationLegend theme="light" defaultOpen />);
    const { container: dark } = render(<PrecipitationLegend theme="dark" defaultOpen />);
    expect(swatchFor(light, "moderate rain")).toBe("rgb(0, 128, 255)");
    expect(swatchFor(dark, "moderate rain")).toBe("rgb(85, 174, 245)");
  });

  it("includes observed dry in the ramp — the absence belongs on the scale", () => {
    render(<PrecipitationLegend theme="light" defaultOpen />);
    expect(screen.getByText("dry")).toBeTruthy();
    expect(screen.getByText("we looked, nothing is falling")).toBeTruthy();
  });

  it("says in plain words that not-observed is not dry", () => {
    // This sentence otherwise appears only if you happen to open a location
    // outside coverage.
    render(<PrecipitationLegend theme="light" defaultOpen />);
    const body = screen.getByTestId("legend-body").textContent ?? "";
    expect(body).toMatch(/not a level of rain and it is not dry/i);
    expect(body).toMatch(/could not look/i);
  });
});
