import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

// Mutable so each test can put the screen on a different route.
let params: { removed?: string } = {};

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
});

describe("LocationsScreen — the two empty states", () => {
  it("welcomes on first run", () => {
    renderScreen();
    expect(screen.getByText("Nowhere saved yet")).toBeInTheDocument();
  });

  it("confirms the deletion after the last place is removed", () => {
    // The name arrives as a route param because this screen remounts on
    // navigation. This is the assertion the original bug failed.
    params = { removed: "Cabin" };
    renderScreen();
    expect(screen.getByText("Cabin removed.")).toBeInTheDocument();
    expect(screen.queryByText("Nowhere saved yet")).not.toBeInTheDocument();
  });

  it("still uses the removal tone when the name did not survive the trip", () => {
    // A blank name must not silently fall back to the first-run pitch — that is
    // the wrong copy for the wrong reason, so the branch keys on the param
    // being present rather than on it being truthy.
    params = { removed: "" };
    renderScreen();
    expect(screen.getByText("Removed.")).toBeInTheDocument();
    expect(screen.queryByText("Nowhere saved yet")).not.toBeInTheDocument();
  });
});
