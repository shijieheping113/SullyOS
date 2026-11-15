import { drawDesktop, iconCell } from './lockScreenMotion';
import type { DesktopMotion } from './lockScreenMotion';
import type { OSTheme } from '../../types';

export function usesV5DesktopEntry(skin: OSTheme['skin']) {
  return skin === undefined || skin === 'default' || skin === 'animalcrossing';
}

export function launcherUnlockMotion(root: HTMLElement): DesktopMotion {
  const page = root.querySelector('[data-unlock-page="active"]');
  const cells = Array.from(page?.querySelectorAll<HTMLElement>('[data-unlock-cell]') || [], element => {
    const index = Number(element.dataset.unlockCell);
    const columns = Number(element.parentElement?.dataset.unlockColumns) || 4;
    const pose = iconCell(element, index, columns);
    return { ...pose, x: pose.x * 1.3, y: pose.y * 1.3, initialScale: .53 };
  });
  const widgets = Array.from(page?.querySelectorAll<HTMLElement>('[data-unlock-widget]') || [], (element, index) => ({
    element,
    x: index % 2 === 0 ? -28 : 28,
    y: index === 0 ? -36 : 54,
    delay: .035 + index * .045,
    initialScale: .82,
    keepBackdrop: element.hasAttribute('data-unlock-backdrop'),
  }));
  const indicators = root.querySelector<HTMLElement>('[data-unlock-indicators]');
  const dock = root.querySelector<HTMLElement>('[data-unlock-dock]');
  root.setAttribute('data-unlock-animating', '');
  const targets = [...cells, ...widgets];
  return {
    draw(progress) {
      root.style.opacity = progress > 0 ? '1' : '0';
      drawDesktop(progress, targets, dock, indicators, 48);
    },
    finish() {
      root.querySelectorAll('.animate-fade-in').forEach(element => element.setAttribute('data-unlock-entered', ''));
    },
    clear() {
      root.style.opacity = '';
      root.removeAttribute('data-unlock-animating');
      for (const { element } of targets) {
        element.style.opacity = '';
        element.style.transform = '';
        element.style.visibility = '';
      }
      if (dock) {
        dock.style.opacity = '';
        dock.style.transform = '';
      }
      if (indicators) indicators.style.opacity = '';
    },
  };
}
