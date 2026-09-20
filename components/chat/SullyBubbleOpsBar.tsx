import React from 'react';
import {
    SULLY_BUBBLE_OPS_ADD_ABOVE,
    SULLY_BUBBLE_OPS_ADD_BELOW,
    SULLY_BUBBLE_OPS_MERGE_ABOVE,
    SULLY_BUBBLE_OPS_MERGE_BELOW,
    SULLY_BUBBLE_OPS_NO_NEIGHBOR_ABOVE,
    SULLY_BUBBLE_OPS_NO_NEIGHBOR_BELOW,
    SULLY_FORMAT_PICK_CANCEL,
} from '../../utils/sullyAssistantCopy';

type Props = {
    canMergeAbove: boolean;
    canMergeBelow: boolean;
    onAddAbove: () => void;
    onAddBelow: () => void;
    onMergeAbove: () => void;
    onMergeBelow: () => void;
    onCancel: () => void;
};

const SullyBubbleOpsBar: React.FC<Props> = ({
    canMergeAbove,
    canMergeBelow,
    onAddAbove,
    onAddBelow,
    onMergeAbove,
    onMergeBelow,
    onCancel,
}) => (
    <div
        className="shrink-0 z-30 px-4 py-3 bg-violet-950/95 text-violet-50 border-b border-violet-500/20 flex flex-col gap-2"
        style={{ paddingTop: 'max(0.5rem, var(--safe-top))' }}
    >
        <div className="grid grid-cols-2 gap-2">
            <button
                type="button"
                onClick={onAddAbove}
                className="py-2.5 rounded-xl bg-violet-500 text-sm font-bold text-white active:scale-[0.98]"
            >
                {SULLY_BUBBLE_OPS_ADD_ABOVE}
            </button>
            <button
                type="button"
                onClick={onAddBelow}
                className="py-2.5 rounded-xl bg-violet-500 text-sm font-bold text-white active:scale-[0.98]"
            >
                {SULLY_BUBBLE_OPS_ADD_BELOW}
            </button>
            <button
                type="button"
                disabled={!canMergeAbove}
                title={!canMergeAbove ? SULLY_BUBBLE_OPS_NO_NEIGHBOR_ABOVE : undefined}
                onClick={onMergeAbove}
                className="py-2.5 rounded-xl bg-white/10 text-sm font-medium disabled:opacity-40 active:scale-[0.98]"
            >
                {SULLY_BUBBLE_OPS_MERGE_ABOVE}
            </button>
            <button
                type="button"
                disabled={!canMergeBelow}
                title={!canMergeBelow ? SULLY_BUBBLE_OPS_NO_NEIGHBOR_BELOW : undefined}
                onClick={onMergeBelow}
                className="py-2.5 rounded-xl bg-white/10 text-sm font-medium disabled:opacity-40 active:scale-[0.98]"
            >
                {SULLY_BUBBLE_OPS_MERGE_BELOW}
            </button>
        </div>
        <button
            type="button"
            onClick={onCancel}
            className="w-full py-2 rounded-xl bg-white/5 text-sm text-violet-100/80"
        >
            {SULLY_FORMAT_PICK_CANCEL}
        </button>
    </div>
);

export default SullyBubbleOpsBar;
