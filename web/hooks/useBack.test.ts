import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useBack } from "./useBack";

/**
 * The bug: open /add directly, or refresh it, and back did nothing at all —
 * expo-router warns in development and is silently inert in production, which
 * leaves an enabled-looking control that does not work.
 */

const back = vi.fn();
const replace = vi.fn();
let canGoBack = true;

vi.mock("expo-router", () => ({
  useRouter: () => ({ back, replace, canGoBack: () => canGoBack, push: vi.fn() }),
}));

beforeEach(() => {
  back.mockClear();
  replace.mockClear();
  canGoBack = true;
});

describe("useBack", () => {
  it("pops history when there is history", () => {
    // History is the more truthful answer: it returns you to the screen you
    // actually came from, which is not always the fallback.
    const { result } = renderHook(() => useBack("/"));
    result.current();
    expect(back).toHaveBeenCalledOnce();
    expect(replace).not.toHaveBeenCalled();
  });

  it("goes to the fallback on a cold load", () => {
    canGoBack = false;
    const { result } = renderHook(() => useBack("/"));
    result.current();
    expect(replace).toHaveBeenCalledWith("/");
    expect(back).not.toHaveBeenCalled();
  });

  it("replaces rather than pushes the fallback", () => {
    // Pushing would leave the dead-end screen on the stack, so a second back
    // press returns to it — a loop built out of a missing history entry.
    canGoBack = false;
    const { result } = renderHook(() => useBack("/"));
    result.current();
    expect(replace).toHaveBeenCalledOnce();
  });
});
