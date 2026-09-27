import { useLayoutEffect, useRef, type HTMLAttributes, type ReactNode } from 'react';
import { usePageMemory } from '../shell/PageState.js';
import type { WorkPage } from '../shell/navigation.js';

export function PageToolbar({ children, className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={`ui-page-toolbar ${className}`.trim()}>{children}</div>;
}
export function PageBody({ children, className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={`ui-page-body ${className}`.trim()}>{children}</div>;
}
export function ScrollRegion({ memoryKey, children, className = '' }: { memoryKey: string; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null), memory = usePageMemory();
  useLayoutEffect(() => {
    const element = ref.current!, saved = memory?.get(`scroll:${memoryKey}`) as { left: number; top: number } | undefined;
    if (saved) { element.scrollLeft = saved.left; element.scrollTop = saved.top; }
  }, [memory, memoryKey]);
  return <div ref={ref} className={`ui-scroll-region ${className}`.trim()} onScroll={event => {
    const element = event.currentTarget;
    memory?.set(`scroll:${memoryKey}`, { left: element.scrollLeft, top: element.scrollTop });
  }}>{children}</div>;
}
/** Work pages occupy the shell, never the browser's modal top layer. */
export function PageFrame({ page, title, children, layout = 'workspace', toolbar }: {
  page: WorkPage; title: string; children: ReactNode;
  layout?: 'workspace' | 'tree'; toolbar?: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (!document.querySelector('dialog[open]')) ref.current?.focus({ preventScroll: true });
  }, [page]);
  return <main ref={ref} className={`ui-page ui-page--${layout} ${layout === 'tree' ? 'organization-workspace' : ''}`.trim()} tabIndex={-1} data-page={page} data-testid={`page-${page}`} aria-label={title}>
    {toolbar && <PageToolbar>{toolbar}</PageToolbar>}
    <PageBody>{layout === 'tree' ? children : <ScrollRegion memoryKey={page}>{children}</ScrollRegion>}</PageBody>
  </main>;
}
