import { CLIENT_KEY, viaProxy } from "./opendap";

/**
 * "Grünerløkka, Oslo" — the line under a place's name.
 *
 * WHY THIS IS NOT KARTVERKET, when everything else about the map is. Kartverket
 * is the authority byge already credits and the tiles come from them, so they
 * were the obvious first choice. They cannot answer this question. Their
 * place-name register (SSR) has no entry for `Grünerløkka` within 2 km of
 * Grünerløkka: the nearest names are parks ("Birkelunden", 117 m), streets and
 * squares, and the nearest administrative division is the county. Their address
 * API answers "Schleppegrells gate 14A" — a street address, which is both the
 * wrong register and far more precise than anyone wants stored about where they
 * live. OSM carries urban neighbourhoods as `suburb`, and it is the only open
 * source that does.
 *
 * WHY IT GOES THROUGH OUR PROXY, when Nominatim allows browser calls. Two
 * things a browser cannot do. Their usage policy requires a User-Agent naming
 * the application, and `User-Agent` is a forbidden header in fetch — so a
 * direct call could not comply even in principle. And the policy asks for
 * aggressive caching, which is unusually easy here: a fixed coordinate's place
 * name does not change, so every repeat is a cache hit they never see. This
 * adds no privacy surface, because the proxy is already the thing that fetches
 * radar for the same coordinate.
 *
 * IT RETURNS NULL EASILY AND OFTEN, and that is the design. Out at sea, deep in
 * a forest, over the border, rate-limited, offline, or simply not in OSM — all
 * of these end in no name, and no name renders no line. There is never a
 * placeholder, never "Unknown", never a bare municipality standing in for a
 * neighbourhood. A place you named "Cabin" that shows nothing underneath is
 * correct; one that shows "Unknown" is the app admitting a failure the reader
 * did not ask about.
 */

/**
 * zoom=14 is roughly neighbourhood scale.
 *
 * Deliberately not higher: 16+ starts returning buildings and house numbers,
 * which would put a person's street address in local storage as a side effect
 * of dropping a pin. This is a context line, not an address.
 */
const ZOOM = 14;

type NominatimAddress = {
  suburb?: string;
  neighbourhood?: string;
  city_district?: string;
  village?: string;
  town?: string;
  city?: string;
  municipality?: string;
  county?: string;
};

/**
 * Two parts at most: the local name and the one that disambiguates it.
 *
 * Ordered narrow to wide, and each slot takes the first that exists. Norway has
 * more than one Sandnes, so the wide part earns its place; but "Grünerløkka,
 * Oslo, Oslo, Norge" is the failure mode of just joining what came back.
 */
function format(address: NominatimAddress | undefined): string | null {
  if (!address) return null;

  const local =
    address.suburb ??
    address.neighbourhood ??
    address.city_district ??
    address.village ??
    address.town ??
    null;
  const wide = address.city ?? address.municipality ?? address.county ?? null;

  // Never "Oslo, Oslo". In a city the two fields often agree, and repeating a
  // name is worse than only saying it once.
  if (local && wide && local !== wide) return `${local}, ${wide}`;
  return local ?? wide ?? null;
}

export async function reverseGeocode(
  lat: number,
  lon: number,
  opts: { signal?: AbortSignal } = {},
): Promise<string | null> {
  const target =
    "https://nominatim.openstreetmap.org/reverse" +
    `?lat=${lat}&lon=${lon}&format=jsonv2&zoom=${ZOOM}&addressdetails=1`;

  try {
    const res = await fetch(viaProxy(target), {
      signal: opts.signal,
      headers: CLIENT_KEY ? { "X-Byge-Key": CLIENT_KEY } : undefined,
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { address?: NominatimAddress };
    return format(body.address);
  } catch {
    // Offline, aborted, rate-limited, malformed — all the same outcome, because
    // there is only one thing to do about any of them. A place name is a
    // courtesy; nothing in the app's answer depends on it.
    return null;
  }
}
