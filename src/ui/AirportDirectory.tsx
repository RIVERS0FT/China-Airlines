import { useState } from 'react';
import { AIRPORTS } from '../core/catalog.js';
import type { GameState } from '../core/game.js';
import { airportDirectory, type AirportFilter } from './airport-presentation.js';
import { money } from './Panels.js';

export function AirportDirectory({ game, onInspect }: { game: GameState; onInspect: (id: string) => void }) {
  const [filter, setFilter] = useState<AirportFilter>('open');
  const [search, setSearch] = useState('');
  const rows = airportDirectory(game, filter, search);
  return <section className="airport-directory">
    <div className="airport-directory-tools">
      <div role="group" aria-label="机场筛选" className="airport-filters">
        {(['open', 'locked', 'all'] as const).map(kind => <button key={kind} aria-pressed={filter === kind} onClick={() => setFilter(kind)}>
          {kind === 'open' ? `已开放 ${game.airports.length}` : kind === 'locked' ? `未开放 ${AIRPORTS.length - game.airports.length}` : `全部 ${AIRPORTS.length}`}
        </button>)}
      </div>
      <label>查找机场<input type="search" aria-label="搜索机场" placeholder="城市、机场代码或区域" value={search} onChange={e => setSearch(e.target.value)}/></label>
    </div>
    <p className="airport-explanation">先查看各地客货与停靠飞机，再决定去哪里装载。不必先把飞机飞到该机场。</p>
    <div className="airport-cards" role="list" aria-label="机场列表">
      {rows.map(a => <div role="listitem" key={a.id}><button className={`airport-card${a.level ? '' : ' is-locked'}`} data-testid={`airport-card-${a.id}`} onClick={() => onInspect(a.id)} aria-label={`查看${a.city}机场`}>
        <span className="airport-code-badge">{a.id}</span><span className="airport-card-title"><strong>{a.city}航空港</strong><small>{a.region} · {a.level ? `${a.level} 级` : '未开放'}</small></span>
        {a.level ? <span className="airport-card-facts"><span>候运 {a.passengers} 人 / {a.cargo} 吨 · 中转 {a.transfers} 单</span><span>停靠 {a.parked.length} 架 · 飞来 {a.incoming.length} 班</span></span>
          : <span className="airport-card-facts">解锁费用 {money(a.price)}<small>未开放机场没有候运客货</small></span>}
        <span className="airport-card-link">查看机场 ›</span>
      </button></div>)}
    </div>
    {!rows.length && <p role="status" className="airport-empty">没有符合条件的机场。更换筛选或清除搜索后重试。</p>}
  </section>;
}
