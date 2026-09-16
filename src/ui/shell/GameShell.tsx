import type { ReactNode } from 'react';
import type { Page } from './navigation.js';

export function GameShell({ page, training, modalOpen, header, navigation, children }: {
  page: Page; training: boolean; modalOpen: boolean; header: ReactNode; navigation: ReactNode; children: ReactNode;
}) {
  return <div className={`aviation-game ${page === 'dispatch' ? 'dispatch-focused' : ''} ${page === 'map' ? 'map-browse' : ''} ${training ? 'training-active' : ''}`} data-active-page={page} aria-hidden={modalOpen || undefined}>
    {header}{children}{navigation}
  </div>;
}
/** Native dialogs stay outside the hidden background and retain viewport scaling. */
export function OverlayHost({ children }: { children: ReactNode }) {
  return <div className="ui-overlay-host">{children}</div>;
}
