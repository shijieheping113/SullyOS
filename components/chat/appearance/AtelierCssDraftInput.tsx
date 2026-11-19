import React, {forwardRef, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {compactCssImages} from '../../../utils/cssImagePlaceholders';
import {portableCssImages} from '../../../utils/cssImageAssets';

export type AtelierCssDraftHandle = {read: () => string};
type Props = Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'defaultValue' | 'onChange'> & {
    initialCss: string;
    onEdit: () => void;
};

/** Keep native typing and IME local; expand embedded images only on explicit actions. */
const AtelierCssDraftInput = forwardRef<AtelierCssDraftHandle, Props>(function AtelierCssDraftInput({initialCss, onEdit, ...props}, ref) {
    const session = useMemo(() => compactCssImages(initialCss), [initialCss]);
    const input = useRef<HTMLTextAreaElement>(null);
    const edited = useRef(false);
    const [showCopy, setShowCopy] = useState(false);
    const [notice, setNotice] = useState('');
    useLayoutEffect(() => {
        if (input.current) input.current.value = session.text;
        edited.current = false;
        setShowCopy(session.count > 0 || initialCss.includes('blobref:'));
        setNotice('');
    }, [initialCss, session]);
    const read = () => {
        const text = input.current?.value;
        return text === undefined || (!edited.current && text === session.text.replace(/\r\n?/g, '\n')) ? initialCss : session.expand(text);
    };
    useImperativeHandle(ref, () => ({read}));
    const markEdited = () => {
        if (edited.current) return;
        edited.current = true;
        onEdit();
    };
    return <>
        <textarea {...props} ref={input} wrap="off" spellCheck={false} autoCapitalize="off" autoCorrect="off"
            onChange={markEdited} onPaste={event => {
                const pasted = event.clipboardData?.getData('text/plain');
                if (!pasted) return;
                if (pasted.includes('blobref:')) setShowCopy(true);
                if (!/data:image\//i.test(pasted)) return;
                const field = event.currentTarget;
                const compact = session.compactMore(pasted, field.value);
                if (compact === pasted) return;
                event.preventDefault();
                const {selectionStart, selectionEnd} = field;
                if (typeof field.setRangeText === 'function') field.setRangeText(compact, selectionStart, selectionEnd, 'end');
                else {
                    field.value = field.value.slice(0, selectionStart) + compact + field.value.slice(selectionEnd);
                    field.setSelectionRange(selectionStart + compact.length, selectionStart + compact.length);
                }
                setShowCopy(true);
                markEdited();
            }}/>
        {showCopy && <div className="css-code-editor-assets">
            <p>图片用短名称显示；复制完整 CSS 会带上图片。</p>
            <button type="button" disabled={props.disabled} onClick={async () => {
                try {await navigator.clipboard.writeText(await portableCssImages(read()));setNotice('已复制完整 CSS');}
                catch {setNotice('复制失败，请重试');}
            }}>复制完整 CSS（含图片）</button>
            {notice && <p role="status">{notice}</p>}
        </div>}
    </>;
});
export default AtelierCssDraftInput;
