import React from 'react';
import {
    SULLY_FORMAT_PICK_CANCEL,
    SULLY_FORMAT_PICK_CONFIRM,
    SULLY_FORMAT_PICK_HINT_AI_REPAIR,
    SULLY_FORMAT_PICK_HINT_BUBBLE,
    SULLY_FORMAT_PICK_HINT_EDIT,
} from '../../utils/sullyAssistantCopy';

export type SullyPickPurpose = 'edit-rerender' | 'bubble-ops' | 'ai-repair';

type Props = {
    purpose: SullyPickPurpose;
    selectedCount: number;
    onCancel: () => void;
    onConfirm?: () => void;
};

const SullyFormatPickBar: React.FC<Props> = ({ purpose, selectedCount, onCancel, onConfirm }) => (
    <div
        className="shrink-0 z-30 px-4 py-3 bg-violet-950/95 text-violet-50 border-b border-violet-500/20 flex flex-col gap-2"
        style={{ paddingTop: 'max(0.5rem, var(--safe-top))' }}
    >
        <p className="text-xs text-center text-violet-100/80 leading-relaxed">
            {purpose === 'bubble-ops'
                ? SULLY_FORMAT_PICK_HINT_BUBBLE
                : purpose === 'ai-repair'
                    ? SULLY_FORMAT_PICK_HINT_AI_REPAIR
                    : SULLY_FORMAT_PICK_HINT_EDIT}
        </p>
        <div className="flex gap-2">
            <button
                type="button"
                onClick={onCancel}
                className="flex-1 py-2.5 rounded-xl bg-white/10 text-sm font-medium active:scale-[0.98]"
            >
                {SULLY_FORMAT_PICK_CANCEL}
            </button>
            {(purpose === 'edit-rerender' || purpose === 'ai-repair') && onConfirm && (
                <button
                    type="button"
                    disabled={selectedCount === 0}
                    onClick={onConfirm}
                    className="flex-1 py-2.5 rounded-xl bg-violet-500 text-sm font-bold text-white disabled:opacity-40 active:scale-[0.98]"
                >
                    {SULLY_FORMAT_PICK_CONFIRM}
                    {selectedCount > 0 ? ` (${selectedCount})` : ''}
                </button>
            )}
        </div>
    </div>
);

export default SullyFormatPickBar;
