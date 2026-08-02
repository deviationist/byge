import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConfirmSheet, removeLocationCopy } from "./ConfirmSheet";

const base = {
  open: true,
  title: "Remove Cabin?",
  body: "This deletes the place and its saved answer from this device.",
  confirmLabel: "Remove Cabin",
};

describe("ConfirmSheet", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <ConfirmSheet {...base} open={false} onConfirm={() => {}} onCancel={() => {}} />,
    );
    expect(container.textContent).toBe("");
  });

  it("confirms only on the confirm button", () => {
    const onConfirm = vi.fn();
    render(<ConfirmSheet {...base} onConfirm={onConfirm} onCancel={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove Cabin" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("cancels on 'Keep it'", () => {
    const onCancel = vi.fn();
    render(<ConfirmSheet {...base} onConfirm={() => {}} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole("button", { name: "Keep it" }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("Escape cancels — a confirmation you cannot dismiss by keyboard is a trap", () => {
    const onCancel = vi.fn();
    render(<ConfirmSheet {...base} onConfirm={() => {}} onCancel={onCancel} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("Escape never confirms", () => {
    // The keyboard escape hatch must always land on the safe outcome.
    const onConfirm = vi.fn();
    render(<ConfirmSheet {...base} onConfirm={onConfirm} onCancel={() => {}} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("shows the detail line naming exactly what is affected", () => {
    render(
      <ConfirmSheet
        {...base}
        detail="Hemsedal · 60.8620, 8.5560 · 3 km"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByText(/60\.8620/)).toBeTruthy();
  });

  it("uses no alarm colour — the wording carries the caution", () => {
    // A lone red button in an app whose only saturated colour is the rain data
    // reads as an error rather than a choice.
    render(<ConfirmSheet {...base} onConfirm={() => {}} onCancel={() => {}} />);
    const confirm = screen.getByRole("button", { name: "Remove Cabin" });
    expect(confirm.style.backgroundColor).toContain("--color-ink");
  });
});

describe("removeLocationCopy", () => {
  it("names the place on the button, never 'OK'", () => {
    const c = removeLocationCopy("Cabin");
    expect(c.confirmLabel).toBe("Remove Cabin");
    expect(c.title).toBe("Remove Cabin?");
  });

  it("says why it cannot be undone rather than just warning", () => {
    // There is no account and no sync, so the sheet states the actual reason.
    expect(removeLocationCopy("Cabin").body).toMatch(/no account and no sync/);
  });

  it("makes both buttons name an outcome — neither is a shrug", () => {
    expect(removeLocationCopy("Cabin").cancelLabel).toBe("Keep it");
  });
});
