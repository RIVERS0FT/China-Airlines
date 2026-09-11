import { useEffect } from 'react';
import { useGame } from '../runtime.js';

/** Native dialogs sit above overlays. Release them when this tab loses write ownership. */
export function SaveConflictGuard() {
  const blocked = useGame(state => state.blocked);
  useEffect(() => {
    if (blocked) {
      for (const dialog of document.querySelectorAll<HTMLDialogElement>('dialog[open]')) dialog.close();
    }
  }, [blocked]);
  return null;
}
