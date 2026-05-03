import { describe, expect, test } from "bun:test";
import { assertSafeWebhookUrl, isSafeUrl, renderTemplate } from "../src/utils.js";

describe("assertSafeWebhookUrl", () => {
  test("accepts valid https URL", async () => {
    const result = await assertSafeWebhookUrl("https://hooks.slack.com/services/abc");
    expect(result.pinnedUrl).toBeTruthy();
    expect(result.hostHeader).toContain("hooks.slack.com");
  });

  test("rejects non-http protocols", async () => {
    await expect(assertSafeWebhookUrl("ftp://example.com")).rejects.toThrow(/http or https/);
    await expect(assertSafeWebhookUrl("javascript:alert(1)")).rejects.toThrow();
    await expect(assertSafeWebhookUrl("file:///etc/passwd")).rejects.toThrow(/http or https/);
  });

  test("rejects localhost", async () => {
    await expect(assertSafeWebhookUrl("http://localhost/hook")).rejects.toThrow(/blocked/);
    await expect(assertSafeWebhookUrl("http://localhost:3000/hook")).rejects.toThrow(/blocked/);
  });

  test("rejects loopback IPs", async () => {
    await expect(assertSafeWebhookUrl("http://127.0.0.1/hook")).rejects.toThrow(/blocked/);
    await expect(assertSafeWebhookUrl("http://127.0.0.255/hook")).rejects.toThrow(/blocked/);
  });

  test("rejects private RFC 1918 addresses", async () => {
    await expect(assertSafeWebhookUrl("http://10.0.0.1/hook")).rejects.toThrow(/blocked/);
    await expect(assertSafeWebhookUrl("http://172.16.0.1/hook")).rejects.toThrow(/blocked/);
    await expect(assertSafeWebhookUrl("http://172.31.255.255/hook")).rejects.toThrow(/blocked/);
    await expect(assertSafeWebhookUrl("http://192.168.1.1/hook")).rejects.toThrow(/blocked/);
  });

  test("rejects link-local / metadata IP range", async () => {
    await expect(assertSafeWebhookUrl("http://169.254.169.254/latest/meta-data/")).rejects.toThrow(/blocked/);
  });

  test("rejects IPv6 loopback", async () => {
    await expect(assertSafeWebhookUrl("http://[::1]/hook")).rejects.toThrow(/blocked/);
  });

  test("rejects IPv4-mapped IPv6", async () => {
    await expect(assertSafeWebhookUrl("http://[::ffff:127.0.0.1]/hook")).rejects.toThrow(/blocked/);
    await expect(assertSafeWebhookUrl("http://[::ffff:10.0.0.1]/hook")).rejects.toThrow(/blocked/);
  });

  test("rejects IPv6 link-local", async () => {
    await expect(assertSafeWebhookUrl("http://[fe80::1]/hook")).rejects.toThrow(/blocked/);
  });

  test("rejects IPv6 unique local", async () => {
    await expect(assertSafeWebhookUrl("http://[fc00::1]/hook")).rejects.toThrow(/blocked/);
    await expect(assertSafeWebhookUrl("http://[fd12::1]/hook")).rejects.toThrow(/blocked/);
  });

  test("rejects 0.0.0.0", async () => {
    await expect(assertSafeWebhookUrl("http://0.0.0.0/hook")).rejects.toThrow(/blocked/);
  });

  test("rejects numeric/octal/hex IP encodings", async () => {
    await expect(assertSafeWebhookUrl("http://0x7f000001/hook")).rejects.toThrow(/blocked/);
    await expect(assertSafeWebhookUrl("http://017700000001/hook")).rejects.toThrow(/blocked/);
    await expect(assertSafeWebhookUrl("http://2130706433/hook")).rejects.toThrow(/blocked/);
  });

  test("rejects .internal and .local hostnames", async () => {
    await expect(assertSafeWebhookUrl("http://metadata.google.internal/hook")).rejects.toThrow(/blocked/);
    await expect(assertSafeWebhookUrl("http://anything.internal/hook")).rejects.toThrow(/blocked/);
    await expect(assertSafeWebhookUrl("http://printer.local/hook")).rejects.toThrow(/blocked/);
  });

  test("rejects invalid URLs", async () => {
    await expect(assertSafeWebhookUrl("not a url")).rejects.toThrow(/Invalid/);
  });
});

describe("isSafeUrl", () => {
  test("accepts http and https", () => {
    expect(isSafeUrl("https://example.com")).toBe(true);
    expect(isSafeUrl("http://example.com/path")).toBe(true);
  });

  test("accepts mailto", () => {
    expect(isSafeUrl("mailto:user@example.com")).toBe(true);
  });

  test("accepts relative paths", () => {
    expect(isSafeUrl("/dashboard")).toBe(true);
    expect(isSafeUrl("/path/to/thing")).toBe(true);
  });

  test("rejects javascript:", () => {
    expect(isSafeUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeUrl("JAVASCRIPT:alert(1)")).toBe(false);
  });

  test("rejects data:", () => {
    expect(isSafeUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
  });

  test("rejects vbscript:", () => {
    expect(isSafeUrl("vbscript:MsgBox(1)")).toBe(false);
  });

  test("rejects protocol-relative double slash", () => {
    expect(isSafeUrl("//evil.com")).toBe(false);
  });
});

describe("renderTemplate XSS prevention", () => {
  test("escapes HTML entities by default", () => {
    const result = renderTemplate("Hello {{name}}", { name: '<script>alert("xss")</script>' });
    expect(result).not.toContain("<script>");
    expect(result).toContain("&lt;script&gt;");
    expect(result).toContain("&quot;");
  });

  test("escapes ampersands", () => {
    const result = renderTemplate("{{text}}", { text: "a & b" });
    expect(result).toBe("a &amp; b");
  });

  test("escapes quotes", () => {
    const result = renderTemplate("{{text}}", { text: 'He said "hello" & \'goodbye\'' });
    expect(result).toContain("&quot;");
    expect(result).toContain("&#39;");
  });

  test("does not double-escape", () => {
    const result = renderTemplate("{{text}}", { text: "&amp;" });
    expect(result).toBe("&amp;amp;");
  });

  test("encodeUri mode encodes special characters for URLs", () => {
    const result = renderTemplate("https://example.com/{{path}}", { path: "a b&c" }, { encodeUri: true });
    expect(result).toContain("a%20b%26c");
  });

  test("escapeHtml false passes through raw values", () => {
    const result = renderTemplate("{{html}}", { html: "<b>bold</b>" }, { escapeHtml: false });
    expect(result).toBe("<b>bold</b>");
  });
});
