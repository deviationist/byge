import { fireEvent, render, within } from "@testing-library/react";
import { Text } from "react-native";
import { describe, expect, it, vi } from "vitest";
import { verdictFrom } from "../lib/forecast";
import type { Frame } from "../lib/radar";
import { NOTICEABLE } from "../lib/scale";
import { statusLine } from "./LocationStatusText";
import { LocationsList, type LocationsListItem } from "./LocationsList";

function framesOf(rates: number[], over: Partial<Frame> = {}): Frame[] {
  return rates.map((r, i) => ({
    time: new Date(0),
    minutes: i * 5,
    maxRate: r,
    meanRate: r,
    coverage: r >= NOTICEABLE ? 1 : 0,
    observed: 1,
    centreRate: r,
    nearestKm: r >= NOTICEABLE ? 0 : null,
    ...over,
  }));
}

const Z = (n: number) => new Array(n).fill(0);
const V = (rates: number[], over: Partial<Frame> = {}) => verdictFrom(framesOf(rates, over), 4);

const raining = V([6.0, 5.6, 5.0, 4.1, 2.7, 0.12].concat(Z(18)));
const clear = V(Z(24));
const blind = V(Z(24), { observed: 0 });

const items: LocationsListItem[] = [
  { id: "home", name: "Home", place: "Grünerløkka, Oslo", verdict: raining },
  { id: "cabin", name: "Cabin", place: "Hemsedal", verdict: clear },
  { id: "svalbard", name: "Longyearbyen", place: "Svalbard", verdict: blind },
];

const view = (ui: React.ReactElement) => {
  const { container } = render(ui);
  return { container, ...within(container) };
};

describe("the list", () => {
  it("renders one card per item, in order", () => {
    const v = view(<LocationsList items={items} theme="light" />);
    const cards = v.getAllByTestId("location-card");
    expect(cards).toHaveLength(3);
    expect(cards[0].textContent).toContain("Home");
    expect(cards[2].textContent).toContain("Longyearbyen");
  });

  it("carries each place's own verdict, not the first one", () => {
    const cards = view(<LocationsList items={items} theme="light" />).getAllByTestId(
      "location-card",
    );
    expect(cards[0].textContent).toContain(statusLine(raining));
    expect(cards[1].textContent).toContain(statusLine(clear));
    expect(cards[2].textContent).toContain(statusLine(blind));
  });

  it("announces itself as a list", () => {
    const el = view(<LocationsList items={items} theme="light" />).getByTestId(
      "locations-list",
    );
    expect(el.getAttribute("role")).toBe("list");
  });

  it("renders a footer slot after the rows", () => {
    const v = view(
      <LocationsList items={items} theme="light" footer={<Text>+ Add a place</Text>} />,
    );
    expect(v.getByTestId("locations-list").textContent).toContain("+ Add a place");
  });
});

describe("selection", () => {
  it("passes the pressed id back", () => {
    const onSelect = vi.fn();
    const v = view(<LocationsList items={items} theme="light" onSelect={onSelect} />);
    fireEvent.click(v.getAllByTestId("location-card")[1]);
    expect(onSelect).toHaveBeenCalledWith("cabin");
  });

  it("marks only the selected row", () => {
    const v = view(
      <LocationsList items={items} theme="light" selectedId="cabin" onSelect={() => {}} />,
    );
    const flags = v.getAllByTestId("location-card").map((c) => c.getAttribute("aria-selected"));
    expect(flags).toEqual(["false", "true", "false"]);
  });

  it("does not pretend the rows are buttons when nothing handles them", () => {
    const v = view(<LocationsList items={items} theme="light" />);
    for (const c of v.getAllByTestId("location-card")) {
      expect(c.getAttribute("role")).not.toBe("button");
    }
  });
});

describe("the empty state", () => {
  it("renders the slot it was given rather than owning the copy", () => {
    // EmptyState is the app's actual first impression and lives in its own
    // file; this list only owns the decision of WHEN it shows.
    const v = view(
      <LocationsList items={[]} theme="light" empty={<Text>No places saved yet</Text>} />,
    );
    expect(v.getByTestId("locations-empty").textContent).toBe("No places saved yet");
    expect(v.queryByTestId("locations-list")).toBeNull();
  });

  it("accepts the FlatList-shaped alias too", () => {
    const v = view(
      <LocationsList items={[]} theme="light" ListEmptyComponent={<Text>Nothing here</Text>} />,
    );
    expect(v.getByTestId("locations-empty").textContent).toBe("Nothing here");
  });

  it("prefers `empty` when both are given", () => {
    const v = view(
      <LocationsList
        items={[]}
        theme="light"
        empty={<Text>chosen</Text>}
        ListEmptyComponent={<Text>ignored</Text>}
      />,
    );
    expect(v.getByTestId("locations-empty").textContent).toBe("chosen");
  });

  it("suppresses the footer — EmptyState brings its own call to action", () => {
    // Two add buttons on one screen is two front doors to the same room.
    const v = view(
      <LocationsList
        items={[]}
        theme="light"
        empty={<Text>No places saved yet</Text>}
        footer={<Text>+ Add a place</Text>}
      />,
    );
    expect(v.container.textContent).not.toContain("+ Add a place");
  });

  it("renders nothing rather than crashing when no slot is supplied", () => {
    const v = view(<LocationsList items={[]} theme="light" />);
    expect(v.getByTestId("locations-empty").textContent).toBe("");
  });

  it("shows the list, not the empty state, as soon as there is one item", () => {
    const v = view(
      <LocationsList items={items.slice(0, 1)} theme="light" empty={<Text>empty</Text>} />,
    );
    expect(v.queryByTestId("locations-empty")).toBeNull();
    expect(v.getAllByTestId("location-card")).toHaveLength(1);
  });
});

describe("themes", () => {
  it("renders in both without throwing", () => {
    for (const theme of ["light", "dark"] as const) {
      expect(() => render(<LocationsList items={items} theme={theme} />)).not.toThrow();
    }
  });
});
