import React from 'react';
import './PigcatLoading.css';

/** Ann 确认的第三版原型：112px 滚轮、65px 黑球，无脚和汗水。 */
export default function PigcatLoading() {
  return (
    <div className="sully-pigcat-loading"><div className="group" aria-hidden="true">
     <div className="scene" aria-hidden="true">
      <svg className="wheel-drawing" viewBox="0 0 180 138">
       <path className="stand" d="M67 115l-9 16m55-16 9 16M54 132h72"/>
       <circle className="rim" cx="90" cy="64" r="56"/>
       <circle className="inner-rim" cx="90" cy="64" r="50"/>
       <g className="wheel-turn"><circle className="wheel-ticks" cx="90" cy="64" r="55.5"/></g>
      </svg>
      <div className="cat-jump">
       <svg className="cat" viewBox="0 0 120 112" xmlns="http://www.w3.org/2000/svg">
        <g className="belly">
         <g className="ear-left"><path d="M10 67Q10 34 16 12Q18 5 24 10L57 38L56 69Z" fill="#4a4a4a"/><path d="M22 18Q20 28 19 37L39 33Z" fill="#fff"/></g>
         <g className="ear-right"><path d="M110 67Q110 34 104 12Q102 5 96 10L63 38L64 69Z" fill="#4a4a4a"/><path d="M98 18Q100 28 101 37L81 33Z" fill="#fff"/></g>
         <path d="M3 76C3 46 30 28 60 28C90 28 117 46 117 76C117 100 92 112 60 112C28 112 3 100 3 76Z" fill="#4a4a4a"/>
         <g className="face">
          <g className="eyes-open" fill="#fff"><rect x="35" y="58" width="11" height="24" rx="5.5"/><rect x="74" y="58" width="11" height="24" rx="5.5"/></g>
          <g className="eyes-closed" fill="none" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round"><path d="M34 66l10 6-10 6M84 66l-10 6 10 6"/></g>
         </g>
        </g>
       </svg>
      </div>
      <div className="effort"><svg viewBox="0 0 25 27"><path d="M3 11L1 4M10 9l3-7M16 15l7-3"/></svg></div>
     </div>
     <div className="caption">
      <span className="ornament paw" aria-hidden="true"><svg viewBox="0 0 24 24" fill="currentColor"><ellipse cx="5" cy="9" rx="2.4" ry="3.2" transform="rotate(-23 5 9)"/><ellipse cx="10" cy="5.5" rx="2.3" ry="3"/><ellipse cx="16" cy="6" rx="2.3" ry="3" transform="rotate(12 16 6)"/><ellipse cx="20" cy="11" rx="2.2" ry="3" transform="rotate(30 20 11)"/><path d="M6.3 16.4C7.5 14.7 8.4 11.7 12 11.7S16.5 14.7 17.7 16.4C20.5 20.5 16.5 22 13.8 20.7Q12 19.7 10.2 20.7C7.5 22 3.5 20.5 6.3 16.4Z"/></svg></span>
      <p className="label" lang="ja">せっせと準備中…</p>
      <span className="ornament snout" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="2.5" y="5" width="19" height="14" rx="7" fill="none" stroke="currentColor" strokeWidth="1.8"/><g fill="currentColor"><ellipse cx="8.5" cy="12" rx="1.6" ry="2.5"/><ellipse cx="15.5" cy="12" rx="1.6" ry="2.5"/></g></svg></span>
     </div>
    </div></div>
  );
}
