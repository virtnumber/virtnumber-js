// dist/cjs is CommonJS while the package itself is "type": "module":
// a nested package.json tells Node how to load that folder.
import { writeFileSync } from "node:fs";

writeFileSync("dist/cjs/package.json", JSON.stringify({ type: "commonjs" }) + "\n");
