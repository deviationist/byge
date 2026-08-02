// Derive the real radar coverage mask from the live grid.
//   bunx tsx scripts/coverage.mts [stride]
import { fetchCoverageMask, observedFraction, serialiseMask } from "../lib/coverage.js";
import { gzipSync } from "node:zlib";

const stride = Number(process.argv[2] ?? 10);
const t = Date.now();
const mask = await fetchCoverageMask(stride);
const ms = Date.now() - t;
const json = serialiseMask(mask);

console.log(`stride ${mask.stride} km -> ${mask.width}x${mask.height} cells, ${ms} ms`);
console.log(`radar sees ${(observedFraction(mask) * 100).toFixed(1)}% of the domain`);
console.log(`serialised ${(json.length / 1024).toFixed(1)} KB, gzipped ${(gzipSync(json).length / 1024).toFixed(1)} KB`);
console.log(`from analysis ${mask.stamp}`);
