/*
 * Feasibility prototype for the reader transition, physical-page cache, spread mapping,
 * fullscreen fallback, and page-local decode recovery contracts from docs/new-flip.md.
 * This file intentionally stays outside the production import graph.
 */
import assert from "node:assert/strict";
import test from "node:test";

// Models one sequential transition so only the matching completion can commit a page.
export function createTransitionController({ onCommit = () => {}, onCancel = () => {}, maxQueue = 1 } = {}) {
  let nextId = 0;
  let active = null;
  let queued = null;

  // Defines start function behavior for reader-feasibility-prototype.test.mjs.
  const start = (input, status = "started") => {
    const transition = { ...input, transitionId: ++nextId };
    active = transition;
    return { status, transitionId: transition.transitionId };
  };

  return {
    // Defines getSnapshot method behavior for reader-feasibility-prototype.test.mjs.
    getSnapshot() {
      return {
        state: active ? "animating" : "idle",
        activeTransitionId: active?.transitionId || null,
        queued: Boolean(queued),
      };
    },
    // Defines begin method behavior for reader-feasibility-prototype.test.mjs.
    begin(input) {
      if (!active) return start(input);
      if (maxQueue < 1 || queued) return { status: "rejected", transitionId: null };
      queued = input;
      return { status: "queued", transitionId: null };
    },
    // Defines commit method behavior for reader-feasibility-prototype.test.mjs.
    commit(transitionId) {
      if (!active || active.transitionId !== transitionId) return false;
      const committed = active;
      active = null;
      onCommit(committed);
      if (queued) {
        const next = queued;
        queued = null;
        start(next);
      }
      return true;
    },
    // Defines cancel method behavior for reader-feasibility-prototype.test.mjs.
    cancel(transitionId, reason = "cancelled") {
      if (!active || active.transitionId !== transitionId) return false;
      const cancelled = active;
      active = null;
      onCancel({ ...cancelled, reason });
      queued = null;
      return true;
    },
  };
}

// Models a bounded rendered-page cache; resources expose cleanup() like a render task/canvas owner.
export function createPhysicalPageCache({ priorLimit = 10, aheadLimit = 10 } = {}) {
  const entries = new Map();
  // Defines cleanupEntry function behavior for reader-feasibility-prototype.test.mjs.
  const cleanupEntry = (entry) => {
    if (entry.status !== "evicted" && typeof entry.resource?.cleanup === "function") {
      entry.resource.cleanup();
    }
    entry.status = "evicted";
    entry.resource = null;
  };

  return {
    // Defines computeWindow method behavior for reader-feasibility-prototype.test.mjs.
    computeWindow(currentPage, totalPages, isSpread = false) {
      const total = Math.max(1, Math.trunc(Number(totalPages) || 1));
      const current = Math.min(total, Math.max(1, Math.trunc(Number(currentPage) || 1)));
      const activeEnd = isSpread ? Math.min(total, current + 1) : current;
      const start = Math.max(1, current - priorLimit);
      const end = Math.min(total, activeEnd + aheadLimit);
      return new Set(Array.from({ length: end - start + 1 }, (_, index) => start + index));
    },
    // Defines set method behavior for reader-feasibility-prototype.test.mjs.
    set(page, status, resource = null, metadata = {}) {
      entries.set(page, { page, status, resource, metadata });
    },
    // Defines get method behavior for reader-feasibility-prototype.test.mjs.
    get(page) {
      return entries.get(page) || null;
    },
    // Defines evictOutside method behavior for reader-feasibility-prototype.test.mjs.
    evictOutside(window, protectedPages = []) {
      const protectedSet = new Set(protectedPages);
      for (const [page, entry] of entries) {
        if (!window.has(page) && !protectedSet.has(page)) cleanupEntry(entry);
      }
    },
    // Defines dispose method behavior for reader-feasibility-prototype.test.mjs.
    dispose() {
      for (const entry of entries.values()) cleanupEntry(entry);
    },
    entries,
  };
}

// Defines the prototype's explicit physical-page mapping: page 1 is a cover, then even/odd spreads.
export function mapSpread(anchorPage, totalPages, mode = "spread") {
  const total = Math.max(1, Math.trunc(Number(totalPages) || 1));
  const page = Math.min(total, Math.max(1, Math.trunc(Number(anchorPage) || 1)));
  if (mode === "single") return [page];
  if (page === 1) return [1];
  const left = 2 + Math.floor((page - 2) / 2) * 2;
  return left + 1 <= total ? [left, left + 1] : [left];
}

