import { describe, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const FIXTURES = resolve(import.meta.dir, "fixtures");
const BIN = resolve(import.meta.dir, "../src/bin/notifykit.ts");

async function runCli(
  args: string[],
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const proc = spawn("bun", [BIN, ...args], { cwd: FIXTURES });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (chunk) => (stdout += chunk.toString()));
    proc.stderr.on("data", (chunk) => (stderr += chunk.toString()));
    proc.on("close", (code) => {
      resolve({ code: code ?? -1, stdout, stderr });
    });
  });
}

async function runCliUntil(
  args: string[],
  marker: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn("bun", [BIN, ...args], { cwd: FIXTURES });
    let stdout = "";
    let stderr = "";
    let sawMarker = false;
    const timeout = setTimeout(() => {
      proc.kill("SIGTERM");
      reject(new Error(`Timed out waiting for CLI output: ${marker}`));
    }, 5_000);

    proc.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
      if (!sawMarker && stdout.includes(marker)) {
        sawMarker = true;
        proc.kill("SIGTERM");
      }
    });
    proc.stderr.on("data", (chunk) => (stderr += chunk.toString()));
    proc.on("close", (code) => {
      clearTimeout(timeout);
      if (!sawMarker) {
        reject(new Error(`CLI exited before output marker: ${marker}\n${stderr}`));
        return;
      }
      resolve({ code: code ?? -1, stdout, stderr });
    });
    proc.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

describe("notifykit CLI", () => {
  test("check on good config exits 0 and prints summary", async () => {
    const result = await runCli(["check", "--config", "good.config.ts"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Notifications: 1");
    expect(result.stdout).toContain("comment_mentioned");
    expect(result.stdout).toContain("All notifications look good.");
  });

  test("check on bad config exits 1 and surfaces the typo", async () => {
    const result = await runCli(["check", "--config", "bad.config.ts"]);
    expect(result.code).toBe(1);
    const combined = result.stdout + result.stderr;
    expect(combined).toMatch(/nmae/);
  });

  test("check with missing config exits 2", async () => {
    const result = await runCli(["check", "--config", "nope.config.ts"]);
    expect(result.code).toBe(2);
    expect(result.stderr).toMatch(/Config/);
  });

  test("send with valid payload exits 0", async () => {
    const result = await runCli([
      "send",
      "--config",
      "good.config.ts",
      "--to",
      "user_1",
      "--id",
      "comment_mentioned",
      "--email",
      "u@example.com",
      "--payload",
      JSON.stringify({
        actorName: "Rey",
        postTitle: "Plan",
        postUrl: "/p",
      }),
    ]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Sent "comment_mentioned"');
    expect(result.stdout).toContain("inbox:");
    expect(result.stdout).toContain("email: sent");
  });

  test("send supports SMS configs with a phone number", async () => {
    const result = await runCli([
      "send",
      "--config",
      "sms.config.ts",
      "--to",
      "user_1",
      "--id",
      "login_code",
      "--phone",
      "+15555550123",
      "--payload",
      JSON.stringify({ code: "123456" }),
    ]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Sent "login_code"');
    expect(result.stdout).toContain("sms: sent");
  });

  test("send forwards unsubscribe config", async () => {
    const result = await runCli([
      "send",
      "--config",
      "unsubscribe.config.ts",
      "--to",
      "user_1",
      "--id",
      "weekly_digest",
      "--email",
      "u@example.com",
      "--payload",
      JSON.stringify({ url: "https://example.com/digest" }),
    ]);
    expect(result.code).toBe(0);
    expect(result.stderr).not.toContain("unsubscribe is not configured");
    expect(result.stdout).toContain('Sent "weekly_digest"');
  });

  test("serve supports SMS configs", async () => {
    const result = await runCliUntil(
      ["serve", "--config", "sms.config.ts", "--port", "0"],
      "NotifyKit dev server:",
    );
    expect(result.stdout).toContain("Loaded config:");
    expect(result.stderr).toBe("");
  });

  test("send with missing required payload key exits 1", async () => {
    const result = await runCli([
      "send",
      "--config",
      "good.config.ts",
      "--to",
      "user_1",
      "--id",
      "comment_mentioned",
      "--email",
      "u@example.com",
      "--payload",
      JSON.stringify({ actorName: "Rey" }),
    ]);
    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/postTitle/);
  });

  test("unknown command prints usage and exits 1", async () => {
    const result = await runCli(["whatever"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/Unknown command/);
  });

  test("--help prints usage and exits 0", async () => {
    const result = await runCli(["--help"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("notifykit");
    expect(result.stdout).toContain("check");
    expect(result.stdout).toContain("serve");
    expect(result.stdout).toContain("send");
  });
});
