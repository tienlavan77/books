/*
 * Verifies the browser-facing feasibility adapter without importing React or
 * production reader code. These tests model react-pageflip completion callbacks.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyDrag,
  createPageFlipTransitionAdapter,
  createRenderedPageResource,
} from "./reader-browser-feasibility.mjs";

test("drag probe distinguishes completed and cancelled gestures", () => {
  assert.equal(classifyDrag({ dx: -90, dy: 15, elapsedMs: 220 }), "next");
  assert.equal(classifyDrag({ dx: 90, dy: 15, elapsedMs: 220 }), "previous");
  assert.equal(classifyDrag({ dx: -40, dy: 5, elapsedMs: 220 }), "cancelled");
  assert.equal(classifyDrag({ dx: -90, dy: 15, elapsedMs: 700 }), "cancelled");
  assert.equal(classifyDrag({ dx: -90, dy: 70, elapsedMs: 220 }), "cancelled");
});

test("pageflip adapter commits only matching completion and bounds queue", () => {
  const calls = [];
  const commits = [];
  const pageFlip = {
    flipNext: () => calls.push("next"),
    flipPrev: () => calls.push("previous"),
    stop: () => calls.push("stop"),
  };
  const adapter = createPageFlipTransitionAdapter({
    pageFlip,
    onCommit: (transition) => commits.push(transition.toPage),
  });

  const first = adapter.begin({ fromPage: 1, toPage: 2, source: "button" });
  assert.equal(first.status, "started");
  assert.equal(adapter.begin({ fromPage: 2, toPage: 3 }).status, "queued");
  assert.equal(adapter.begin({ fromPage: 3, toPage: 4 }).status, "rejected");
  assert.equal(adapter.complete(4), false);
  assert.deepEqual(commits, []);
  assert.equal(adapter.complete(2), true);
  assert.deepEqual(calls, ["next", "next"]);
  assert.deepEqual(commits, [2]);
  assert.equal(adapter.complete(3), true);
  assert.deepEqual(commits, [2, 3]);
});

test("pageflip adapter cancels without commit and stops active animation", () => {
  const calls = [];
  const cancelled = [];
  const adapter = createPageFlipTransitionAdapter({
    pageFlip: {
      flipNext: () => calls.push("next"),
      stop: () => calls.push("stop"),
    },
    onCancel: (transition) => cancelled.push(transition.reason),
  });

  adapter.begin({ fromPage: 4, toPage: 5, source: "swipe" });
  assert.equal(adapter.cancel("drag threshold"), true);
  assert.deepEqual(calls, ["next", "stop"]);
  assert.deepEqual(cancelled, ["drag threshold"]);
  assert.equal(adapter.getSnapshot().state, "idle");
});

test("rendered-page resource disposal aborts work and cleans exactly once", () => {
  let cleanupCount = 0;
  const resource = createRenderedPageResource({ cleanup: () => { cleanupCount += 1; } });
  assert.equal(resource.signal.aborted, false);
  assert.equal(resource.dispose(), true);
  assert.equal(resource.signal.aborted, true);
  assert.equal(resource.disposed, true);
  assert.equal(resource.dispose(), false);
  assert.equal(cleanupCount, 1);
});
