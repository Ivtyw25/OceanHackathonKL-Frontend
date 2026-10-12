import { useEffect } from 'react';
import { useApp } from '../state/store';

/** Space plays or pauses; arrow keys step the timeline (Shift for 6 hours); Escape closes the farm. */
export function useKeyboardShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      const app = useApp.getState();
      if (e.key === ' ' && !target?.closest('button')) {
        e.preventDefault();
        app.setPlaying(!app.playing);
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const step = (e.shiftKey ? 6 : 1) * (e.key === 'ArrowRight' ? 1 : -1);
        app.setPlaying(false);
        app.setHour(Math.round(app.hour) + step);
      } else if (e.key === 'Escape' && app.selectedFarmId) {
        app.selectFarm(null);
        app.resetView();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
