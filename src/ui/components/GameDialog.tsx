import { useEffect, useId, useRef, type ReactNode } from 'react';
import { useI18n } from '../../i18n/I18n.js';

function outside(dialog: HTMLDialogElement, x: number, y: number) {
  const box = dialog.getBoundingClientRect();
  return x < box.left || x > box.right || y < box.top || y > box.bottom;
}
/** One native-modal lifecycle and focus policy for all temporary overlays. */
export function GameDialog({ title, children, onClose, className = '', closeLabel, dismissOnBackdrop = false, footer }: {
  title: string; children: ReactNode; onClose: () => void; className?: string;
  closeLabel?: string; dismissOnBackdrop?: boolean; footer?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null), press = useRef(false), closing = useRef(false);
  const close = useRef(onClose), titleId = useId();
  close.current = onClose;
  const { t } = useI18n();
  function requestClose() {
    if (closing.current) return;
    closing.current = true;
    close.current();
  }
  useEffect(() => {
    const dialog = ref.current!, opener = document.activeElement as HTMLElement | null;
    closing.current = false;
    dialog.showModal();
    return () => {
      closing.current = true;
      if (dialog.open) dialog.close();
      queueMicrotask(() => {
        if (opener?.isConnected && !document.querySelector('dialog[open]') && opener.getClientRects().length) opener.focus({ preventScroll: true });
      });
    };
  }, []);
  return <dialog ref={ref} className={`ui-dialog ${className}`.trim()} aria-labelledby={titleId}
    onClose={() => { if (!ref.current?.open) requestClose(); }} onCancel={event => { event.preventDefault(); requestClose(); }}
    onPointerDown={event => { press.current = dismissOnBackdrop && event.isPrimary && event.button === 0 && event.target === event.currentTarget && outside(event.currentTarget, event.clientX, event.clientY); }}
    onPointerCancel={() => { press.current = false; }}
    onClick={event => {
      const dismiss = press.current && event.detail > 0 && event.target === event.currentTarget && outside(event.currentTarget, event.clientX, event.clientY);
      press.current = false;
      if (dismiss) requestClose();
    }}>
    <header className="ui-dialog-header"><h2 id={titleId}>{title}</h2><button type="button" className="ui-close-button" aria-label={closeLabel ?? t('modal.close', { title })} onClick={requestClose}>×</button></header>
    <div className="ui-dialog-body">{children}</div>
    {footer && <footer className="ui-dialog-footer">{footer}</footer>}
  </dialog>;
}
