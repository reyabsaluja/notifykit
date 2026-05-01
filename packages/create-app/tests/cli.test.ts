import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const BIN = resolve(import.meta.dir, "../src/bin/create.ts");

async function runCli(
  args: string[],
  cwd: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const proc = spawn("bun", [BIN, ...args], { cwd });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (c) => (stdout += c.toString()));
    proc.stderr.on("data", (c) => (stderr += c.toString()));
    proc.on("close", (code) => resolve({ code: code ?? -1, stdout, stderr }));
  });
}

describe("create-notifykit-app CLI", () => {
  let workDir: string;

  beforeEach(async () => {
    workDir = await mkdtemp(resolve(tmpdir(), "notifykit-cli-"));
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  test("--help prints usage and exits 0", async () => {
    const result = await runCli(["--help"], workDir);
    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/create-notifykit-app/);
    expect(result.stdout).toMatch(/Usage:/);
  });

  test("missing directory arg prints usage and exits 1", async () => {
    const result = await runCli([], workDir);
    expect(result.code).toBe(0); // with no args we show help
    const missing = await runCli(["--name", "foo"], workDir);
    expect(missing.code).toBe(1);
    expect(missing.stderr).toMatch(/missing/i);
  });

  test("scaffolds into target directory, exits 0, prints next steps", async () => {
    const result = await runCli(["my-app"], workDir);
    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/Created my-app/);
    expect(result.stdout).toMatch(/npm install/);
    expect(existsSync(resolve(workDir, "my-app/package.json"))).toBe(true);
    expect(existsSync(resolve(workDir, "my-app/lib/notifykit.ts"))).toBe(true);
  });

  test("--name overrides the package name in package.json", async () => {
    const result = await runCli(["apps/web", "--name", "acme-web"], workDir);
    expect(result.code).toBe(0);
    const pkg = JSON.parse(
      await readFile(resolve(workDir, "apps/web/package.json"), "utf8"),
    );
    expect(pkg.name).toBe("acme-web");
  });

  test("refuses to scaffold over an existing directory", async () => {
    await runCli(["app1"], workDir);
    const second = await runCli(["app1"], workDir);
    expect(second.code).toBe(2);
    expect(second.stderr).toMatch(/already exists/);
  });
});
