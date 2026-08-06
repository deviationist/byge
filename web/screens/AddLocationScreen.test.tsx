import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "../theme/ThemeProvider";
import { AddLocationScreen } from "./AddLocationScreen";

/**
 * Three ways into a coordinate — search, the map, and typing it — and the
 * screen is responsible for not saying the same thing three times while
 * offering them.
 */

let params: { id?: string } = {};

vi.mock("expo-router", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => params,
}));

// Search would otherwise reach Kartverket on every render of this suite.
vi.mock("../lib/search", () => ({ searchPlaces: vi.fn().mockResolvedValue([]) }));
vi.mock("../lib/geocode", () => ({ reverseGeocode: vi.fn().mockResolvedValue(null) }));

function renderAdd() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <ThemeProvider>{children}</ThemeProvider>
    </QueryClientProvider>
  );
  return render(<AddLocationScreen />, { wrapper });
}

beforeEach(() => {
  params = {};
  localStorage.clear();
});

describe("AddLocationScreen", () => {
  it("offers search, so adding a place is not only panning to it", () => {
    // From the default Oslo centre, reaching Tromsø by drag at a zoom where you
    // can still tell which fjord you are looking at is a very long way.
    renderAdd();
    expect(screen.getByTestId("place-search")).toBeInTheDocument();
  });

  it("lets the coordinate be typed, not only panned to", () => {
    // TextField's `coordinate` variant existed — clamping, decimal keypad, the
    // MET hint — and was used nowhere, so pasting a coordinate was impossible.
    renderAdd();
    expect(screen.getByLabelText("Latitude")).toBeInTheDocument();
    expect(screen.getByLabelText("Longitude")).toBeInTheDocument();
  });

  it("explains the four-decimal limit exactly once", () => {
    // It was stated three times: once under the map, once under each box.
    renderAdd();
    expect(screen.getAllByText(/Four decimals max/)).toHaveLength(1);
  });

  it("sets its own name in the display face, not as a mono section label", () => {
    // "ADD A PLACE" in mono put a screen's name in the register byge reserves
    // for instrumentation — ages, coordinates, footnotes.
    renderAdd();
    expect(screen.getByRole("heading", { name: "Add a place" })).toBeInTheDocument();
  });

  it("offers Cancel beside Save, not only the caret in the bar", () => {
    // The caret means "done looking"; Cancel means "discard what I typed". A
    // half-filled form sends you looking for the second one.
    renderAdd();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("does not offer search when editing", () => {
    // The pin is already where it was put; a search box above it invites
    // throwing that away.
    localStorage.setItem(
      "byge:locations:v1",
      JSON.stringify([{ id: "a", name: "Home", lat: 59.9, lon: 10.7, radiusKm: 3 }]),
    );
    params = { id: "a" };
    renderAdd();
    expect(screen.queryByTestId("place-search")).not.toBeInTheDocument();
  });
});
