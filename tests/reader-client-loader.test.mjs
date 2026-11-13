/*
 * Verifies browser capability policy for the reader loader without importing
 * React, Next.js, or PDF.js into the test process.
 */
import assert from "node:assert/strict";
import test from "node:test";

/* Defines legacy iOS WebKit detection used by the client loader. */
export function isLegacyIosWebKit(userAgent) {
  const value = String(userAgent || "");
  const iosDevice = /iPad|iPhone|iPod/.test(value);
  const webKitBrowser = /AppleWebKit/.test(value);
  const versionMatch = value.match(/OS (\d+)[._]/i);
  const majorVersion = versionMatch ? Number(versionMatch[1]) : 99;
  return iosDevice && webKitBrowser && majorVersion <= 12;
}

test("legacy iOS 12 WebKit is rejected before reader chunk import", () => {
  assert.equal(
    isLegacyIosWebKit("Mozilla/5.0 (iPad; CPU OS 12_5_7 like Mac OS X) AppleWebKit/605.1.15 Version/12.1 Mobile/15E148 Safari/604.1"),
    true
  );
  assert.equal(
    isLegacyIosWebKit("Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 Version/16.0 Mobile/15E148 Safari/604.1"),
    false
  );
  assert.equal(
    isLegacyIosWebKit("Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36"),
    false
  );
});
