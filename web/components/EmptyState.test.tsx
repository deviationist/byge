import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EmptyState } from "./EmptyState";

describe("EmptyState — first run", () => {
  it("explains what byge does, since nobody has been told yet", () => {
    const { container } = render(<EmptyState reason="first-run" />);
    expect(container.textContent).toMatch(/nowhere saved yet/i);
    expect(container.textContent).toMatch(/whether it is raining there and for how long/i);
  });

  it("names the data source and that nothing leaves the device", () => {
    const { container } = render(<EmptyState reason="first-run" />);
    expect(container.textContent).toMatch(/MET Norway/);
    expect(container.textContent).toMatch(/stays on this device/i);
  });

  it("invites the first place", () => {
    const onAdd = vi.fn();
    render(<EmptyState reason="first-run" onAdd={onAdd} />);
    fireEvent.click(screen.getByRole("button", { name: "Add a place" }));
    expect(onAdd).toHaveBeenCalledOnce();
  });
});

describe("EmptyState — removed the last place", () => {
  it("confirms what was just done, by name", () => {
    const { container } = render(<EmptyState reason="removed-last" removedName="Cabin" />);
    expect(container.textContent).toContain("Cabin removed.");
  });

  it("does not pitch the product back at someone who just used it", () => {
    // They deleted a place thirty seconds ago; they know what byge is for.
    // Re-running the first-run copy reads as if the deletion did not register.
    const { container } = render(<EmptyState reason="removed-last" removedName="Cabin" />);
    expect(container.textContent).not.toMatch(/nowhere saved yet/i);
    expect(container.textContent).not.toMatch(/whether it is raining there and for how long/i);
  });

  it("is honest that the deletion is final", () => {
    const { container } = render(<EmptyState reason="removed-last" removedName="Cabin" />);
    expect(container.textContent).toMatch(/gone from this device/i);
    expect(container.textContent).toMatch(/no account and no sync/i);
  });

  it("keeps the removal tone even without a name", () => {
    // Falling back to the welcoming copy because a prop is missing would be the
    // wrong message for the wrong reason.
    const { container } = render(<EmptyState reason="removed-last" />);
    expect(container.textContent).toMatch(/^Removed\./);
    expect(container.textContent).not.toMatch(/nowhere saved yet/i);
  });

  it("still offers a way back, without insisting", () => {
    const onAdd = vi.fn();
    render(<EmptyState reason="removed-last" removedName="Cabin" onAdd={onAdd} />);
    fireEvent.click(screen.getByRole("button", { name: "Add a place" }));
    expect(onAdd).toHaveBeenCalledOnce();
  });
});

describe("EmptyState — shared", () => {
  it("omits the action when there is no handler", () => {
    render(<EmptyState reason="first-run" />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("gives each reason a different heading", () => {
    const first = render(<EmptyState reason="first-run" />).container.textContent;
    const removed = render(<EmptyState reason="removed-last" removedName="Cabin" />).container
      .textContent;
    expect(first).not.toBe(removed);
  });
});
