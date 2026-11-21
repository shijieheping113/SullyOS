import React, { createContext, useCallback, useContext, useState } from 'react';
import type { OSTheme } from '../../types';
import ClassicBootSequence from './ClassicBootSequence';
import JellyfishBootSequence from './JellyfishBootSequence';
import SplashScreen from './SplashScreen';
import TextBootSequence from './TextBootSequence';
import { isMidAutumnBoot } from '../../utils/seasonalBoot';
import { isUserSpaceArrival } from '../../utils/userSpaceTransition';

interface Props {
  dataReady: boolean;
  wallpaper?: string;
  style?: OSTheme['bootAnimationStyle'];
  onDone: () => void;
}

const Opening = createContext({
  bootDone: true,
  setReady: (_ready: boolean, _wallpaper: string) => {},
});

export const useStartupOpening = () => useContext(Opening);

export function StartupOpening({ children, failed }: { children: React.ReactNode; failed: boolean }) {
  const [theme] = useState<Partial<OSTheme>>(() => {
    try { return JSON.parse(localStorage.getItem('os_theme') || '{}') || {}; }
    catch { return {}; }
  });
  const [bootDone, setBootDone] = useState(() => theme.bootAnimationEnabled === false || isUserSpaceArrival());
  const [status, setStatus] = useState({ ready: false, wallpaper: '' });
  const setReady = useCallback((ready: boolean, wallpaper: string) => setStatus({ ready, wallpaper }), []);
  const onDone = useCallback(() => setBootDone(true), []);
  return (
    <Opening.Provider value={{ bootDone, setReady }}>
      {children}
      {!failed && !bootDone && <BootSequence dataReady={status.ready} style={theme.bootAnimationStyle} wallpaper={status.wallpaper} onDone={onDone} />}
    </Opening.Provider>
  );
}
export default function BootSequence({style = 'black-cat', ...props}: Props) {
  // 一次开屏固定同一张图；下次进入重新判断，到期恢复用户选择的样式。
  const [midAutumn] = React.useState(() => isMidAutumnBoot());
  if (midAutumn) return <JellyfishBootSequence {...props} poster={`${import.meta.env.BASE_URL}boot/mid-autumn-2026.png`} />;
  if (style === 'black-cat') return <SplashScreen {...props} />;
  if (style === 'text') return <TextBootSequence {...props} />;
  return style === 'classic' ? <ClassicBootSequence {...props} /> : <JellyfishBootSequence {...props} />;
}
