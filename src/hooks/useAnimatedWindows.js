import { useEffect } from 'react';

// Observe popup content once in the shell so feature dialogs do not need to
// coordinate animation state. Animate real dimensions; text is never scaled.
export function useAnimatedWindows() {
  useEffect(() => {
    const windows = new Map();
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame;
    function measure() {
      const visible = new Set(
        document.querySelectorAll('dialog[open], .overlay > [role="dialog"]'),
      );
      for (const [element, state] of windows) {
        if (!visible.has(element)) {
          state.animation?.cancel();
          windows.delete(element);
        }
      }
      for (const element of visible) {
        const previous = windows.get(element);
        const current = element.getBoundingClientRect();
        // Cancel an unfinished transition before measuring the new natural size.
        previous?.animation?.cancel();
        const next = element.getBoundingClientRect();
        const state = { animation: null };
        windows.set(element, state);
        const from = previous?.animation ? current : previous?.size;
        state.size = { width: next.width, height: next.height };
        if (
          !from ||
          motion.matches ||
          (Math.abs(from.height - next.height) < 1 && Math.abs(from.width - next.width) < 1)
        ) {
          continue;
        }
        state.animation = element.animate(
          [
            { width: `${from.width}px`, height: `${from.height}px`, overflow: 'hidden' },
            { width: `${next.width}px`, height: `${next.height}px`, overflow: 'hidden' },
          ],
          { duration: 350, easing: 'ease-in-out' },
        );
        state.animation.onfinish = () => {
          state.animation = null;
        };
      }
    }
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['open', 'hidden', 'class'],
    });
    window.addEventListener('resize', schedule);
    schedule();
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', schedule);
      cancelAnimationFrame(frame);
      for (const state of windows.values()) state.animation?.cancel();
    };
  }, []);
}
