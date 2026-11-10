import { useEffect, useId, useRef } from 'react';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';

export type Tone = 'neutral' | 'info' | 'warning' | 'error';

export function Button({ variant = 'default', className = '', type = 'button', ...props }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'default' | 'primary' | 'danger' }) {
  return <button type={type} className={`button button--${variant} ${className}`} {...props} />;
}

export function Status({ children, tone = 'neutral' }: { children: ReactNode; tone?: Tone }) {
  return <span className={`status status--${tone}`}><span aria-hidden="true" className="status-dot" />{children}</span>;
}

export function Notice({ children, tone = 'neutral', title, live = false }:
  { children?: ReactNode; tone?: Tone; title?: string; live?: boolean }) {
  return <div className={`notice notice--${tone}`} role={live ? 'status' : undefined}>
    {title && <strong>{title}</strong>}{children && <div>{children}</div>}
  </div>;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="empty"><span className="empty-mark" aria-hidden="true">+</span><h3>{title}</h3>{children && <p>{children}</p>}</div>;
}

export function Facts({ items, className = '' }: { items: readonly (readonly [string, ReactNode])[]; className?: string }) {
  return <dl className={`facts ${className}`}>{items.map(([label, value]) => <div key={label}>
    <dt>{label}</dt><dd>{value ?? <span className="muted">Unavailable</span>}</dd>
  </div>)}</dl>;
}

export function TextInput({ label, hint, ...props }:
  InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  const id = useId();
  return <div className="field"><label htmlFor={id}>{label}</label><input id={id} {...props} aria-describedby={hint ? `${id}-hint` : undefined} />
    {hint && <small id={`${id}-hint`}>{hint}</small>}
  </div>;
}

export function Select({ label, hint, children, ...props }:
  SelectHTMLAttributes<HTMLSelectElement> & { label: string; hint?: string; children: ReactNode }) {
  const id = useId();
  return <div className="field"><label htmlFor={id}>{label}</label><select id={id} {...props} aria-describedby={hint ? `${id}-hint` : undefined}>{children}</select>
    {hint && <small id={`${id}-hint`}>{hint}</small>}
  </div>;
}

export function Modal({ open, title, children, actions, onRequestClose, wide = false }:
  { open: boolean; title: string; children: ReactNode; actions?: ReactNode; onRequestClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || !open) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.showModal();
    dialog.querySelector<HTMLElement>('[data-initial-focus], input:not(:disabled), select:not(:disabled), textarea:not(:disabled)')?.focus({ preventScroll: true });
    return () => {
      dialog.close();
      if (trigger?.isConnected && !trigger.hasAttribute('disabled')) trigger.focus({ preventScroll: true });
    };
  }, [open]);
  return <dialog ref={ref} className={`dialog ${wide ? 'dialog--wide' : ''}`} aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); onRequestClose(); }}>
    <header className="dialog-header"><div><p className="eyebrow">Evidence Desk / local workspace</p><h2 id={titleId}>{title}</h2></div>
      <Button onClick={onRequestClose} aria-label={`Close ${title}`}>Close</Button></header>
    <div className="dialog-body">{children}</div>
    {actions && <footer className="dialog-actions">{actions}</footer>}
  </dialog>;
}

function printable(value: unknown): string {
  if (value === null || value === undefined) return 'Unavailable';
  if (typeof value === 'string') return value || 'Not provided';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'Invalid number';
  return JSON.stringify(value, null, 2);
}

/** Backend evidence is text, never HTML or executable overlay instructions. */
export function JsonFacts({ value, title = 'Stored backend facts' }: { value: Record<string, unknown>; title?: string }) {
  return <details className="stored-facts"><summary>{title}</summary>
    {Object.keys(value).length ? <dl>{Object.entries(value).map(([key, item]) => <div key={key}>
      <dt>{key.replaceAll('_', ' ')}</dt><dd><pre>{printable(item)}</pre></dd>
    </div>)}</dl> : <p className="muted">No structured facts were stored.</p>}
  </details>;
}
