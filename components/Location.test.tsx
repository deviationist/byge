import { render, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { formatCoords, Location } from "./Location";

const view = (ui: React.ReactElement) => {
  const { container } = render(ui);
  return { container, ...within(container) };
};

describe("formatCoords", () => {
  it("clamps to 4 decimals", () => {
    // Not cosmetic: MET returns 403 above 4 decimals, and our grid is 1 km, so
    // a 5th digit would imply a resolution the data does not have.
    expect(formatCoords(59.92731234, 10.76071234)).toBe("59.9273, 10.7607");
  });

  it("pads short values so the readout does not jitter", () => {
    expect(formatCoords(60, 5.5)).toBe("60.0000, 5.5000");
  });

  it("keeps negative longitudes intact", () => {
    expect(formatCoords(64.1466, -21.9426)).toBe("64.1466, -21.9426");
  });
});

describe("variants", () => {
  it("row shows the name alone — the status line is what the row is for", () => {
    const v = view(
      <Location
        name="Home"
        place="Grünerløkka, Oslo"
        lat={59.9273}
        lon={10.7607}
        theme="light"
      />,
    );
    expect(v.getByTestId("location-name").textContent).toBe("Home");
    expect(v.queryByTestId("location-place")).toBeNull();
    expect(v.queryByTestId("location-coords")).toBeNull();
  });

  it("header carries everything — it is where you confirm the right place", () => {
    const v = view(
      <Location
        name="Home"
        place="Grünerløkka, Oslo"
        lat={59.9273}
        lon={10.7607}
        theme="light"
        variant="header"
      />,
    );
    expect(v.getByTestId("location-name").textContent).toBe("Home · Grünerløkka, Oslo");
    expect(v.getByTestId("location-place").textContent).toBe(" · Grünerløkka, Oslo");
    expect(v.getByTestId("location-coords").textContent).toBe("59.9273, 10.7607");
  });

  it("popup names the place but not the coordinates — the pin is the coordinate", () => {
    const v = view(
      <Location
        name="Cabin"
        place="Hemsedal"
        lat={60.862}
        lon={8.556}
        theme="light"
        variant="popup"
      />,
    );
    expect(v.getByTestId("location-name").textContent).toBe("Cabin · Hemsedal");
    expect(v.queryByTestId("location-coords")).toBeNull();
  });

  it("scales the name down when the identity is a caption rather than the subject", () => {
    const row = view(<Location name="Home" theme="light" variant="row" />);
    const header = view(<Location name="Home" theme="light" variant="header" />);
    const size = (s: ReturnType<typeof view>) =>
      Number.parseFloat(s.getByTestId("location-name").style.fontSize);
    expect(size(row)).toBeGreaterThan(size(header));
  });
});

describe("overrides", () => {
  it("can show the place in a row when two places share a name", () => {
    const v = view(<Location name="Home" place="Oslo" theme="light" showPlace />);
    expect(v.getByTestId("location-name").textContent).toBe("Home · Oslo");
  });

  it("can suppress the coordinates in a header", () => {
    const v = view(
      <Location
        name="Home"
        lat={1}
        lon={2}
        theme="light"
        variant="header"
        showCoords={false}
      />,
    );
    expect(v.queryByTestId("location-coords")).toBeNull();
  });
});

describe("missing data degrades quietly", () => {
  it("omits the place separator when there is no place", () => {
    const v = view(<Location name="Home" theme="light" variant="header" />);
    expect(v.getByTestId("location-name").textContent).toBe("Home");
    expect(v.getByTestId("location-name").textContent).not.toContain("·");
  });

  it("omits coordinates rather than rendering a half pair", () => {
    // A lone latitude is worse than none — it looks like a coordinate.
    const v = view(<Location name="Home" lat={59.9273} theme="light" variant="header" />);
    expect(v.queryByTestId("location-coords")).toBeNull();
  });

  it("renders coordinates at 0,0 rather than treating them as absent", () => {
    const v = view(
      <Location name="Null Island" lat={0} lon={0} theme="light" variant="header" />,
    );
    expect(v.getByTestId("location-coords").textContent).toBe("0.0000, 0.0000");
  });
});

describe("presentation", () => {
  it("truncates a long name to one line instead of reflowing the row", () => {
    // react-native-web implements numberOfLines={1} as atomic utility classes
    // (overflow / text-overflow / white-space), never an inline style — so the
    // class is the only place the prop is observable.
    const v = view(<Location name={"Very ".repeat(20)} theme="light" />);
    expect(v.getByTestId("location-name").className).toMatch(/r-textOverflow/);
  });

  it("uses only theme tokens, never a literal colour", () => {
    for (const theme of ["light", "dark"] as const) {
      const v = view(
        <Location name="Home" place="Oslo" lat={1} lon={2} theme={theme} variant="header" />,
      );
      for (const id of ["location-name", "location-place", "location-coords"]) {
        expect(v.getByTestId(id).style.color).toContain("var(--color-");
      }
    }
  });
});
