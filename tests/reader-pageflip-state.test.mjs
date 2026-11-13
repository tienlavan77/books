/*
 * Verifies the pageflip completion guard used for WebKit and desktop keyboard
 * navigation without importing React or requiring a browser runtime.
 */
import assert from "node:assert/strict";
import test from "node:test";

/* Defines the stable-state completion contract for the reader. */
export function shouldCompleteStableState({ state, hasActiveTransition }) {
  return state === "read" && hasActiveTransition;
}

test("stable read state completes only an active transition", () => {
  assert.equal(shouldCompleteStableState({ state: "read", hasActiveTransition: true }), true);
  assert.equal(shouldCompleteStableState({ state: "read", hasActiveTransition: false }), false);
  assert.equal(shouldCompleteStableState({ state: "flipping", hasActiveTransition: true }), false);
});
