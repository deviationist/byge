/**
 * Place search — "Bergen" → a coordinate.
 *
 * Without it, adding a place means panning there. From the default Oslo centre
 * that is a long drag to Tromsø at a zoom where you can still tell which fjord
 * you are looking at, and it is the only way in.
 *
 * KARTVERKET, NOT OSM, and this is the mirror of the choice in `geocode.ts`.
 * Kartverket's name search is excellent — ask for "Grünerløkka" and the top hit
 * is the administrative bydel with its coordinate — because searching a
 * gazetteer BY NAME is the thing a gazetteer is for. It is also the Norwegian
 * mapping authority, the source the tiles come from and the app already
 * credits, and byge is a Norway-only app by construction: the radar grid stops
 * at the Nordic coastline, so a search that only knows Norwegian places loses
 * nothing we could have answered anyway.
 *
 * It also sidesteps Nominatim's usage policy, which singles out search as the
 * expensive endpoint and forbids autocomplete-style querying outright. Doing
 * this on OSM would mean either breaking that policy or building a deliberately
 * worse search to stay inside it.
 *
 * DIRECT, NOT THROUGH THE PROXY, unlike the reverse lookup — and for the
 * reasons that made the proxy necessary there, both of which are absent here.
 * Kartverket sends `access-control-allow-origin: *` and asks for no identifying
 * User-Agent, so nothing about this call needs a header a browser cannot set.
 * The tiles already go straight to Kartverket from the browser, so this adds no
 * origin the user was not already talking to.
 */

const ENDPOINT = "https://ws.geonorge.no/stedsnavn/v1/navn";

export type Place = {
  name: string;
  /** "Administrativ bydel · Oslo" — what kind of thing, and where. */
  detail: string;
  lat: number;
  lon: number;
};

type Hit = {
  skrivemåte?: string;
  navneobjekttype?: string;
  kommuner?: { kommunenavn?: string }[];
  representasjonspunkt?: { nord?: number; øst?: number };
};

/**
 * Two places can share a name — there is more than one Sandnes — so the type
 * and the municipality are shown, never just the name. Picking the wrong Sandnes
 * gives a confident, correct-looking answer about the wrong end of the country.
 */
function toPlace(hit: Hit): Place | null {
  const name = hit.skrivemåte;
  const lat = hit.representasjonspunkt?.nord;
  const lon = hit.representasjonspunkt?.øst;
  if (!name || typeof lat !== "number" || typeof lon !== "number") return null;

  const kind = hit.navneobjekttype ?? "";
  const municipality = hit.kommuner?.[0]?.kommunenavn ?? "";
  const detail = [kind, municipality].filter(Boolean).join(" · ");
  return { name, detail, lat, lon };
}

export async function searchPlaces(
  query: string,
  opts: { signal?: AbortSignal; limit?: number } = {},
): Promise<Place[]> {
  const q = query.trim();
  // One character matches most of the country and is never what anyone meant.
  if (q.length < 2) return [];

  const url =
    `${ENDPOINT}?sok=${encodeURIComponent(q)}*` +
    `&treffPerSide=${opts.limit ?? 8}&utkoordsys=4326`;

  try {
    const res = await fetch(url, { signal: opts.signal });
    if (!res.ok) return [];
    const body = (await res.json()) as { navn?: Hit[] };
    return (body.navn ?? []).map(toPlace).filter((p): p is Place => p !== null);
  } catch {
    // Offline or aborted. An empty list is the honest answer and the screen
    // already has the map and the coordinate boxes — search is one way in, not
    // the only one, so a failure here must never block adding a place.
    return [];
  }
}
