import { useEffect } from 'react';
import { guideStep } from '../core/onboarding.js';
import type { GameState, Plane } from '../core/game.js';
import { controller } from '../runtime.js';
import { ignore } from './Panels.js';
import './tutorial-layout.css';
import { useI18n } from '../i18n/I18n.js';
export function Tutorial({ game, plane, screen, destination, busy, onLocate }: {
  game: GameState; plane: Plane; screen: 'airport' | 'map'; destination: string; busy: boolean;
  onLocate: (screen: 'airport' | 'map' | 'tasks') => void;
}) {
  const step = guideStep(game, plane, screen, destination);
  const { ui } = useI18n();
  useEffect(() => {
    const target = document.querySelector<HTMLElement>(step.target);
    target?.classList.add('tutorial-target');
    return () => target?.classList.remove('tutorial-target');
  }, [step.target, screen]);
  function locate() {
    onLocate(step.screen);
    if (screen === step.screen) document.querySelector<HTMLElement>(step.target)?.focus({ preventScroll: true });
  }
  return <section className="tutorial-strip" role="region" aria-label={ui('起航引导')} data-testid="tutorial" data-step={step.id}>
    <span className="guide-number" aria-hidden="true">{step.number}/6</span><div className="guide-copy"><strong aria-live="polite">{ui(step.title)}</strong><p>{ui(step.text)}</p></div>
    {step.id === 'done' ? <button disabled={busy} onClick={() => ignore(controller.command({ type: 'tutorial', action: 'finish' }))}>{ui('完成引导')}</button> : <button disabled={busy} onClick={locate}>{ui(step.screen === 'tasks' ? '查看首航任务' : '定位操作')}</button>}
    <button className="guide-skip" disabled={busy} onClick={() => ignore(controller.command({ type: 'tutorial', action: 'skip' }))}>{ui('跳过引导')}</button>
  </section>;
}
