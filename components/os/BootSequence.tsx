import React from 'react';
import type { OSTheme } from '../../types';
import ClassicBootSequence from './ClassicBootSequence';
import JellyfishBootSequence from './JellyfishBootSequence';

interface Props {
  dataReady: boolean;
  wallpaper?: string;
  style?: OSTheme['bootAnimationStyle'];
  /** 外观 App「全屏模式」总开关（默认 true）。关闭时点入桌面不再请求全屏（逃生门），其余照旧。 */
  allowFullscreen?: boolean;
  onDone: () => void;
}

export default function BootSequence({ style, allowFullscreen = true, ...props }: Props) {
  const shared = { ...props, allowFullscreen };
  return style === 'classic'
    ? <ClassicBootSequence {...shared} />
    : <JellyfishBootSequence {...shared} />;
}
