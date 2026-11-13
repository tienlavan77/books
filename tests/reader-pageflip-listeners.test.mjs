/* Runs the installed react-pageflip wrapper with a minimal hook host to detect
 * listener loss on reader rerenders without requiring PDF decoding or a browser. */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import vm from "node:vm";

// Executes real wrapper effects while replacing only React hooks and the DOM engine.
function createHost() {
  const require = createRequire(import.meta.url);
  const source = readFileSync(require.resolve("react-pageflip"), "utf8");
  const slots = [];
  let cursor = 0;
  let pending = [];
  let dirty = false;
  let render;
  const listeners = new Map();
  const engine = {
    // Defines on method behavior for reader-pageflip-listeners.test.mjs.
    on(name, handler) { listeners.set(name, handler); },
    // Defines off method behavior for reader-pageflip-listeners.test.mjs.
    off(name) { listeners.delete(name); },
    // Defines loadFromHTML, updateFromHtml, clear, destroy method behavior for reader-pageflip-listeners.test.mjs.
    loadFromHTML() {}, updateFromHtml() {}, clear() {}, destroy() {},
  };
  const React = {
    // Defines forwardRef method behavior for reader-pageflip-listeners.test.mjs.
    forwardRef(fn) { render = fn; return fn; },
    // Defines memo method behavior for reader-pageflip-listeners.test.mjs.
    memo(fn) { return fn; },
    // Defines useRef method behavior for reader-pageflip-listeners.test.mjs.
    useRef(value) {
      const index = cursor++;
      return slots[index] ||= { current: value };
    },
    // Defines useState method behavior for reader-pageflip-listeners.test.mjs.
    useState(value) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = value;
      return [slots[index], (next) => {
        slots[index] = typeof next === "function" ? next(slots[index]) : next;
        dirty = true;
      }];
    },
    // Defines useCallback method behavior for reader-pageflip-listeners.test.mjs.
    useCallback(fn) { cursor++; return fn; },
    // Defines useImperativeHandle method behavior for reader-pageflip-listeners.test.mjs.
    useImperativeHandle() { cursor++; },
    // Defines useEffect method behavior for reader-pageflip-listeners.test.mjs.
    useEffect(fn, deps) {
      const index = cursor++;
      const old = slots[index];
      if (!old || deps.some((dep, i) => dep !== old[i])) pending.push(fn);
      slots[index] = deps;
    },
    // Defines map method behavior for reader-pageflip-listeners.test.mjs.
    Children: { map(children, fn) { return children.map(fn); } },
    // Defines cloneElement method behavior for reader-pageflip-listeners.test.mjs.
    cloneElement(child, props) { return { ...child, ...props }; },
    // Defines createElement method behavior for reader-pageflip-listeners.test.mjs.
    createElement() { return {}; },
  };
  const module = { exports: {} };
  vm.runInNewContext(source, {
    module, exports: module.exports,
    // Defines require method behavior for reader-pageflip-listeners.test.mjs.
    require(name) {
      if (name === "react") return React;
      if (name === "page-flip") return { PageFlip: function PageFlip() { return engine; } };
      throw new Error(`Unexpected wrapper dependency: ${name}`);
    },
  });
  return {
    listeners,
    // Defines render method behavior for reader-pageflip-listeners.test.mjs.
    render(props) {
      let passes = 0;
      do {
        assert.ok(++passes < 10, "wrapper effects must settle");
        cursor = 0;
        dirty = false;
        pending = [];
        render(props, {});
        for (const effect of pending) effect();
      } while (dirty);
    },
  };
}

// Reproduces the wrapper bug: equal-length new children remove events without rebinding.
test("installed wrapper loses flip handlers when equal-length children change identity", () => {
  const host = createHost();
  // Defines onFlip, onInit method behavior for reader-pageflip-listeners.test.mjs.
  const props = { children: [{}, {}], renderOnlyPageLengthChange: true, onFlip() {}, onInit() {} };
  host.render(props);
  assert.equal(host.listeners.has("flip"), true);
  host.render({ ...props, children: [{}, {}] });
  assert.equal(host.listeners.has("flip"), false);
});

// Stable children must retain real wrapper listeners across fullscreen-related rerenders.
test("stable page children retain installed wrapper navigation listeners", () => {
  const host = createHost();
  // Defines onFlip, onInit method behavior for reader-pageflip-listeners.test.mjs.
  const props = { children: [{}, {}], renderOnlyPageLengthChange: true, onFlip() {}, onInit() {} };
  host.render(props);
  for (let page = 1; page <= 5; page++) {
    host.render({ ...props, startPage: page });
    assert.equal(host.listeners.has("flip"), true);
    assert.equal(host.listeners.has("init"), true);
  }
});
