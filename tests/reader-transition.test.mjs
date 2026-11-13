/*
 * Verifies the production reader transition state machine independently from
 * React and react-pageflip, including commit-only progress semantics.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createReaderTransitionController } from "../lib/reader-transition.js";

test("reader transition commits only matching completion", () => {
  const invoked = [];
  const committed = [];
  const cancelled = [];
  const controller = createReaderTransitionController({
    onCommit: (transition) => committed.push(transition.toPage),
    onCancel: (transition) => cancelled.push(transition.reason),
  });

  const first = controller.begin({
    fromPage: 4,
    toPage: 5,
    source: "keyboard",
    invoke: () => invoked.push("next"),
  });
  assert.equal(first.status, "started");
  assert.equal(controller.complete(6), false);
  assert.deepEqual(committed, []);
  assert.equal(controller.complete(5), true);
  assert.deepEqual(invoked, ["next"]);
  assert.deepEqual(committed, [5]);
  assert.deepEqual(cancelled, []);
});

test("reader transition queues one bounded request and commits it later", () => {
  const invoked = [];
  const committed = [];
  const controller = createReaderTransitionController({
    onCommit: ({ toPage }) => committed.push(toPage),
  });

  controller.begin({ fromPage: 1, toPage: 3, invoke: () => invoked.push("spread-next") });
  assert.equal(
    controller.begin({ fromPage: 3, toPage: 1, invoke: () => invoked.push("spread-prev") }).status,
    "queued"
  );
  assert.equal(
    controller.begin({ fromPage: 1, toPage: 3, invoke: () => invoked.push("extra") }).status,
    "rejected"
  );
  assert.equal(controller.complete(3), true);
  assert.equal(controller.complete(1), true);
  assert.deepEqual(invoked, ["spread-next", "spread-prev"]);
  assert.deepEqual(committed, [3, 1]);
});

test("reader transition cancellation drops queued input and does not commit", () => {
  const committed = [];
  const cancelled = [];
  const controller = createReaderTransitionController({
    onCommit: ({ toPage }) => committed.push(toPage),
    onCancel: ({ reason }) => cancelled.push(reason),
  });

  controller.begin({ fromPage: 2, toPage: 3, invoke: () => {} });
  controller.begin({ fromPage: 3, toPage: 4, invoke: () => {} });
  assert.equal(controller.cancel("drag-cancelled"), true);
  assert.equal(controller.complete(3), false);
  assert.deepEqual(committed, []);
  assert.deepEqual(cancelled, ["drag-cancelled"]);
  assert.deepEqual(controller.getSnapshot(), {
    state: "idle",
    activeTransitionId: null,
    targetPage: null,
    queued: false,
  });
});
