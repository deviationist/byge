// Dev CLI: run the TypeScript data layer against live MET data.
//   bunx tsx scripts/verdict.mts [lat lon radiusKm]
import { describe as desc, verdict } from "../lib/forecast.js";

const args = process.argv.slice(2);
const pts: [number, number, number, string][] = args.length
  ? [[Number(args[0]), Number(args[1]), Number(args[2] ?? 3), "requested"]]
  : [
      [59.911, 10.75, 3, "Oslo r=3"],
      [63.6, 9.9, 3, "Trondelag r=3"],
      [68.136, 18.079, 3, "Narvik r=3"],
      [68.136, 18.079, 20, "Narvik r=20 (edge test)"],
      [62.0, 2.0, 3, "North Sea (blind)"],
    ];

for (const [lat, lon, r, name] of pts) {
  const v = await verdict(lat, lon, { radiusKm: r });
  console.log(`### ${name}`);
  console.log(desc(v));
  if (v.frames.length) {
    console.log(
      `   centre=${v.centreRate.toFixed(2)} mm/h  edgeOnly=${v.edgeOnly}  nearest=${v.nearestKm === null ? "—" : `${v.nearestKm.toFixed(1)} km`}  observed=${(v.observed * 100).toFixed(0)}%`,
    );
  }
  console.log();
}
