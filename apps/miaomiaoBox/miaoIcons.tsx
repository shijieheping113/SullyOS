import React from 'react';
import type { MiaomiaoStarter } from './types';

export const IcoBox = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M3.6 8.6h16.8v11H3.6z" /><path d="M2.6 4.6h18.8v4H2.6z" /><path d="M12 8.6v11M12 4.6v4" /><path d="M8.8 6.6h6.4" />
  </svg>
);
export const IcoBook = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 6.6C10.4 5.3 8.3 4.8 4.6 4.8v12.6c3.7 0 5.8.5 7.4 1.8 1.6-1.3 3.7-1.8 7.4-1.8V4.8c-3.7 0-5.8.5-7.4 1.8Z" /><path d="M12 6.6v12.6" />
  </svg>
);
export const IcoToy = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="7.4" cy="6.4" r="2.6" /><circle cx="16.6" cy="6.4" r="2.6" /><circle cx="12" cy="14" r="6" />
    <path d="M9.6 13.2h.01M14.4 13.2h.01M10.4 16.4c1 .8 2.2.8 3.2 0" />
  </svg>
);
export const IcoWalk = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <ellipse cx="8" cy="7.6" rx="1.6" ry="2" /><ellipse cx="12" cy="6.4" rx="1.6" ry="2.1" /><ellipse cx="15.8" cy="7.6" rx="1.6" ry="2" />
    <path d="M11.9 11.4c2.3 0 4.1 1.5 4.1 3.3 0 1.5-1.3 2.3-2.5 2.3-.7 0-1-.3-1.6-.3s-.9.3-1.6.3c-1.2 0-2.5-.8-2.5-2.3 0-1.8 1.8-3.3 4.1-3.3Z" />
    <path d="M5 19.6c2.6-.7 4.4-.7 7 0 2.4.6 4.2.6 6.6 0" strokeDasharray="1.6 2.4" opacity=".8" />
  </svg>
);
export const IcoMoon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M15.6 3.6a8.4 8.4 0 1 0 4.8 11.6 7 7 0 0 1-4.8-11.6Z" />
    <path d="M8.4 6.2l.5 1.4 1.4.5-1.4.5-.5 1.4-.5-1.4-1.4-.5 1.4-.5z" />
  </svg>
);
export const IcoPaw = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <ellipse cx="7.4" cy="8.6" rx="2.1" ry="2.6" /><ellipse cx="12" cy="7.1" rx="2.1" ry="2.7" />
    <ellipse cx="16.6" cy="8.6" rx="2.1" ry="2.6" /><ellipse cx="19.6" cy="12.7" rx="1.8" ry="2.3" />
    <ellipse cx="4.4" cy="12.7" rx="1.8" ry="2.3" />
    <path d="M12 12.4c3 0 5.4 2 5.4 4.3 0 2-1.7 3-3.3 3-.9 0-1.4-.4-2.1-.4s-1.2.4-2.1.4c-1.6 0-3.3-1-3.3-3 0-2.3 2.4-4.3 5.4-4.3Z" />
  </svg>
);
export const IcoMinus = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden>
    <path d="M6 12h12" />
  </svg>
);

export const STARTER_ICO: Record<MiaomiaoStarter, React.FC> = {
  box: IcoBox,
  story: IcoBook,
  claw: IcoToy,
  walk: IcoWalk,
  dream: IcoMoon,
  random: IcoPaw,
};
