// Native dragstart causes pointercancel in browsers. Keep native drag state
// separate from the touch gesture so that cancellation cannot erase the payload.
export function createCalendarDrag() {
  let entry = null;
  let native = false;
  return {
    start(item, isNative = false) {
      entry = item;
      native = isNative;
    },
    current() {
      return entry;
    },
    cancelPointer() {
      if (native) return false;
      entry = null;
      return true;
    },
    end() {
      entry = null;
      native = false;
    },
  };
}
