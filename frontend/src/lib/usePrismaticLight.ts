import { useEffect } from 'react';

const SURFACE_SELECTOR =
  '.pane,.glass,.hero-card,.flow-card,.clear-card,.pill-btn,.mini-btn,.icon-btn,.stat-box,.nav-item';

export function usePrismaticLight(enabledFlag = true) {
  useEffect(() => {
    if (!enabledFlag) return;
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (!fine.matches || reduced.matches) return;

    let frame = 0;
    let activeSurface: HTMLElement | null = null;
    let pending: { surface: HTMLElement; x: number; y: number } | null = null;

    const clear = (el: HTMLElement | null) => {
      if (!el) return;
      el.style.removeProperty('--mx');
      el.style.removeProperty('--my');
      el.style.removeProperty('--ang');
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      const surface =
        e.target instanceof Element
          ? (e.target.closest(SURFACE_SELECTOR) as HTMLElement | null)
          : null;
      if (surface !== activeSurface) {
        clear(activeSurface);
        activeSurface = surface;
      }
      if (!surface) return;
      pending = { surface, x: e.clientX, y: e.clientY };
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (!pending) return;
        const { surface: s, x, y } = pending;
        const rect = s.getBoundingClientRect();
        const lx = x - rect.left;
        const ly = y - rect.top;
        const angle =
          (Math.atan2(ly - rect.height / 2, lx - rect.width / 2) * 180) / Math.PI + 90;
        s.style.setProperty('--mx', `${lx}px`);
        s.style.setProperty('--my', `${ly}px`);
        s.style.setProperty('--ang', `${angle}deg`);
        pending = null;
      });
    };

    const onLeave = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      clear(activeSurface);
      activeSurface = null;
    };

    document.addEventListener('pointermove', onMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeave, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      clear(activeSurface);
      document.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
    };
  }, [enabledFlag]);
}
