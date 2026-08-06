import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { noteRemoval, type SavedLocation, saveLocations } from "../lib/storage";
import { ThemeProvider } from "../theme/ThemeProvider";
import { LocationsScreen } from "./LocationsScreen";

/**
 * The first screen test, and it exists because of a bug only a screen test
 * could catch.
 *
 * `EmptyState` was correct and covered; the *wiring* was not. The cleared name
 * lived in this screen's own `useState`, which is fresh on every mount — and
 * removal happens on the verdict screen, which then navigates here. So the
 * setter was never called, the cleared state could never fire, and deleting
 * your last place showed the first-run welcome instead. Every component test
 * passed throughout.
 */

// The screen reads no params of its own any more — mutation receipts moved out
// of the URL entirely — but expo-router still has to be stubbed.
let params: Record<string, string> = {};

const place = (id: string, name: string): SavedLocation => ({
  id,
  name,
  lat: 59.9273,
  lon: 10.7607,
  radiusKm: 3,
});

vi.mock("expo-router", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useLocalSearchParams: () => params,
}));

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <ThemeProvider>{children}</ThemeProvider>
    </QueryClientProvider>
  );
  return render(<LocationsScreen />, { wrapper });
}

beforeEach(() => {
  params = {};
  localStorage.clear();
  // The ephemeral name is module state, so it outlives a test otherwise.
  noteRemoval("");
});

describe("LocationsScreen — the two empty states", () => {
  it("welcomes on first run", () => {
    renderScreen();
    expect(screen.getByText("Nowhere saved yet")).toBeInTheDocument();
  });

  it("confirms the deletion after the last place is removed", () => {
    // Both facts come from module state now, not from a route param: the sticky
    // flag says "this device has had places", the ephemeral name says which one
    // just went. This is the assertion the original bug failed.
    saveLocations([place("a", "Cabin")]);
    noteRemoval("Cabin");
    saveLocations([]);
    renderScreen();
    expect(screen.getByText("Cabin removed.")).toBeInTheDocument();
    expect(screen.queryByText("Nowhere saved yet")).not.toBeInTheDocument();
  });

  it("keeps the removal tone after a reload, when the name is gone", () => {
    // The name is deliberately not persisted, so a reload loses it — but the
    // sticky flag survives, and falling back to the first-run pitch for someone
    // who has emptied their list is the wrong copy for the wrong reason.
    saveLocations([place("a", "Cabin")]);
    saveLocations([]);
    renderScreen();
    expect(screen.getByText("Removed.")).toBeInTheDocument();
    expect(screen.queryByText("Nowhere saved yet")).not.toBeInTheDocument();
  });
});
