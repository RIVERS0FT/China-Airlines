import type { ReactNode } from 'react';
import { GameDialog } from './components/GameDialog.js';

/** Route-specific presentation, shared native-dialog behavior. */
export function DispatchDialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return <GameDialog title={title} onClose={onClose} className="dispatch-dialog" dismissOnBackdrop>
    <div className="dispatch-dialog-content">{children}</div>
  </GameDialog>;
}
