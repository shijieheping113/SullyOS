import React from 'react';
import './TextLoading.css';

/** 纯文字等待画面：明朝体日语 + 细线呼吸。与猪咪跑圈二选一，默认不启用。 */
export default function TextLoading() {
  return (
    <div className="sully-text-loading" aria-hidden="true">
      <div className="sully-text-loading-copy">
        <p className="sully-text-loading-kicker">SULLYOS</p>
        <p className="sully-text-loading-ja" lang="ja">準備しています</p>
        <div className="sully-text-loading-line" />
        <p className="sully-text-loading-en">please wait</p>
      </div>
    </div>
  );
}