// Models native fullscreen success/rejection and the documented app-level fallback.
export function createFullscreenController({ requestNative, exitNative } = {}) {
  let mode = "off";
  return {
    getMode: () => mode,
    // Defines enter method behavior for reader-feasibility-prototype.test.mjs.
    async enter() {
      if (typeof requestNative === "function") {
        try {
          await requestNative();
          mode = "native";
          return mode;
        } catch {
          // Native rejection is an expected fallback path.
        }
      }
      mode = "app";
      return mode;
    },
    // Defines exit method behavior for reader-feasibility-prototype.test.mjs.
    async exit() {
      if (mode === "native" && typeof exitNative === "function") await exitNative();
      mode = "off";
      return mode;
    },
  };
}

// Keeps decode failure local to one physical page and bounds retry attempts.
export function createDecodeRecovery({ maxRetries = 2 } = {}) {
  const pages = new Map();
  return {
    // Defines fail method behavior for reader-feasibility-prototype.test.mjs.
    fail(page, error) {
      const previous = pages.get(page) || { attempts: 0 };
      const attempts = previous.attempts + 1;
      pages.set(page, { status: "failed", attempts, error: String(error?.message || error) });
      return { status: "failed", attempts, retryable: attempts <= maxRetries };
    },
    // Defines retry method behavior for reader-feasibility-prototype.test.mjs.
    retry(page) {
      const entry = pages.get(page);
      if (!entry || entry.attempts > maxRetries) return false;
      pages.set(page, { ...entry, status: "loading" });
      return true;
    },
    // Defines ready method behavior for reader-feasibility-prototype.test.mjs.
    ready(page) {
      pages.set(page, { status: "ready", attempts: pages.get(page)?.attempts || 0 });
    },
    // Defines get method behavior for reader-feasibility-prototype.test.mjs.
    get(page) {
      return pages.get(page) || { status: "idle", attempts: 0 };
    },
  };
}

test("transition controller commits only the matching transition and bounds queueing", () => {
  const committed = [];
  const cancelled = [];
  const controller = createTransitionController({
    onCommit: (value) => committed.push(value.toPage),
    onCancel: (value) => cancelled.push(value.reason),
  });
  const first = controller.begin({ fromPage: 1, toPage: 2 });
  assert.equal(controller.begin({ fromPage: 1, toPage: 3 }).status, "queued");
  assert.equal(controller.commit(first.transitionId + 1), false);
  assert.equal(controller.commit(first.transitionId), true);
  assert.equal(controller.getSnapshot().state, "animating");
  assert.equal(controller.cancel(2, "drag threshold"), true);
  assert.deepEqual(committed, [2]);
  assert.deepEqual(cancelled, ["drag threshold"]);
});

test("physical-page cache keeps a spread window and cleans evicted resources", () => {
  const cleaned = [];
  const cache = createPhysicalPageCache({ priorLimit: 2, aheadLimit: 2 });
  const window = cache.computeWindow(6, 20, true);
  assert.deepEqual([...window], [4, 5, 6, 7, 8, 9]);
  cache.set(3, "ready", { cleanup: () => cleaned.push(3) }, { scale: 1 });
  cache.set(6, "ready", { cleanup: () => cleaned.push(6) }, { scale: 1 });
  cache.evictOutside(window, [6]);
  assert.equal(cache.get(3).status, "evicted");
  assert.deepEqual(cleaned, [3]);
  assert.equal(cache.get(6).status, "ready");
  cache.dispose();
  assert.deepEqual(cleaned, [3, 6]);
});

test("spread mapping keeps cover separate and uses physical-page anchors", () => {
  assert.deepEqual(mapSpread(1, 10), [1]);
  assert.deepEqual(mapSpread(2, 10), [2, 3]);
  assert.deepEqual(mapSpread(5, 10), [4, 5]);
  assert.deepEqual(mapSpread(10, 10), [10]);
  assert.deepEqual(mapSpread(5, 10, "single"), [5]);
});

test("fullscreen controller falls back after native rejection", async () => {
  const fallback = createFullscreenController({ requestNative: async () => { throw new Error("NotAllowedError"); } });
  assert.equal(await fallback.enter(), "app");
  assert.equal(fallback.getMode(), "app");
  assert.equal(await fallback.exit(), "off");

  const native = createFullscreenController({ requestNative: async () => {}, exitNative: async () => {} });
  assert.equal(await native.enter(), "native");
  assert.equal(await native.exit(), "off");
});

test("decode recovery isolates JBIG2-like failures and bounds retries", () => {
  const recovery = createDecodeRecovery({ maxRetries: 2 });
  assert.equal(recovery.fail(4, new Error("JBig2 failed to initialize")).retryable, true);
  assert.equal(recovery.get(4).status, "failed");
  assert.equal(recovery.retry(4), true);
  recovery.ready(4);
  assert.equal(recovery.get(4).status, "ready");
  assert.equal(recovery.fail(7, new Error("Dependent image isn't ready yet")).retryable, true);
  assert.equal(recovery.get(4).status, "ready");
});
