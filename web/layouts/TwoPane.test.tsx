import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TWO_PANE_BREAKPOINT, TwoPane } from "./TwoPane";

const List = () => <span data-testid="list-content" />;
const Detail = () => <span data-testid="detail-content" />;

const WIDE = TWO_PANE_BREAKPOINT + 200;
const PHONE = TWO_PANE_BREAKPOINT - 1;

describe("TwoPane on tablet and desktop", () => {
  it("puts the list beside the detail", () => {
    render(<TwoPane width={WIDE} list={<List />} detail={<Detail />} />);
    expect(screen.getByTestId("list-content")).toBeTruthy();
    expect(screen.getByTestId("detail-content")).toBeTruthy();
    expect(screen.getByTestId("twopane-list").parentElement?.style.flexDirection).toBe("row");
  });

  it("gives the list a fixed width and the detail the remainder", () => {
    render(<TwoPane width={WIDE} list={<List />} detail={<Detail />} />);
    expect(screen.getByTestId("twopane-list").style.flexShrink).toBe("0");
    expect(screen.getByTestId("twopane-detail").style.flex).not.toBe("");
  });

  it("lets the detail pane shrink below its content", () => {
    // Flex children default to min-width:auto, so a long place name would push
    // the list off the screen instead of wrapping.
    render(<TwoPane width={WIDE} list={<List />} detail={<Detail />} />);
    expect(screen.getByTestId("twopane-detail").style.minWidth).toBe("0px");
  });

  it("takes a custom list width", () => {
    render(<TwoPane width={WIDE} listWidth={240} list={<List />} detail={<Detail />} />);
    expect(screen.getByTestId("twopane-list").style.width).toBe("240px");
  });

  it("ignores `show` when both panes fit", () => {
    render(<TwoPane width={WIDE} show="detail" list={<List />} detail={<Detail />} />);
    expect(screen.getByTestId("list-content")).toBeTruthy();
    expect(screen.getByTestId("detail-content")).toBeTruthy();
  });
});

describe("TwoPane on phone", () => {
  it("renders only the side the caller asked for", () => {
    // Not hidden — not mounted. A hidden pane still fetches its location's
    // verdict and still fills the accessibility tree.
    render(<TwoPane width={PHONE} show="list" list={<List />} detail={<Detail />} />);
    expect(screen.getByTestId("list-content")).toBeTruthy();
    expect(screen.queryByTestId("detail-content")).toBeNull();
  });

  it("shows the detail when that is what the route means", () => {
    render(<TwoPane width={PHONE} show="detail" list={<List />} detail={<Detail />} />);
    expect(screen.getByTestId("detail-content")).toBeTruthy();
    expect(screen.queryByTestId("list-content")).toBeNull();
  });

  it("defaults to the list", () => {
    // The list is the root route, so it is the safe default.
    render(<TwoPane width={PHONE} list={<List />} detail={<Detail />} />);
    expect(screen.getByTestId("list-content")).toBeTruthy();
    expect(screen.queryByTestId("detail-content")).toBeNull();
  });

  it("does not guess from an empty detail slot", () => {
    // Coming back from a deleted location, the detail slot is populated but
    // the list is what should show — inference gets exactly that case wrong.
    render(<TwoPane width={PHONE} show="list" list={<List />} detail={<Detail />} />);
    expect(screen.queryByTestId("detail-content")).toBeNull();
  });

  it("switches shape exactly at the breakpoint", () => {
    const { rerender } = render(
      <TwoPane
        width={TWO_PANE_BREAKPOINT - 1}
        show="list"
        list={<List />}
        detail={<Detail />}
      />,
    );
    expect(screen.queryByTestId("detail-content")).toBeNull();
    rerender(
      <TwoPane width={TWO_PANE_BREAKPOINT} show="list" list={<List />} detail={<Detail />} />,
    );
    expect(screen.getByTestId("detail-content")).toBeTruthy();
  });

  it("honours a custom breakpoint", () => {
    render(<TwoPane width={900} breakpoint={1100} list={<List />} detail={<Detail />} />);
    expect(screen.queryByTestId("detail-content")).toBeNull();
  });
});
