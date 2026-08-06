import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlaceSearch } from "./PlaceSearch";

/**
 * Search sets the map; it never saves. Everything below is about not making a
 * confident claim on the user's behalf.
 */

const hits = (names: string[]) =>
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        navn: names.map((n, i) => ({
          skrivemåte: n,
          navneobjekttype: "Tettbebyggelse",
          kommuner: [{ kommunenavn: "Oslo" }],
          representasjonspunkt: { nord: 59 + i, øst: 10 + i },
        })),
      }),
    } as unknown as Response),
  );

const type = (value: string) =>
  fireEvent.change(screen.getByTestId("place-search"), { target: { value } });

afterEach(() => vi.unstubAllGlobals());

describe("PlaceSearch", () => {
  it("offers what it found", async () => {
    hits(["Bergen", "Bergenhus"]);
    render(<PlaceSearch theme="light" onPick={() => {}} />);
    type("Bergen");
    expect(await screen.findByText("Bergen")).toBeInTheDocument();
    expect(screen.getByText("Bergenhus")).toBeInTheDocument();
  });

  it("hands back the coordinate when a hit is chosen", async () => {
    hits(["Bergen"]);
    const onPick = vi.fn();
    render(<PlaceSearch theme="light" onPick={onPick} />);
    type("Bergen");
    fireEvent.click(await screen.findByRole("button", { name: /Bergen/ }));
    expect(onPick).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Bergen", lat: 59, lon: 10 }),
    );
  });

  it("clears itself once a hit is applied", async () => {
    // Leaving alternatives open under a map that has already moved reads as
    // "not applied yet".
    hits(["Bergen"]);
    render(<PlaceSearch theme="light" onPick={() => {}} />);
    type("Bergen");
    fireEvent.click(await screen.findByRole("button", { name: /Bergen/ }));
    await waitFor(() => expect(screen.queryByTestId("search-hits")).not.toBeInTheDocument());
  });

  it("names the other two ways in rather than dead-ending", async () => {
    hits([]);
    render(<PlaceSearch theme="light" onPick={() => {}} />);
    type("Zzzzz");
    const empty = await screen.findByTestId("search-empty");
    expect(empty.textContent).toMatch(/map|coordinates/i);
  });

  it("says nothing at all before a search has run", () => {
    // An empty-results message on an untouched field accuses the user of a
    // failed search they never made.
    hits([]);
    render(<PlaceSearch theme="light" onPick={() => {}} />);
    expect(screen.queryByTestId("search-empty")).not.toBeInTheDocument();
  });

  it("announces that it owns a list of results", () => {
    hits([]);
    render(<PlaceSearch theme="light" onPick={() => {}} />);
    expect(screen.getByTestId("place-search")).toHaveAttribute("role", "combobox");
  });

  it("labels each row with its municipality, not just the name", async () => {
    // "Sandnes" alone does not distinguish the two of them, and a screen-reader
    // user gets no column layout to disambiguate from.
    hits(["Sandnes"]);
    render(<PlaceSearch theme="light" onPick={() => {}} />);
    type("Sandnes");
    expect(await screen.findByRole("button", { name: /Sandnes\. .*Oslo/ })).toBeInTheDocument();
  });
});
