import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { scaffold, ScaffoldError } from "../src/scaffold.js";

describe("scaffold()", () => {
  let workDir: string;

  beforeEach(async () => {
    workDir = await mkdtemp(resolve(tmpdir(), "notifykit-scaffold-"));
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  test("creates the expected files in the target directory", async () => {
    const target = resolve(workDir, "app1");
    const result = await scaffold({ targetDir: target });

    expect(result.projectName).toBe("app1");
    expect(result.targetDir).toBe(target);

    const expected = [
      "package.json",
      "tsconfig.json",
      "next.config.ts",
      "README.md",
      ".gitignore",
      ".env.example",
      "lib/notifykit.ts",
      "lib/session.ts",
      "app/layout.tsx",
      "app/page.tsx",
      "app/actions.ts",
      "app/api/notifykit/[...route]/route.ts",
      "app/settings/notifications/page.tsx",
      "app/settings/notifications/preferences-view.tsx",
      "app/_components/inbox-view.tsx",
    ];
    for (const rel of expected) {
      expect(existsSync(resolve(target, rel))).toBe(true);
    }
  });

  test("rewrites package.json with the supplied project name", async () => {
    const target = resolve(workDir, "place");
    await scaffold({ targetDir: target, projectName: "acme-web" });
    const pkg = JSON.parse(
      await readFile(resolve(target, "package.json"), "utf8"),
    );
    expect(pkg.name).toBe("acme-web");
    expect(pkg.scripts.dev).toBe("next dev");
    expect(pkg.dependencies["@notifykitjs/core"]).toBeDefined();
    expect(pkg.dependencies["@notifykitjs/react"]).toBeDefined();
  });

  test("uses directory basename as default project name", async () => {
    const target = resolve(workDir, "my-web-app");
    const result = await scaffold({ targetDir: target });
    expect(result.projectName).toBe("my-web-app");
    const pkg = JSON.parse(
      await readFile(resolve(target, "package.json"), "utf8"),
    );
    expect(pkg.name).toBe("my-web-app");
  });

  test("refuses to clobber an existing directory", async () => {
    const target = resolve(workDir, "existing");
    await scaffold({ targetDir: target });
    await expect(scaffold({ targetDir: target })).rejects.toThrow(
      ScaffoldError,
    );
  });

  test("rejects invalid project names", async () => {
    await expect(
      scaffold({
        targetDir: resolve(workDir, "x"),
        projectName: "Bad Name",
      }),
    ).rejects.toThrow(/Invalid project name/);
  });

  test("does not leave the target directory when template validation fails", async () => {
    const template = resolve(workDir, "bad-template");
    await mkdir(template, { recursive: true });
    await writeFile(resolve(template, "package.json"), `{"name":"bad"}\n`);

    const target = resolve(workDir, "partial-app");
    await expect(
      scaffold({ targetDir: target, templateDir: template }),
    ).rejects.toThrow(/missing an expected file/);

    expect(existsSync(target)).toBe(false);
  });

  test("route.ts mounts the NotifyKit handler", async () => {
    const target = resolve(workDir, "routes");
    await scaffold({ targetDir: target });
    const route = await readFile(
      resolve(target, "app/api/notifykit/[...route]/route.ts"),
      "utf8",
    );
    expect(route).toMatch(/createHandler/);
    expect(route).toMatch(/export const GET/);
    expect(route).toMatch(/export const POST/);
    expect(route).toMatch(/export const OPTIONS/);
  });

  test("lib/notifykit.ts defines the demo notification", async () => {
    const target = resolve(workDir, "lib-check");
    await scaffold({ targetDir: target });
    const content = await readFile(
      resolve(target, "lib/notifykit.ts"),
      "utf8",
    );
    expect(content).toMatch(/comment_mentioned/);
    expect(content).toMatch(/createNotifyKit/);
    expect(content).toMatch(/_unsubscribeUrl/);
  });
});
