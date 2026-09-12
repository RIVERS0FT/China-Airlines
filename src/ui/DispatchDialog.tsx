import { useEffect, useRef, type ReactNode } from 'react';

function outside(dialog: HTMLDialogElement, x: number, y: number) {
  const bounds = dialog.getBoundingClientRect();
  return x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom;
}

/** Local overlays leave the mounted map and its camera intact. Native dialog
 * supplies focus containment; closing never sends an economic command. */
export function DispatchDialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null), backdropPress = useRef(false);
  useEffect(() => {
    const dialog = ref.current!, opener = document.activeElement as HTMLElement | null;
    dialog.showModal();
    return () => {
      dialog.close();
      queueMicrotask(() => {
        if (opener?.isConnected && !document.querySelector('dialog[open]')) opener.focus({ preventScroll: true });
      });
    };
  }, []);
  return <dialog ref={ref} className="dispatch-dialog" aria-label={title}
    onCancel={e => { e.preventDefault(); onClose(); }}
    onPointerDown={e => {
      backdropPress.current = e.isPrimary && e.button === 0 && e.target === e.currentTarget && outside(e.currentTarget, e.clientX, e.clientY);
    }}
    onPointerCancel={() => { backdropPress.current = false; }}
    onClick={e => {
      const dismiss = backdropPress.current && e.detail > 0 && e.target === e.currentTarget && outside(e.currentTarget, e.clientX, e.clientY);
      backdropPress.current = false;
      if (dismiss) onClose();
    }}>
    <header><h2>{title}</h2><button type="button" aria-label={`关闭${title}`} onClick={onClose}>×</button></header>
    <div className="dispatch-dialog-content">{children}</div>
  </dialog>;
}
