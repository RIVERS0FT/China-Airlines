import type { ContinentFilter } from './airport-search.js';
import { useEffect, useId, useRef } from 'react';
import { AIRPORTS, CONTINENTS } from '../core/catalog.js';
import type { GameState } from '../core/game.js';
import { airportDirectory, type AirportFilter } from './airport-presentation.js';
import { useAirportDirectoryState } from './airport-directory-state.js';
import './browse-ux.css';
import { useI18n } from '../i18n/I18n.js';

export function AirportDirectory({ game, onInspect }: { game: GameState; onInspect: (id: string) => void }) {
  const filter = useAirportDirectoryState(s => s.filter), search = useAirportDirectoryState(s => s.search);
  const root = useRef<HTMLElement>(null), input = useRef<HTMLInputElement>(null), listId = useId();
  const continent = useAirportDirectoryState(s => s.continent);
  const rows = airportDirectory(game, filter, search, continent);
  const { t, ui, money, airportName, airportRegion, continentName } = useI18n();

  useEffect(() => {
    const dialog = root.current?.closest('dialog');
    if (!dialog) return;
    const saved = useAirportDirectoryState.getState();
    let active = true, restored = false;
    const rememberScroll = () => {
      if (restored && dialog.open) useAirportDirectoryState.setState({ scrollTop: dialog.scrollTop });
    };
    dialog.addEventListener('scroll', rememberScroll, { passive: true });
    // The parent opens its native dialog in an effect. Restore after its autofocus,
    // without scrolling the inspected card underneath the sticky dialog header.
    queueMicrotask(() => {
      if (!active || !dialog.open) return;
      dialog.scrollTop = saved.scrollTop;
      if (saved.returnTo) {
        const card = Array.from(root.current?.querySelectorAll<HTMLButtonElement>('[data-airport-id]') ?? [])
          .find(button => button.dataset.airportId === saved.returnTo);
        (card ?? input.current)?.focus({ preventScroll: true });
      }
      restored = true;
    });
    return () => { active = false; dialog.removeEventListener('scroll', rememberScroll); };
  }, []);

  function toTop() { const dialog = root.current?.closest('dialog'); if (dialog) dialog.scrollTop = 0; }
  function changeFilter(value: AirportFilter) { useAirportDirectoryState.getState().setFilter(value); toTop(); }
  function changeSearch(value: string) { useAirportDirectoryState.getState().setSearch(value); toTop(); }
  function clearSearch() { changeSearch(''); input.current?.focus({ preventScroll: true }); }
  function showAll() { useAirportDirectoryState.getState().showAll(); toTop(); input.current?.focus({ preventScroll: true }); }
  function inspect(id: string) {
    useAirportDirectoryState.setState({ returnTo: id, scrollTop: root.current?.closest('dialog')?.scrollTop ?? 0 });
    onInspect(id);
  }

  return <section ref={root} className="airport-directory">
    <div className="airport-directory-tools">
      <div role="group" aria-label={ui('机场筛选')} className="airport-filters">
        {(['open', 'locked', 'all'] as const).map(kind => <button key={kind} type="button" aria-pressed={filter === kind} onClick={() => changeFilter(kind)}>
          {kind === 'open' ? ui('已开放 {count}', { count:game.airports.length }) : kind === 'locked' ? ui('未开放 {count}', { count:AIRPORTS.length - game.airports.length }) : ui('全部 {count}', { count:AIRPORTS.length })}
        </button>)}
      </div>
      <div className="browse-search-field">
        <label htmlFor={`${listId}-search`}>{ui('查找机场')}</label>
        <div className="browse-search-control">
          <input ref={input} id={`${listId}-search`} type="search" aria-label={ui('搜索机场')} aria-controls={listId} placeholder={ui('城市或区域')} autoComplete="off" spellCheck={false} value={search} onChange={e => changeSearch(e.target.value)}/>
          <button type="button" aria-label={ui('清空机场搜索')} disabled={!search} onClick={clearSearch}>{ui('清空')}</button>
        </div>
      </div>
    </div>
    <label className="airport-world-filter">{ui('世界区域')}<select aria-label={ui('机场世界区域')} value={continent} onChange={e => { useAirportDirectoryState.getState().setContinent(e.target.value as ContinentFilter); toTop(); }}>
      <option value="all">{ui('全球全部区域')}</option>{CONTINENTS.map(c => <option key={c} value={c}>{continentName(c)}</option>)}
    </select></label>
    <p className="airport-explanation">{ui('先查看各地客货与停靠飞机，再决定去哪里装载。不必先把飞机飞到该机场。')}</p>
    <p role="status" aria-live="polite" aria-atomic="true" className="browse-result-summary">
      {rows.length ? ui('找到 {count} 座{kind}机场', { count:rows.length, kind:filter === 'open' ? (ui('已开放 {count}', {count:''}).trim()) : filter === 'locked' ? (ui('未开放 {count}', {count:''}).trim()) : '' }) : ui('没有符合条件的机场。更换筛选或清除搜索后重试。')}
    </p>
    <div id={listId} className="airport-cards" role="list" aria-label={ui('机场列表')}>
      {rows.map(a => <div role="listitem" key={a.id}><button type="button" className={`airport-card${a.level ? '' : ' is-locked'}`} data-airport-id={a.id} data-testid={`airport-card-${a.id}`} onClick={() => inspect(a.id)} aria-label={ui('查看{city}机场',{city:airportName(a.id,a.city)})}>
        <span className="airport-card-title"><strong>{t('airport.name',{city:airportName(a.id,a.city)})}</strong><small>{continentName(a.continent)} · {airportRegion(a.id,a.region)} · {a.level ? t('common.level', {value:a.level}) : ui('未开放')}</small></span>
        {a.level ? <span className="airport-card-facts"><span>{ui('候运 {passengers} 人 / {cargo} 吨 · 中转 {transfers} 单',{passengers:a.passengers,cargo:a.cargo,transfers:a.transfers})}</span><span>{ui('停靠 {parked} 架 · 飞来 {incoming} 班',{parked:a.parked.length,incoming:a.incoming.length})}</span></span>
          : <span className="airport-card-facts">{ui('解锁费用 {price}',{price:money(a.price)})}<small>{ui('未开放机场没有候运客货')}</small></span>}
        <span className="airport-card-link">{ui('查看机场 ›')}</span>
      </button></div>)}
    </div>
    {!rows.length && <div className="airport-empty browse-empty-actions">
      <button type="button" onClick={showAll}>{ui('查看全部机场')}</button>
      {search && <button type="button" onClick={clearSearch}>{ui('仅清除搜索')}</button>}
    </div>}
  </section>;
}
