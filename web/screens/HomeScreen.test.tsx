import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type SavedLocation, saveLocations } from "../lib/storage";
import { ThemeProvider } from "../theme/ThemeProvider";
import { HomeScreen } from "./HomeScreen";

/**
 * The two-pane contract, from Specimen-Mutations. Every rule here fails
 * silently rather than loudly — a detail pane holding a place that no longer
 * exists looks like a working screen until you read the name.
 */

let params: { select?: string } = {};
let windowWidth = 1200;

vi.mock("expo-router", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useLocalSearchParams: () => params,
}));

vi.mock("react-native", async (orig) => {
  const rn = await orig<typeof import("react-native")>();
  return {
    ...rn,
    useWindowDimensions: () => ({ width: windowWidth, height: 900, scale: 1, fontScale: 1 }),
  };
});

const place = (id: string, name: string): SavedLocation => ({
  id,
  name,
  lat: 59.9273,
  lon: 10.7607,
  radiusKm: 3,
});

function renderHome() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <ThemeProvider>{children}</ThemeProvider>
    </QueryClientProvider>
  );
  return render(<HomeScreen />, { wrapper });
}

beforeEach(() => {
  params = {};
  windowWidth = 1200;
  localStorage.clear();
});

describe("two-pane", () => {
  it("shows both panes when there is room", () => {
    saveLocations([place("a", "Home"), place("b", "Cabin")]);
    renderHome();
    expect(screen.getByTestId("twopane-list")).toBeInTheDocument();
    expect(screen.getByTestId("twopane-detail")).toBeInTheDocument();
  });

  it("selects the first place so the detail pane is never blank", () => {
    // The pane holds exactly one verdict or an explicit empty message. Landing
    // with nothing selected would be neither.
    saveLocations([place("a", "Home"), place("b", "Cabin")]);
    renderHome();
    expect(screen.queryByTestId("pane-empty")).not.toBeInTheDocument();
  });

  it("explains itself when there is nothing to show", () => {
    renderHome();
    expect(screen.getByTestId("pane-empty")).toBeInTheDocument();
    expect(screen.getByText("Nothing to show.")).toBeInTheDocument();
  });

  it("honours the place a mutation points it at", () => {
    // After a removal the pane re-points at the surviving neighbour, and the
    // id travels as a route param because this screen remounts. Asserting the
    // SELECTED ROW rather than the absence of the empty pane, because the
    // contract is that selection and the pane agree — checking only that
    // something rendered would pass even if it re-pointed at the wrong place.
    saveLocations([place("a", "Home"), place("b", "Cabin")]);
    params = { select: "b" };
    const { container } = renderHome();
    const selected = container.querySelector('[aria-selected="true"]');
    expect(selected?.getAttribute("aria-label")).toContain("Cabin");
  });

  it("never holds a place that no longer exists", () => {
    // The invariant with the worst failure mode: a pane showing the verdict of
    // something just deleted reads as a working screen. A stale id must fall
    // through to a real one rather than being trusted.
    saveLocations([place("a", "Home")]);
    params = { select: "deleted-id" };
    const { container } = renderHome();
    const selected = container.querySelector('[aria-selected="true"]');
    expect(selected?.getAttribute("aria-label")).toContain("Home");
  });
});

describe("phone", () => {
  it("shows one pane, not a collapsed split", () => {
    windowWidth = 390;
    saveLocations([place("a", "Home")]);
    renderHome();
    expect(screen.getByTestId("twopane-list")).toBeInTheDocument();
    expect(screen.queryByTestId("twopane-detail")).not.toBeInTheDocument();
  });

  it("selects nothing, because there is no pane to reflect a selection", () => {
    // Highlighting a row on phone would promise a detail view that is not there.
    windowWidth = 390;
    saveLocations([place("a", "Home"), place("b", "Cabin")]);
    const { container } = renderHome();
    expect(container.querySelector('[aria-selected="true"]')).toBeNull();
  });
});
