'use client';

import React from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// DateField — a browser-independent dd/mm/yyyy date input.
//
// Native date inputs render in the browser's locale (US PCs show
// mm/dd/yyyy), which we can't control. This is a drop-in replacement: it keeps the
// same `value` (ISO yyyy-mm-dd) / `onChange` / `name` / `min` / `max` API, but shows
// and accepts the date as dd/mm/yyyy. onChange fires with an event-like object whose
// `target.value` is the ISO date (or '' while incomplete), so existing handlers like
// `onChange={e => setX(e.target.value)}` keep working unchanged. When `name` is set,
// a hidden input carries the ISO value so plain <form> submission is unaffected.
// ─────────────────────────────────────────────────────────────────────────────

function isoToDisplay(iso?: string | null): string {
    if (!iso) return '';
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
    return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

function displayToIso(text: string): string {
    const digits = text.replace(/\D/g, '');
    if (digits.length !== 8) return '';
    const dd = digits.slice(0, 2), mm = digits.slice(2, 4), yyyy = digits.slice(4);
    const month = Number(mm), day = Number(dd);
    if (month < 1 || month > 12 || day < 1 || day > 31) return '';
    const iso = `${yyyy}-${mm}-${dd}`;
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return iso;
}

type ChangeLike = {
    target: { value: string; name?: string };
    currentTarget: { value: string; name?: string };
};

interface DateFieldProps {
    value?: string | null;
    defaultValue?: string | null;
    onChange?: (e: ChangeLike) => void;
    name?: string;
    min?: string;
    max?: string;
    className?: string;
    placeholder?: string;
    required?: boolean;
    disabled?: boolean;
    id?: string;
    title?: string;
    type?: string; // ignored (was type="date")
    [key: string]: any;
}

export function DateField({
    value,
    defaultValue,
    onChange,
    name,
    min,
    max,
    className,
    placeholder = 'dd/mm/yyyy',
    required,
    disabled,
    id,
    title,
    type: _ignored,
    ...rest
}: DateFieldProps) {
    const controlled = value !== undefined;
    const [text, setText] = React.useState<string>(isoToDisplay(controlled ? value : defaultValue));
    // Hidden native date input drives the calendar popup (so users can pick a
    // date instead of only typing dd/mm/yyyy).
    const pickerRef = React.useRef<HTMLInputElement>(null);

    // Keep the visible text in sync when the controlled ISO value changes externally
    // (presets, resets) — but never while the user is mid-typing a partial date.
    React.useEffect(() => {
        if (!controlled) return;
        const currentIso = displayToIso(text);
        if ((value || '') !== currentIso) setText(isoToDisplay(value));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    const handle = (e: React.ChangeEvent<HTMLInputElement>) => {
        const digits = e.target.value.replace(/\D/g, '').slice(0, 8);
        let formatted = digits;
        if (digits.length > 4) formatted = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
        else if (digits.length > 2) formatted = `${digits.slice(0, 2)}/${digits.slice(2)}`;
        setText(formatted);

        let iso = displayToIso(formatted);
        if (iso && ((min && iso < min) || (max && iso > max))) iso = '';

        onChange?.({
            target: { value: iso, name },
            currentTarget: { value: iso, name },
        });
    };

    // Calendar pick → update the visible dd/mm/yyyy text + fire onChange (ISO).
    const handlePick = (e: React.ChangeEvent<HTMLInputElement>) => {
        const iso = e.target.value; // already ISO yyyy-mm-dd
        setText(isoToDisplay(iso));
        onChange?.({ target: { value: iso, name }, currentTarget: { value: iso, name } });
    };

    const openPicker = () => {
        const el = pickerRef.current;
        if (!el || disabled) return;
        // showPicker() is the modern way; fall back to focus+click for older browsers.
        if (typeof (el as any).showPicker === 'function') {
            try { (el as any).showPicker(); return; } catch { /* fall through */ }
        }
        el.focus();
        el.click();
    };

    const currentIso = (controlled ? value : displayToIso(text)) || '';
    // Preserve the caller's sizing: full-width inputs need a full-width wrapper,
    // fixed-width ones should hug their content.
    const fullWidth = (className || '').includes('w-full');

    return (
        <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', width: fullWidth ? '100%' : undefined }}>
            <input
                {...rest}
                type="text"
                inputMode="numeric"
                placeholder={placeholder}
                value={text}
                maxLength={10}
                onChange={handle}
                onClick={openPicker}
                className={className}
                required={required}
                disabled={disabled}
                id={id}
                title={title}
            />
            {/* Native date input — invisible, anchors the calendar popup to the field. */}
            <input
                ref={pickerRef}
                type="date"
                tabIndex={-1}
                aria-hidden="true"
                value={currentIso}
                min={min}
                max={max}
                disabled={disabled}
                onChange={handlePick}
                style={{ position: 'absolute', right: 0, bottom: 0, width: 1, height: 1, opacity: 0, pointerEvents: 'none', border: 0, padding: 0, margin: 0 }}
            />
            {name ? <input type="hidden" name={name} value={currentIso} /> : null}
        </span>
    );
}

export default DateField;
