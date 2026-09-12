import { useEffect, useRef, type ReactNode } from 'react';

/** Local overlays leave the mounted map and its camera intact. Native dialog
 * supplies focus containment; closing never sends an economic command. */
export function DispatchDialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
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
  return <dialog ref={ref} className="dispatch-dialog" aria-label={title} onCancel={e => { e.preventDefault(); onClose(); }}>
    <header><h2>{title}</h2><button aria-label={`关闭${title}`} onClick={onClose}>×</button></header>
    <div className="dispatch-dialog-content">{children}</div>
  </dialog>;
}
