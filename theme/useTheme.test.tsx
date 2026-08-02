import { act, render, renderHook, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { ThemeProvider, useResolvedTheme } from "./ThemeProvider";
import { resolveTheme } from "./useTheme";

beforeEach(() => {
  localStorage.clear();
  document.documentElement.className = "";
});

describe("resolveTheme", () => {
  it("follows the system when the choice is 'system'", () => {
    expect(resolveTheme("system", "dark")).toBe("dark");
    expect(resolveTheme("system", "light")).toBe("light");
  });

  it("an explicit choice overrides the system", () => {
    expect(resolveTheme("light", "dark")).toBe("light");
    expect(resolveTheme("dark", "light")).toBe("dark");
  });
});

describe("ThemeProvider", () => {
  function Probe() {
    return <span data-testid="t">{useResolvedTheme()}</span>;
  }

  it("provides a resolved theme", () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(["light", "dark"]).toContain(screen.getByTestId("t").textContent);
  });

  it("toggles the root `dark` class, which is what Uniwind's overrides key on", () => {
    // The whole dark palette is class-based. If the class never lands on the
    // root element, every dark override silently does nothing.
    const { result } = renderHook(() => useResolvedTheme(), { wrapper: ThemeProvider });
    expect(document.documentElement.classList.contains("dark")).toBe(result.current === "dark");
  });

  it("throws a useful error when used outside the provider", () => {
    expect(() => renderHook(() => useResolvedTheme())).toThrow(/inside ThemeProvider/);
  });
});
