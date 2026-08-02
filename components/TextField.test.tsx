import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { COORD_HINT, TextField } from "./TextField";

const MIN_TARGET = 44;

describe("TextField", () => {
  it("wires a real label to the input, not a placeholder", () => {
    // getByLabelText resolves aria-labelledby, so this fails if the label is
    // only rendered next to the field rather than associated with it.
    render(<TextField label="Latitude" value="59.9273" onChangeText={() => {}} />);
    expect(screen.getByLabelText("Latitude")).toBeTruthy();
  });

  it("keeps the label when a placeholder is also set", () => {
    // The placeholder vanishes on first keystroke; the label must not be it.
    render(<TextField label="Name it" value="" placeholder="Home" onChangeText={() => {}} />);
    expect(screen.getByLabelText("Name it")).toBeTruthy();
  });

  it("reports typing", () => {
    const onChangeText = vi.fn();
    render(<TextField label="Name it" value="" onChangeText={onChangeText} />);
    fireEvent.change(screen.getByLabelText("Name it"), { target: { value: "Cabin" } });
    expect(onChangeText).toHaveBeenCalledWith("Cabin");
  });

  it("meets the 44px minimum hit area", () => {
    render(<TextField label="Name it" value="" onChangeText={() => {}} />);
    const el = screen.getByLabelText("Name it");
    expect(Number.parseFloat(el.style.minHeight)).toBeGreaterThanOrEqual(MIN_TARGET);
  });

  it("describes the field with its hint", () => {
    render(
      <TextField
        label="Name it"
        value=""
        hint="Anything you'll recognise"
        onChangeText={() => {}}
      />,
    );
    expect(screen.getByLabelText("Name it")).toHaveAccessibleDescription(
      /anything you'll recognise/i,
    );
  });
});

describe("TextField errors", () => {
  it("announces the error rather than only colouring the border", () => {
    render(
      <TextField label="Latitude" value="abc" error="Not a number." onChangeText={() => {}} />,
    );
    // role=alert is what makes it spoken; aria-invalid is what makes the field
    // itself report as wrong when tabbed back into.
    expect(screen.getByRole("alert")).toHaveTextContent("Not a number.");
    expect(screen.getByLabelText("Latitude")).toHaveAttribute("aria-invalid", "true");
  });

  it("puts the error ahead of the hint in the description", () => {
    render(
      <TextField
        label="Latitude"
        value="abc"
        error="Not a number."
        hint="Decimal degrees."
        onChangeText={() => {}}
      />,
    );
    const desc = screen.getByLabelText("Latitude").getAttribute("aria-describedby") ?? "";
    const [first, second] = desc.split(" ");
    expect(document.getElementById(first)).toHaveTextContent("Not a number.");
    expect(document.getElementById(second)).toHaveTextContent("Decimal degrees.");
  });

  it("is not invalid when there is no error", () => {
    render(<TextField label="Latitude" value="59.9" onChangeText={() => {}} />);
    expect(screen.getByLabelText("Latitude")).not.toHaveAttribute("aria-invalid");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("TextField coordinate variant", () => {
  it("clamps to 4 decimals on blur — finer than that is a 403 from MET", () => {
    const onChangeText = vi.fn();
    render(
      <TextField
        label="Latitude"
        variant="coordinate"
        value="59.927312"
        onChangeText={onChangeText}
      />,
    );
    fireEvent.blur(screen.getByLabelText("Latitude"));
    expect(onChangeText).toHaveBeenCalledWith("59.9273");
  });

  it("leaves an already-short value alone rather than reformatting it", () => {
    // "59.9000" and "59.9" are the same coordinate. Rewriting mid-form would
    // read as the field arguing with you for no gain.
    const onChangeText = vi.fn();
    render(
      <TextField
        label="Latitude"
        variant="coordinate"
        value="59.9000"
        onChangeText={onChangeText}
      />,
    );
    fireEvent.blur(screen.getByLabelText("Latitude"));
    expect(onChangeText).not.toHaveBeenCalled();
  });

  it("leaves half-typed input alone", () => {
    // A lone "-" is someone still typing, not a coordinate to round.
    const onChangeText = vi.fn();
    for (const value of ["", "-", "."]) {
      onChangeText.mockClear();
      const { unmount } = render(
        <TextField
          label="Longitude"
          variant="coordinate"
          value={value}
          onChangeText={onChangeText}
        />,
      );
      fireEvent.blur(screen.getByLabelText("Longitude"));
      expect(onChangeText).not.toHaveBeenCalled();
      unmount();
    }
  });

  it("still calls the caller's onBlur after clamping", () => {
    const onBlur = vi.fn();
    render(
      <TextField
        label="Latitude"
        variant="coordinate"
        value="59.927312"
        onChangeText={() => {}}
        onBlur={onBlur}
      />,
    );
    fireEvent.blur(screen.getByLabelText("Latitude"));
    expect(onBlur).toHaveBeenCalledOnce();
  });

  it("explains why the precision is capped, without saying '403'", () => {
    // The reason has to be in the UI: silently truncating someone's paste with
    // no explanation looks like a bug in our field, not a limit of the source.
    render(
      <TextField label="Latitude" variant="coordinate" value="59.9" onChangeText={() => {}} />,
    );
    expect(screen.getByLabelText("Latitude")).toHaveAccessibleDescription(/four decimals max/i);
    expect(COORD_HINT).toMatch(/11 m/);
  });

  it("offers a decimal keypad on phones", () => {
    render(
      <TextField label="Latitude" variant="coordinate" value="59.9" onChangeText={() => {}} />,
    );
    expect(screen.getByLabelText("Latitude")).toHaveAttribute("inputmode", "decimal");
  });

  it("does not clamp the plain text variant", () => {
    const onChangeText = vi.fn();
    render(<TextField label="Name it" value="59.927312" onChangeText={onChangeText} />);
    fireEvent.blur(screen.getByLabelText("Name it"));
    expect(onChangeText).not.toHaveBeenCalled();
  });
});
