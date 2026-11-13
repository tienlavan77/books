/*
 * Provides the production transition state machine for sequential reader turns.
 * It separates pageflip animation completion from direct page jumps and progress
 * persistence, so only a matching completed transition can commit a page.
 */

/* Defines a bounded sequential transition controller for the PDF reader. */
export function createReaderTransitionController({
  onCommit = () => {},
  onCancel = () => {},
  maxQueue = 1,
} = {}) {
  let nextTransitionId = 0;
  let active = null;
  let queued = null;

  // Defines normalizePage function behavior for reader-transition.js.
  const normalizePage = (page) => Math.max(1, Math.trunc(Number(page) || 1));
  // Defines isSequential function behavior for reader-transition.js.
  const isSequential = (fromPage, toPage) => {
    const distance = Math.abs(toPage - fromPage);
    return distance >= 1 && distance <= 2;
  };

  // Defines start function behavior for reader-transition.js.
  const start = (input) => {
    const transition = {
      ...input,
      fromPage: normalizePage(input.fromPage),
      toPage: normalizePage(input.toPage),
      transitionId: ++nextTransitionId,
    };
    active = transition;
    try {
      input.invoke();
      return { status: "started", transitionId: transition.transitionId };
    } catch (error) {
      active = null;
      onCancel({ ...transition, reason: "animation-error", error });
      return { status: "cancelled", transitionId: transition.transitionId };
    }
  };

  // Defines startQueued function behavior for reader-transition.js.
  const startQueued = () => {
    if (!queued || active) return;
    const next = queued;
    queued = null;
    start(next);
  };

  return {
    /* Starts or bounds a sequential transition request. */
    begin({ fromPage, toPage, invoke, source = "unknown" }) {
      const from = normalizePage(fromPage);
      const to = normalizePage(toPage);
      if (typeof invoke !== "function" || !isSequential(from, to)) {
        return { status: "rejected", transitionId: null };
      }
      const input = { fromPage: from, toPage: to, invoke, source };
      if (!active) return start(input);
      if (maxQueue < 1 || queued) return { status: "rejected", transitionId: null };
      queued = input;
      return { status: "queued", transitionId: null };
    },

    /* Commits only the active transition matching the completed physical page. */
    complete(completedPage) {
      const page = normalizePage(completedPage);
      if (!active || active.toPage !== page) return false;
      const committed = active;
      active = null;
      onCommit(committed);
      startQueued();
      return true;
    },

    /* Commits the registered target when pageflip reports stable read state. */
    completeActive() {
      if (!active) return false;
      const target = active.toPage;
      return this.complete(target);
    },

    /* Cancels animation and drops queued input without committing progress. */
    cancel(reason = "cancelled") {
      if (!active) return false;
      const cancelled = active;
      active = null;
      queued = null;
      onCancel({ ...cancelled, reason });
      return true;
    },

    /* Returns immutable state useful for guarding input and diagnostics. */
    getSnapshot() {
      return {
        state: active ? "animating" : "idle",
        activeTransitionId: active?.transitionId || null,
        targetPage: active?.toPage || null,
        queued: Boolean(queued),
      };
    },
  };
}
