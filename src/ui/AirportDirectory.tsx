import type { ContinentFilter } from './airport-search.js';
import { useEffect, useId, useRef } from 'react';
import { AIRPORTS, CONTINENTS } from '../core/catalog.js';
import type { GameState } from '../core/game.js';
import { airportDirectory, type AirportFilter } from './airport-presentation.js';
import { useAirportDirectoryState } from './airport-directory-state.js';
import { money } from './Panels.js';
import './browse-ux.css';

export function AirportDirectory({ game, onInspect }: { game: GameState; onInspect: (id: string) => void }) {
  const filter = useAirportDirectoryState(s => s.filter), search = useAirportDirectoryState(s => s.search);
  const root = useRef<HTMLElement>(null), input = useRef<HTMLInputElement>(null), listId = useId();
  const continent = useAirportDirectoryState(s => s.continent);
  const rows = airportDirectory(game, filter, search, continent);

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
      <div role="group" aria-label="机场筛选" className="airport-filters">
        {(['open', 'locked', 'all'] as const).map(kind => <button key={kind} type="button" aria-pressed={filter === kind} onClick={() => changeFilter(kind)}>
          {kind === 'open' ? `已开放 ${game.airports.length}` : kind === 'locked' ? `未开放 ${AIRPORTS.length - game.airports.length}` : `全部 ${AIRPORTS.length}`}
        </button>)}
      </div>
      <div className="browse-search-field">
        <label htmlFor={`${listId}-search`}>查找机场</label>
        <div className="browse-search-control">
          <input ref={input} id={`${listId}-search`} type="search" aria-label="搜索机场" aria-controls={listId} placeholder="城市、机场代码或区域" autoComplete="off" spellCheck={false} value={search} onChange={e => changeSearch(e.target.value)}/>
          <button type="button" aria-label="清空机场搜索" disabled={!search} onClick={clearSearch}>清空</button>
        </div>
      </div>
    </div>
    <label className="airport-world-filter">世界区域<select aria-label="机场世界区域" value={continent} onChange={e => { useAirportDirectoryState.getState().setContinent(e.target.value as ContinentFilter); toTop(); }}>
      <option value="all">全球全部区域</option>{CONTINENTS.map(c => <option key={c} value={c}>{c}</option>)}
    </select></label>
    <p className="airport-explanation">先查看各地客货与停靠飞机，再决定去哪里装载。不必先把飞机飞到该机场。</p>
    <p role="status" aria-live="polite" aria-atomic="true" className="browse-result-summary">
      {rows.length ? `找到 ${rows.length} 座${filter === 'open' ? '已开放' : filter === 'locked' ? '未开放' : ''}机场` : '没有符合条件的机场。更换筛选或清除搜索后重试。'}
    </p>
    <div id={listId} className="airport-cards" role="list" aria-label="机场列表">
      {rows.map(a => <div role="listitem" key={a.id}><button type="button" className={`airport-card${a.level ? '' : ' is-locked'}`} data-airport-id={a.id} data-testid={`airport-card-${a.id}`} onClick={() => inspect(a.id)} aria-label={`查看${a.city}机场`}>
        <span className="airport-code-badge">{a.id}</span><span className="airport-card-title"><strong>{a.city}航空港</strong><small>{a.continent} · {a.region} · {a.level ? `${a.level} 级` : '未开放'}</small></span>
        {a.level ? <span className="airport-card-facts"><span>候运 {a.passengers} 人 / {a.cargo} 吨 · 中转 {a.transfers} 单</span><span>停靠 {a.parked.length} 架 · 飞来 {a.incoming.length} 班</span></span>
          : <span className="airport-card-facts">解锁费用 {money(a.price)}<small>未开放机场没有候运客货</small></span>}
        <span className="airport-card-link">查看机场 ›</span>
      </button></div>)}
    </div>
    {!rows.length && <div className="airport-empty browse-empty-actions">
      <button type="button" onClick={showAll}>查看全部机场</button>
      {search && <button type="button" onClick={clearSearch}>仅清除搜索</button>}
    </div>}
  </section>;
}
