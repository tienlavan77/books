/*
 * Browser-facing feasibility adapter for the reader transition and rendered-page
 * lifecycle contracts. This module is intentionally kept outside production imports.
 */

/* Defines drag threshold behavior for the browser feasibility adapter. */
export function classifyDrag({ dx = 0, dy = 0, elapsedMs = Infinity, threshold = 65 } = {}) {
  const horizontalDistance = Math.abs(Number(dx) || 0);
  const verticalDistance = Math.abs(Number(dy) || 0);
  const elapsed = Number(elapsedMs);
  const validTime = Number.isFinite(elapsed) && elapsed >= 0 && elapsed < 650;
  const validDirection = horizontalDistance > verticalDistance * 1.6;
  if (!validTime || !validDirection || horizontalDistance <= threshold) return "cancelled";
  return dx < 0 ? "next" : "previous";
}

/*
 * Adapts react-pageflip's imperative next/previous methods and onFlip callback.
 * The callback is treated as completion; page state is committed only when its
 * physical page matches the active transition target.
 */
export function createPageFlipTransitionAdapter({
  pageFlip,
  onCommit = () => {},
  onCancel = () => {},
  onStateChange = () => {},
  maxQueue = 1,
} = {}) {
  let nextTransitionId = 0;
  let active = null;
  let queued = null;

  // Defines setState function behavior for reader-browser-feasibility.mjs.
  const setState = (state, transition = active) => {
    onStateChange({ state, transitionId: transition?.transitionId || null });
  };

  // Defines invokeFlip function behavior for reader-browser-feasibility.mjs.
  const invokeFlip = (transition) => {
    const method = transition.toPage > transition.fromPage ? "flipNext" : "flipPrev";
    if (!pageFlip || typeof pageFlip[method] !== "function") {
      active = null;
      setState("cancelled", transition);
      onCancel({ ...transition, reason: "pageflip-method-unavailable" });
      return false;
    }
    try {
      pageFlip[method]();
      return true;
    } catch (error) {
      active = null;
      setState("cancelled", transition);
      onCancel({ ...transition, reason: "pageflip-error", error });
      return false;
    }
  };

  // Defines start function behavior for reader-browser-feasibility.mjs.
  const start = (input) => {
    active = { ...input, transitionId: ++nextTransitionId };
    setState("animating");
    if (!invokeFlip(active)) return { status: "cancelled", transitionId: active?.transitionId || null };
    return { status: "started", transitionId: active.transitionId };
  };

  // Defines startQueued function behavior for reader-browser-feasibility.mjs.
  const startQueued = () => {
    if (!queued || active) return;
    const next = queued;
    queued = null;
    start(next);
  };

  return {
    /* Starts one sequential page transition or queues at most one request. */
    begin(input) {
      if (!Number.isInteger(input?.fromPage) || !Number.isInteger(input?.toPage)) {
        return { status: "rejected", transitionId: null };
      }
      if (Math.abs(input.toPage - input.fromPage) !== 1) {
        return { status: "rejected", transitionId: null };
      }
      if (!active) return start(input);
      if (maxQueue < 1 || queued) return { status: "rejected", transitionId: null };
      queued = { ...input };
      return { status: "queued", transitionId: null };
    },

    /* Handles react-pageflip's onFlip completion callback. */
    complete(physicalPage) {
      if (!active || physicalPage !== active.toPage) return false;
      const committed = active;
      active = null;
      setState("committed", committed);
      onCommit(committed);
      startQueued();
      if (!active) setState("idle");
      return true;
    },

    /* Cancels the active transition without committing progress. */
    cancel(reason = "cancelled") {
      if (!active) return false;
      const cancelled = active;
      active = null;
      queued = null;
      if (typeof pageFlip?.stop === "function") pageFlip.stop();
      setState("cancelled", cancelled);
      onCancel({ ...cancelled, reason });
      setState("idle");
      return true;
    },

    /* Reports the adapter state without exposing mutable internal objects. */
    getSnapshot() {
      return {
        state: active ? "animating" : "idle",
        activeTransitionId: active?.transitionId || null,
        queued: Boolean(queued),
      };
    },
  };
}

/* Defines an abortable rendered-page resource owner for cache lifecycle probes. */
export function createRenderedPageResource({ cleanup = () => {} } = {}) {
  const controller = new AbortController();
  let disposed = false;
  return {
    signal: controller.signal,
    // Defines dispose method behavior for reader-browser-feasibility.mjs.
    dispose() {
      if (disposed) return false;
      disposed = true;
      controller.abort();
      cleanup();
      return true;
    },
    // Defines disposed method behavior for reader-browser-feasibility.mjs.
    get disposed() {
      return disposed;
    },
  };
}
