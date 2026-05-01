#!/usr/bin/env bun
import { run } from "../cli.js";
const exitCode = await run(process.argv.slice(2));
process.exit(exitCode);
//# sourceMappingURL=create.js.map