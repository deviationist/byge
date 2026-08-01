// Dev CLI: run the TypeScript data layer against live MET data.
//   bunx tsx scripts/verdict.mts [lat lon radiusKm]
import { describe as desc, verdict } from "../lib/forecast.js";

const args = process.argv.slice(2);
const pts: [number, number, number, string][] = args.length
  ? [[Number(args[0]), Number(args[1]), Number(args[2] ?? 3), "requested"]]
  : [
      [59.911, 10.75, 3, "Oslo"],
      [63.6, 9.9, 3, "Trondelag"],
      [68.136, 18.079, 3, "Narvik area r=3"],
      [68.136, 18.079, 15, "Narvik area r=15"],
      [62.0, 2.0, 3, "North Sea (blind)"],
      [78.223, 15.627, 3, "Svalbard (off-grid)"],
    ];

for (const [lat, lon, r, name] of pts) {
  const v = await verdict(lat, lon, { radiusKm: r });
  console.log(`### ${name}`);
  console.log(desc(v));
  console.log();
}
