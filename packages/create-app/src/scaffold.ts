import { cp, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type ScaffoldOptions = {
  /** Target directory (absolute or relative). Must not already exist. */
  targetDir: string;
  /** Name written into the scaffolded package.json. Defaults to the basename of targetDir. */
  projectName?: string;
  /** Override template path. Defaults to the template bundled with this package. */
  templateDir?: string;
};

export type ScaffoldResult = {
  targetDir: string;
  projectName: string;
};

export class ScaffoldError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScaffoldError";
  }
}

export async function scaffold(options: ScaffoldOptions): Promise<ScaffoldResult> {
  const targetDir = resolve(options.targetDir);
  if (existsSync(targetDir)) {
    throw new ScaffoldError(
      `Target directory already exists: ${targetDir}`,
    );
  }

  const templateDir = options.templateDir ?? defaultTemplateDir();
  if (!existsSync(templateDir) || !statSync(templateDir).isDirectory()) {
    throw new ScaffoldError(
      `Template directory not found: ${templateDir}`,
    );
  }

  const projectName =
    options.projectName ?? targetDir.split("/").filter(Boolean).pop() ?? "my-app";
  if (!isValidProjectName(projectName)) {
    throw new ScaffoldError(
      `Invalid project name "${projectName}". Use lowercase, digits, hyphens, underscores; must start with a letter.`,
    );
  }

  await cp(templateDir, targetDir, { recursive: true });

  // `npm pack` drops .gitignore. We ship it as _gitignore in the template so
  // publish keeps it; rename on copy.
  const dotted = resolve(targetDir, "_gitignore");
  if (existsSync(dotted)) {
    await rename(dotted, resolve(targetDir, ".gitignore"));
  }

  // Rewrite package.json with the real project name.
  const pkgPath = resolve(targetDir, "package.json");
  const pkgRaw = await readFile(pkgPath, "utf8");
  const pkg = JSON.parse(pkgRaw) as { name: string };
  pkg.name = projectName;
  await writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");

  // Sanity check: the template should have produced at least these files.
  const required = [
    "app/layout.tsx",
    "app/page.tsx",
    "app/api/notifykit/[...route]/route.ts",
    "lib/notifykit.ts",
    "package.json",
    "tsconfig.json",
  ];
  for (const file of required) {
    if (!existsSync(resolve(targetDir, file))) {
      throw new ScaffoldError(
        `Scaffold is missing an expected file: ${file}. Template may be corrupt.`,
      );
    }
  }

  return { targetDir, projectName };
}

export function defaultTemplateDir(): string {
  // Resolve relative to this file in both source (src/) and compiled (dist/) runs.
  const here = fileURLToPath(import.meta.url);
  const fromSrc = resolve(here, "../../template");
  if (existsSync(fromSrc)) return fromSrc;
  const fromDist = resolve(here, "../../../template");
  return fromDist;
}

export async function listScaffoldedFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string, prefix: string) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const next = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await walk(resolve(dir, entry.name), next);
      } else {
        out.push(next);
      }
    }
  }
  await walk(root, "");
  return out.sort();
}

function isValidProjectName(name: string): boolean {
  return /^[a-z][a-z0-9_-]*$/.test(name);
}
