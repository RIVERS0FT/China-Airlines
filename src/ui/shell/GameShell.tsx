import type { ReactNode } from 'react';
import type { Page } from './navigation.js';

export function GameShell({ page, training, header, navigation, children }: {
  page: Page; training: boolean; header: ReactNode; navigation: ReactNode; children: ReactNode;
}) {
  return <div className={`aviation-game ${page === 'dispatch' ? 'dispatch-focused' : ''} ${page === 'map' ? 'map-browse' : ''} ${training ? 'training-active' : ''}`} data-active-page={page}>
    {header}{children}{navigation}
  </div>;
}
/** Native dialogs retain GameViewport's top-layer scale and safe-area geometry. */
export function OverlayHost({ children }: { children: ReactNode }) {
  return <div className="ui-overlay-host">{children}</div>;
}
