import React, { useRef, useState } from 'react';
import type { CharacterProfile } from '../../types';
import { exportCharacterBundle, importCharacterBundle, readCharacterBundle, type CharacterBundle } from '../../utils/characterBundle';
import { shareOrDownloadBlob } from '../../utils/shareExport';

interface CharacterMoveCardProps {
    characters: CharacterProfile[];
    addToast: (msg: string, type?: string) => void;
}

const CharacterMoveCard: React.FC<CharacterMoveCardProps> = ({ characters, addToast }) => {
    const fileRef = useRef<HTMLInputElement>(null);
    const [exportId, setExportId] = useState(characters[0]?.id || '');
    const [targetId, setTargetId] = useState(characters[0]?.id || '');
    const [bundle, setBundle] = useState<CharacterBundle | null>(null);
    const [busy, setBusy] = useState(false);
    const [confirmed, setConfirmed] = useState(false);

    const selectedExport = characters.find(character => character.id === exportId) || characters[0];
    const selectedTarget = characters.find(character => character.id === targetId) || characters[0];

    const handleExport = async () => {
        if (!selectedExport || busy) return;
        setBusy(true);
        try {
            const { blob, fileName } = await exportCharacterBundle(selectedExport.id);
            await shareOrDownloadBlob({ blob, fileName, shareTitle: fileName, preferDownloadOnWeb: true });
            addToast(`已导出「${selectedExport.name}」`, 'success');
        } catch (error: any) {
            addToast(error?.message || '导出失败', 'error');
        } finally {
            setBusy(false);
        }
    };

    const handleFile = async (file: File | undefined) => {
        if (!file) return;
        setBusy(true);
        setConfirmed(false);
        try {
            const next = await readCharacterBundle(file);
            setBundle(next);
            addToast(`读到「${next.character.name}」，选本机要换掉的那只`, 'success');
        } catch (error: any) {
            setBundle(null);
            addToast(error?.message || '这个文件读不了', 'error');
        } finally {
            setBusy(false);
            if (fileRef.current) fileRef.current.value = '';
        }
    };

    const handleReplace = async () => {
        if (!bundle || !selectedTarget || !confirmed || busy) return;
        const ok = window.confirm(`本机的「${selectedTarget.name}」会被包里的「${bundle.character.name}」整只换掉。人设、神经连接设置、私聊、记忆宫殿、喵喵盒都会换成包里的。用户名、别的角色和群聊不动。这个操作撤不回。`);
        if (!ok) return;
        setBusy(true);
        try {
            await importCharacterBundle(bundle, selectedTarget.id);
            addToast('换好了，正在重新打开', 'success');
            window.setTimeout(() => window.location.reload(), 400);
        } catch (error: any) {
            addToast(error?.message || '替换失败', 'error');
            setBusy(false);
        }
    };

    return (
        <div className="mb-4 rounded-xl border border-sky-200 bg-sky-50/80 p-3">
            <p className="text-[10px] font-bold text-sky-900 mb-1">单角色搬家</p>
            <p className="text-[10px] text-sky-900/70 leading-relaxed mb-3">
                只换一只角色。测试档导出，正式档选中要换掉的那只再导入。上面的整机备份和二改全量备份都不走这里。
            </p>
            {characters.length === 0 ? (
                <p className="text-[10px] text-slate-400">本机还没有角色。</p>
            ) : (
                <>
                    <label className="block text-[10px] text-slate-500 mb-1">导出哪一只</label>
                    <select
                        value={selectedExport?.id || ''}
                        onChange={event => setExportId(event.target.value)}
                        className="w-full mb-2 rounded-lg border border-sky-200 bg-white px-2 py-2 text-xs text-slate-700"
                    >
                        {characters.map(character => (
                            <option key={character.id} value={character.id}>{character.name}</option>
                        ))}
                    </select>
                    <button
                        type="button"
                        onClick={() => void handleExport()}
                        disabled={busy}
                        className="w-full py-2.5 mb-3 rounded-xl bg-sky-600 text-xs font-bold text-white active:scale-95 disabled:opacity-40"
                    >
                        {busy ? '请稍等…' : '导出这只角色'}
                    </button>
                    <button
                        type="button"
                        onClick={() => fileRef.current?.click()}
                        disabled={busy}
                        className="w-full py-2.5 rounded-xl border border-sky-200 bg-white text-xs font-bold text-sky-900 active:scale-95 disabled:opacity-40"
                    >
                        选择单角色包
                    </button>
                    <input ref={fileRef} type="file" accept=".zip,application/zip" className="hidden" onChange={event => void handleFile(event.target.files?.[0])} />
                    {bundle && (
                        <div className="mt-3 rounded-lg bg-white border border-sky-100 p-2">
                            <p className="text-[10px] text-slate-600 mb-2">包里是「{bundle.character.name}」。换到本机的哪一只：</p>
                            <select
                                value={selectedTarget?.id || ''}
                                onChange={event => setTargetId(event.target.value)}
                                className="w-full mb-2 rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs text-slate-700"
                            >
                                {characters.map(character => (
                                    <option key={character.id} value={character.id}>{character.name}</option>
                                ))}
                            </select>
                            <label className="flex items-start gap-2 text-[10px] text-rose-700 mb-2">
                                <input type="checkbox" className="mt-0.5" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />
                                <span>我知道本机这只角色的人设、私聊、记忆宫殿和喵喵盒会被换掉，撤不回。</span>
                            </label>
                            <button
                                type="button"
                                onClick={() => void handleReplace()}
                                disabled={busy || !confirmed}
                                className="w-full py-2.5 rounded-xl bg-rose-500 text-xs font-bold text-white active:scale-95 disabled:opacity-40"
                            >
                                替换这只角色
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default CharacterMoveCard;
