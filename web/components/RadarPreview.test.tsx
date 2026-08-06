import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { RadarPreview, ringDiameterPx } from "./RadarPreview";

/**
 * The preview is a LINK that happens to be a picture, and every rule here is
 * about not letting it become a picture that happens to navigate.
 *
 * jsdom fires no layout, so `onLayout` never runs and the field query stays
 * disabled — which is exactly the state these assertions want. Everything below
 * has to hold before any radar has arrived, because that is what a reader sees
 * first and it is the state a network failure leaves them in permanently.
 */
function wrap(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const OSLO = { lat: 59.9273, lon: 10.7607 };

function setup(over: Partial<Parameters<typeof RadarPreview>[0]> = {}) {
  const onPress = vi.fn();
  const utils = wrap(
    <RadarPreview
      {...OSLO}
      name="Home"
      radiusKm={3}
      theme="light"
      onPress={onPress}
      {...over}
    />,
  );
  return { onPress, ...utils };
}

describe("RadarPreview", () => {
  it("names where pressing goes, not what the picture shows", () => {
    // "Radar map of Home" would describe what is under the finger. A link can
    // only promise a destination, so that is what it announces.
    setup();
    expect(screen.getByRole("link", { name: "See why — radar map for Home" })).toBeVisible();
  });

  it("navigates on press", () => {
    const { onPress } = setup();
    fireEvent.click(screen.getByRole("link"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("keeps the visible link text, so the destination is legible without a screen reader", () => {
    // Without it the strip is a decorative image that silently navigates. It is
    // also the only thing left when the field cannot load.
    setup();
    expect(screen.getByText(/See why — radar map/)).toBeVisible();
  });

  it("carries the basemap credit", () => {
    // A licence condition, not chrome. The app footer credits MET and OSM but
    // NOT Kartverket — the basemap credit travels with the basemap, so any
    // surface showing their tiles has to state it however small it is.
    setup();
    expect(screen.getByText(/Kartverket/)).toBeVisible();
  });

  it("draws a ring for the disc, not just a point", () => {
    // The sentence above the preview is a claim about everything inside this
    // circle. Without it a reader matches the headline against the single point
    // under the marker — the exact misreading the radius setting exists to
    // prevent, since "rain on the way" can mean a band 3 km off.
    const { container } = setup();
    expect(container.querySelector('[data-testid="radius-ring"]')).not.toBeNull();
  });

  it("sizes the ring from the saved radius and the projection", () => {
    // Asserted on the arithmetic rather than the DOM: react-native-web compiles
    // every style into an atomic class, so a rendered size is not legible from
    // jsdom at all. What could actually break is this sum.
    const oslo = OSLO.lat;
    // A 3 km radius at zoom 9 is a ring you can see but not one that fills the
    // strip. If this ever lands near zero or near the pane width, the zoom and
    // the radius have stopped agreeing about scale.
    expect(ringDiameterPx(3, oslo)).toBeGreaterThan(20);
    expect(ringDiameterPx(3, oslo)).toBeLessThan(80);
    // And it must actually track the radius: 25 km is the widest the app offers.
    expect(ringDiameterPx(25, oslo)).toBeCloseTo(ringDiameterPx(3, oslo) * (25 / 3), 5);
  });

  it("does not make the map itself focusable inside the link", () => {
    // A map region nested in a link is one object announced twice, and two tab
    // stops for one destination. `interactive={false}` is what settles both.
    const { container } = setup();
    const region = container.querySelector('[role="region"]') as HTMLElement | null;
    expect(region?.getAttribute("tabindex")).toBe("-1");
  });
});
