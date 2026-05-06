import { parseArgs } from "node:util";
import { scaffold, ScaffoldError } from "./scaffold.js";

const USAGE = `
create-notifykit-app — scaffold a Next.js app wired up with NotifyKit.

Usage:
  create-notifykit-app <directory> [--name <package-name>]

Example:
  create-notifykit-app my-app
  create-notifykit-app apps/web --name acme-web
`.trim();

export async function run(argv: string[]): Promise<number> {
  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h") {
    console.log(USAGE);
    return 0;
  }

  let values: { name?: string };
  let positionals: string[];
  try {
    const parsed = parseArgs({
      args: argv,
      options: { name: { type: "string" } },
      allowPositionals: true,
      strict: true,
    });
    values = parsed.values;
    positionals = parsed.positionals;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Error: ${message}`);
    console.error(USAGE);
    return 1;
  }

  const targetDir = positionals[0];
  if (!targetDir) {
    console.error("Error: missing <directory> argument.");
    console.error(USAGE);
    return 1;
  }

  try {
    const result = await scaffold({
      targetDir,
      projectName: values.name,
    });
    console.log(`\n✔ Created ${result.projectName} at ${result.targetDir}\n`);
    console.log("Next steps:");
    console.log(`  cd ${targetDir}`);
    console.log("  cp .env.example .env.local");
    console.log(
      `  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`,
    );
    console.log("  # paste into .env.local as NOTIFYKIT_SECRET");
    console.log("  npm install");
    console.log("  npm run dev\n");
    return 0;
  } catch (err) {
    if (err instanceof ScaffoldError) {
      console.error(`Error: ${err.message}`);
      return 2;
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Error: ${message}`);
    return 1;
  }
}
