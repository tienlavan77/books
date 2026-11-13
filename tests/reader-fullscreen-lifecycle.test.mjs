/* Exercises the production flipbook lifecycle with pageflip-shaped events. These
 * regression tests cover remount progress, live callbacks and navigation unlock;
 * they do not replace native fullscreen and touch testing on physical devices. */
import test from "node:test";
import assert from "node:assert/strict";
import { createReaderFlipbookLifecycle } from "../lib/reader-flipbook-lifecycle.js";
import { createReaderTransitionController } from "../lib/reader-transition.js";

// Creates a reader/controller pair whose restored instance emits synchronous flips.
function createReader(page = 9) {
  let currentPage = page;
  const controller = createReaderTransitionController({
    maxQueue: 0,
    onCommit: ({ toPage }) => { currentPage = toPage; },
  });
  const lifecycle = createReaderFlipbookLifecycle({
    startPage: page,
    cancel: (reason) => controller.cancel(reason),
    onFlip: (event) => {
      const next = event.data + 1;
      if (controller.getSnapshot().activeTransitionId) controller.complete(next);
      else currentPage = next;
    },
    onState: (event) => {
      if (event.data === "read") controller.completeActive();
    },
  });
  return { lifecycle, controller, page: () => currentPage };
}

// Verifies loading and restoration never publish pageflip's temporary first page.
test("fullscreen remount restores the current physical page without committing init flips", () => {
  const reader = createReader();
  reader.lifecycle.flip({ data: 0 });
  // Defines turnToPage method behavior for reader-fullscreen-lifecycle.test.mjs.
  reader.lifecycle.init({ turnToPage(index) {
    assert.equal(index, 8);
    reader.lifecycle.flip({ data: 0 });
    reader.lifecycle.flip({ data: 8 });
  } });
  assert.equal(reader.page(), 9);
  reader.lifecycle.flip({ data: 10 });
  assert.equal(reader.page(), 11);
});

// Covers desktop spread and mobile single-page navigation after layout replacement.
for (const step of [1, 2]) {
  test(`fullscreen replacement cancels old animation and permits both directions, step ${step}`, () => {
    const reader = createReader();
    // Defines invoke method behavior for reader-fullscreen-lifecycle.test.mjs.
    reader.controller.begin({ fromPage: 9, toPage: 9 + step, invoke() {} });
    // Defines turnToPage method behavior for reader-fullscreen-lifecycle.test.mjs.
    reader.lifecycle.init({ turnToPage() {} });
    assert.equal(reader.controller.getSnapshot().state, "idle");
    for (const target of [9 + step, 9]) {
      assert.equal(reader.controller.begin({
        fromPage: reader.page(), toPage: target,
        // Defines invoke method behavior for reader-fullscreen-lifecycle.test.mjs.
        invoke() { reader.lifecycle.flip({ data: target - 1 }); },
      }).status, "started");
      assert.equal(reader.page(), target);
      assert.equal(reader.controller.getSnapshot().state, "idle");
    }
  });
}

// Ensures listeners captured by react-pageflip call the latest React handlers.
test("retained event delegates use updated callbacks", () => {
  const reader = createReader();
  // Defines turnToPage method behavior for reader-fullscreen-lifecycle.test.mjs.
  reader.lifecycle.init({ turnToPage() {} });
  const retainedFlip = reader.lifecycle.flip;
  const retainedState = reader.lifecycle.state;
  const events = [];
  reader.lifecycle.update({
    onFlip: (event) => events.push(["flip", event.data]),
    onState: (event) => events.push(["state", event.data]),
  });
  retainedFlip({ data: 12 });
  retainedState({ data: "read" });
  assert.deepEqual(events, [["flip", 12], ["state", "read"]]);
});

// Rejects events from an obsolete layout during repeated fullscreen/resize changes.
test("disposed layout cannot reset progress or complete a new transition", () => {
  const reader = createReader();
  // Defines turnToPage method behavior for reader-fullscreen-lifecycle.test.mjs.
  reader.lifecycle.init({ turnToPage() {} });
  reader.lifecycle.dispose();
  // Defines invoke method behavior for reader-fullscreen-lifecycle.test.mjs.
  reader.controller.begin({ fromPage: 9, toPage: 11, invoke() {} });
  reader.lifecycle.flip({ data: 0 });
  reader.lifecycle.state({ data: "read" });
  // Defines turnToPage method behavior for reader-fullscreen-lifecycle.test.mjs.
  reader.lifecycle.init({ turnToPage() { assert.fail("disposed layout restored"); } });
  assert.equal(reader.page(), 9);
  assert.equal(reader.controller.getSnapshot().state, "animating");
});

// React development mode replays effects; the live mount must remain interactive.
test("effect cleanup replay reactivates an initialized layout", () => {
  const reader = createReader();
  // Defines turnToPage method behavior for reader-fullscreen-lifecycle.test.mjs.
  reader.lifecycle.init({ turnToPage() {} });
  reader.lifecycle.dispose();
  reader.lifecycle.activate();
  reader.lifecycle.flip({ data: 10 });
  assert.equal(reader.page(), 11);
});
