/* Guards the reader's centered zoom layout contract. These source-level checks
 * prevent restoring a top-anchored transform; visual browser checks remain needed. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Confirms zoom scales around the middle of the book rather than its upper edge.
test("reader zoom scales uniformly around the book center", () => {
  const source = readFileSync(new URL("../components/PdfFlipReader.js", import.meta.url), "utf8");
  assert.match(source, /transform: `scale\(\$\{zoom\}\)`, transformOrigin: "center center"/);
  assert.doesNotMatch(source, /transformOrigin: "top center"/);
});

// Confirms the reading stage retains both horizontal and vertical book alignment.
test("reader stage centers the book on both axes", () => {
  const css = readFileSync(new URL("../app/reader.css", import.meta.url), "utf8");
  const stage = css.match(/\.reader-stage\s*\{([^}]+)\}/)?.[1];
  assert.ok(stage);
  assert.match(stage, /align-items:\s*center/);
  assert.match(stage, /justify-content:\s*center/);
});
