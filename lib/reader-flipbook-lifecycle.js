/* Keeps pageflip initialization events separate from reader navigation so layout
 * remounts preserve reading progress and never retain obsolete event callbacks. */

// Owns one flipbook mount; restores the requested physical page before accepting flips.
export function createReaderFlipbookLifecycle({ startPage, cancel, onFlip, onState }) {
  let ready = false;
  let disposed = false;
  let initialized = false;
  let handlers = { onFlip, onState };
  return {
    // React can replay effect setup after cleanup without creating a new layout.
    activate() {
      disposed = false;
      ready = initialized;
    },
    // Refreshes event consumers without requiring pageflip to rebind its listeners.
    update(next) {
      handlers = next;
    },
    // Suppresses load/restore flip events, which are not user navigation.
    init(instance) {
      if (disposed) return;
      ready = false;
      cancel("reader-layout-change");
      instance.turnToPage(Math.max(0, startPage - 1));
      initialized = true;
      ready = true;
    },
    // Forwards only navigation events from this initialized, live instance.
    flip(event) {
      if (ready && !disposed) handlers.onFlip(event);
    },
    // Forwards animation completion only after page restoration has finished.
    state(event) {
      if (ready && !disposed) handlers.onState(event);
    },
    // Invalidates callbacks and cancels a transition belonging to a removed layout.
    dispose() {
      disposed = true;
      ready = false;
      cancel("reader-layout-unmount");
    },
  };
}
