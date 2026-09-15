import { useState, type ReactNode } from "react";
import { aircraftSpecs, airport, MODELS } from "../core/catalog.js";
import {
  BUILDINGS,
  MATERIALS,
  WORKSHOP_MATERIALS,
  RECIPES,
  type Material,
  type Building,
} from "../core/career-catalog.js";
import {
  careerLevel,
  warehouseUsed,
  warehouseCapacity,
} from "../core/career.js";
import { planQuote, type GameState, type Command } from "../core/game.js";
import { controller, useGame } from "../runtime.js";
import { artAsset } from "./art-assets.js";
import { duration, money, ignore, Icon } from "./Panels.js";
import "./career.css";
import { useI18n } from "../i18n/I18n.js";

const tabs = [
  "机体工坊",
  "物流园",
  "物资商店",
  "航空展馆",
  "机场运营",
] as const;
type Tab = (typeof tabs)[number];
export function CareerHub({
  game,
  busy,
  selected,
  airportId,
}: {
  game: GameState;
  busy: boolean;
  selected?: string;
  airportId: string;
}) {
  const [tab, setTab] = useState<Tab>("机体工坊"),
    [planeId, setPlaneId] = useState(selected ?? game.fleet[0]!.id),
    [city, setCity] = useState(airportId);
  const [material, setMaterial] = useState<Material>("meal"),
    [count, setCount] = useState(1),
    [target, setTarget] = useState("PVG"),
    [assembly, setAssembly] = useState("swift-f"),
    [routeName, setRouteName] = useState("常用班次"),
    [stops, setStops] = useState<string[]>([]);
  const { ui, text, airportName, modelName } = useI18n();
  const c = game.career,
    view = useGame(),
    p = game.fleet.find((p) => p.id === planeId) ?? game.fleet[0]!,
    m = aircraftSpecs(p),
    local = game.airports.some((a) => a.id === city) ? city : "PEK";
  const to = game.airports.some((a) => a.id === target && a.id !== p.airportId)
    ? target
    : game.airports.find((a) => a.id !== p.airportId)!.id;
  const locked = !!(
    p.flight ||
    p.autoRouteId ||
    p.itinerary.length ||
    p.energy.serviceUntil !== null ||
    p.readyAt > game.simTime
  );
  const send = (cmd: Command) => ignore(controller.command(cmd));
  const action = (label: ReactNode, cmd: Command, disabled = false) => (
    <button
      key={JSON.stringify(cmd)}
      disabled={busy || disabled}
      onClick={() => send(cmd)}
    >
      {typeof label === "string" ? ui(label) : label}
    </button>
  );
  const citySelect = (
    value: string,
    change: (id: string) => void,
    label: string,
    except = "",
  ) => (
    <label>
      {ui(label)}
      <select
        aria-label={ui(label)}
        value={value}
        onChange={(e) => change(e.target.value)}
      >
        {game.airports
          .filter((a) => a.id !== except)
          .map((a) => (
            <option key={a.id} value={a.id}>
              {airportName(a.id,airport(a.id).city)} · {a.level} {ui("级")}
            </option>
          ))}
      </select>
    </label>
  );
  const bag = c.warehouses[local];
  function savedFlight(stations: string[]) {
    if (stations[0] !== p.airportId) return "飞机不在起点";
    try {
      planQuote(game, p, stations.slice(1));
      return "";
    } catch (e) {
      return e instanceof Error ? e.message : "无法飞行";
    }
  }
  return (
    <section className="career-hub">
      <div className="career-banner">
        <img src={artAsset("pilot-avatar-v1.png")} alt="" />
        <div>
          <strong>{ui("公司 Lv.{level} · 从一架飞机到全球航网",{level:careerLevel(game)})}</strong>
          <span>
            {ui("经验 {xp} · 营业第 {day} 天 · {time} 后刷新",{xp:c.xp,day:c.day+1,time:duration(c.nextDayAt-game.simTime)})}
          </span>
        </div>
        <b>
          <Icon name="coin" />
          {money(game.credits)}
          <small>{ui("点券 {count}",{count:c.tickets})}</small>
        </b>
      </div>
      <div className="career-tabs" role="tablist" aria-label={ui("经营中心栏目")}>
        {tabs.map((t) => (
          <button
            role="tab"
            aria-selected={tab === t}
            key={t}
            onClick={() => setTab(t)}
          >
            {ui(t)}
          </button>
        ))}
      </div>
      <div className="career-feedback" aria-live="polite">
        {view.error ? (
          <span role="alert">{text(view.error)}</span>
        ) : view.notice ? (
          <span role="status">{text(view.notice)}</span>
        ) : (
          <span>{ui("运输、收藏与生产共同推动公司成长。")}</span>
        )}
      </div>
      <div role="tabpanel" aria-label={ui(tab)} className="career-body">
        {tab === "机体工坊" && (
          <>
            <label>
              当前飞机
              <select
                aria-label="工坊飞机"
                value={p.id}
                onChange={(e) => setPlaneId(e.target.value)}
              >
                {game.fleet.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.id} · {modelName(p.modelId,aircraftSpecs(p).name)}
                  </option>
                ))}
              </select>
            </label>
            <div className="career-aircraft">
              <img src={artAsset(m.art)} alt={m.name} />
              <div>
                <h3>{modelName(p.modelId,m.name)}</h3>
                <p>
                  {m.seats} 客位 / {m.cargo} 货位 · {m.energy} 电力
                </p>
                <p>
                  编队 {p.tuning.group}/6 · 进化 {p.tuning.evolution}/20 · 动力{" "}
                  {p.tuning.power + 1}/100
                </p>
                <small>
                  成长需卸空停稳；编队与进化消耗金币、点券和机身/动力组件。
                </small>
              </div>
            </div>
            <div className="career-actions">
              {(["group-plane", "evolve-plane", "power-upgrade"] as const).map(
                (type, i) =>
                  action(
                    `${["提升编队", "机体进化", "提升电力"][i]} · ${(p.tuning[(["group", "evolution", "power"] as const)[i]!] + 1) * 500}金币＋${(p.tuning[(["group", "evolution", "power"] as const)[i]!] + 1) * 2}券`,
                    { type, planeId: p.id },
                    locked,
                  ),
              )}
              {action(
                "封存飞机",
                { type: "store-plane", planeId: p.id },
                locked || game.fleet.length <= 1,
              )}
              {action(
                "安装冷链货舱",
                { type: "specialize-plane", planeId: p.id, special: "cold" },
                locked || !m.cargo || p.tuning.special === "cold",
              )}
              {action(
                "安装工业货舱",
                {
                  type: "specialize-plane",
                  planeId: p.id,
                  special: "industrial",
                },
                locked || !m.cargo || p.tuning.special === "industrial",
              )}
              {action(
                "恢复普通货舱",
                { type: "specialize-plane", planeId: p.id, special: "none" },
                locked || p.tuning.special === "none",
              )}
            </div>
            <p>
              当前货舱：
              {p.tuning.special === "none"
                ? "普通"
                : p.tuning.special === "cold"
                  ? "冷链"
                  : "工业"}
              。专业改装费用 1,800 金币、4 点券、3 合金、1
              图纸。编队收益和成本均按 2 的等级次方增长；进化每级增加5%收入。
            </p>
            <h3>零件组装</h3>
            <div className="career-form">
              <label>
                组装机型
                <select
                  aria-label="组装机型"
                  value={assembly}
                  onChange={(e) => setAssembly(e.target.value)}
                >
                  {MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} · 公司Lv.{m.rank}
                    </option>
                  ))}
                </select>
              </label>
              {citySelect(local, setCity, "组装交付机场")}
              {action("组装飞机", {
                type: "assemble-plane",
                modelId: assembly,
                airportId: local,
              })}
            </div>
            <p>
              消耗机身、动力、机翼组件各“机场需求等级”件，图纸1张，另付机价30%及等级×2点券。
            </p>
            <h3>封存仓库 · {c.stored.length} 架</h3>
            {!c.stored.length && (
              <p>先将卸空的飞机封存，可恢复、拆解或移交展馆。</p>
            )}
            {c.stored.map((p) => (
              <div className="career-row" key={p.id}>
                <div>
                  <strong>
                    {aircraftSpecs(p).name} · {p.id}
                  </strong>
                  <small>拆解返还四类组件各 {1 + p.tuning.group} 件</small>
                </div>
                <div className="career-actions">
                  {action(
                    "恢复服役",
                    { type: "restore-plane", planeId: p.id },
                    game.fleet.length >= game.hangarSlots,
                  )}
                  <button
                    disabled={busy}
                    onClick={() => {
                      if (
                        window.confirm(`拆解 ${p.id}？飞机将消耗并转为零件。`)
                      )
                        send({ type: "dismantle-plane", planeId: p.id });
                    }}
                  >
                    拆解零件
                  </button>
                </div>
              </div>
            ))}
          </>
        )}
        {tab === "物流园" && (
          <>
            <div className="logistics-scene" aria-label="物流园设施">
              {(Object.entries(BUILDINGS) as [Building, string][]).map(
                ([id, name]) => (
                  <button
                    key={id}
                    disabled={busy || c.buildings[id] >= 10}
                    onClick={() =>
                      send({ type: "build-facility", building: id })
                    }
                  >
                    <img src={artAsset(`facility-${id}-v2.png`)} alt="" />
                    <strong>
                      {name} Lv.{c.buildings[id]}
                    </strong>
                    <small>
                      {c.buildings[id] >= 10
                        ? "已满级"
                        : `${1000 * (c.buildings[id] + 1)}金币 / ${c.buildings[id]}券 / ${c.buildings[id] * 2}合金`}
                    </small>
                  </button>
                ),
              )}
            </div>
            {citySelect(local, setCity, "当地仓库")}
            <p>
              仓容 {warehouseUsed(game, local)} / {warehouseCapacity(game)}
              （含在途与生产预留）
            </p>
            <div className="material-strip">
              {(Object.entries(MATERIALS) as [Material, string][]).map(
                ([id, name]) => (
                  <span key={id}>
                    {name}
                    <b>{bag?.[id] ?? 0}</b>
                  </span>
                ),
              )}
            </div>
            <div className="career-actions">
              {(["frame", "engine", "wing", "alloy"] as const).map((k) =>
                action(
                  `调入工坊：${MATERIALS[k]}1件`,
                  {
                    type: "withdraw-material",
                    material: k,
                    count: 1,
                    airportId: local,
                  },
                  !bag?.[k],
                ),
              )}
            </div>
            <h3>原料采购</h3>
            <p>
              每种原料当地每日限购30份，35金币/份。首次采购同时取得当日经营许可，费用200金币。
            </p>
            <div className="career-actions">
              {(["alloy", "fabric", "food", "electronics"] as const).map((k) =>
                action(`采购5份${MATERIALS[k]}`, {
                  type: "purchase-resource",
                  material: k,
                  count: 5,
                  airportId: local,
                }),
              )}
            </div>
            <h3>工厂生产</h3>
            <div className="career-quests">
              {RECIPES.map((r) => (
                <article key={r.id}>
                  <h4>
                    {r.name} × {r.amount}
                  </h4>
                  <p>
                    {Object.entries(r.inputs)
                      .map(([k, n]) => `${MATERIALS[k as Material]}${n}`)
                      .join("＋")}{" "}
                    · {r.fee}金币 ·{" "}
                    {duration(
                      Math.ceil(r.seconds / (1 + c.buildings.factory * 0.1)),
                    )}
                  </p>
                  {action(
                    `生产${r.name}`,
                    {
                      type: "produce",
                      recipe: r.id,
                      airportId: local,
                      count: 1,
                    },
                    !c.buildings.factory || c.production.length >= 3,
                  )}
                </article>
              ))}
            </div>
            {c.production.map((j) => (
              <p key={j.id}>
                {airport(j.airportId).city} ·{" "}
                {RECIPES.find((r) => r.id === j.recipe)!.name} · 剩余{" "}
                {duration(j.finishAt - game.simTime)}
              </p>
            ))}
            <h3>物资装机运输</h3>
            <p>
              使用 {p.id}（停靠{airport(p.airportId).city}
              ）当地库存；抵达后进入目的地仓库，不产生虚构运费。
            </p>
            <div className="career-form">
              <label>
                承运飞机
                <select
                  aria-label="承运飞机"
                  value={p.id}
                  onChange={(e) => setPlaneId(e.target.value)}
                >
                  {game.fleet.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.id} · {aircraftSpecs(p).name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                运输物资
                <select
                  aria-label="运输物资"
                  value={material}
                  onChange={(e) => setMaterial(e.target.value as Material)}
                >
                  {(Object.entries(MATERIALS) as [Material, string][]).map(
                    ([id, n]) => (
                      <option key={id} value={id}>
                        {n}
                      </option>
                    ),
                  )}
                </select>
              </label>
              <label>
                数量
                <input
                  aria-label="运输数量"
                  type="number"
                  min="1"
                  max="100"
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value))}
                />
              </label>
              {citySelect(to, setTarget, "物资目的地", p.airportId)}
              {action(
                "物资装机",
                {
                  type: "transport-resource",
                  planeId: p.id,
                  to,
                  material,
                  count,
                },
                locked,
              )}
            </div>
            <p>装载后返回机场“制定路线”；可随航中转，最终目的地才入库。</p>
            <h3>研发与贸易</h3>
            <div className="career-actions">
              {action(
                "设计图纸 · 300金币＋1券",
                { type: "design-blueprint" },
                !c.buildings.design,
              )}
              {action(
                "开展研究 · 300金币＋1券",
                { type: "research" },
                !c.buildings.research,
              )}
              {action(
                "每日贸易 · 交付3份餐食",
                { type: "claim-trade", airportId: local, weekly: false },
                !c.buildings.trade,
              )}
              {action(
                "每周贸易 · 交付4份精密货品",
                { type: "claim-trade", airportId: local, weekly: true },
                !c.buildings.trade,
              )}
            </div>
            <p>
              贸易只收取从其他机场运入的货品；日单奖励1,000金币＋5券，周单奖励2,500金币＋12券。研发与设计每天各可使用“设施等级×3”次。
            </p>
          </>
        )}
        {tab === "物资商店" && (
          <>
            <p>
              每种材料每天限购20件；组件与图纸每件400金币＋1点券，其余每件80金币。材料可用于机体成长和设施建设。
            </p>
            <div className="career-quests">
              {(Object.entries(MATERIALS) as [Material, string][])
                .filter(([id]) => WORKSHOP_MATERIALS.includes(id))
                .map(([id, name]) => (
                  <article key={id}>
                    <h3>{name}</h3>
                    <p>
                      库存 {c.inventory[id]} · 今日剩余{" "}
                      {20 - (c.dailyBought[id] ?? 0)}
                    </p>
                    {action(
                      "兑换1件",
                      { type: "career-supply", material: id, count: 1 },
                      (c.dailyBought[id] ?? 0) >= 20,
                    )}
                  </article>
                ))}
            </div>
            <h3>经营投资</h3>
            {c.investment ? (
              <div className="career-row">
                <p>
                  本金 {money(c.investment.amount)} ·{" "}
                  {c.investment.finishAt > game.simTime
                    ? `剩余${duration(c.investment.finishAt - game.simTime)}`
                    : "已到期，可领取本金与5%收益"}
                </p>
                {action(
                  "领取投资本息",
                  { type: "collect-investment" },
                  c.investment.finishAt > game.simTime,
                )}
              </div>
            ) : (
              <div className="career-actions">
                {[1000, 5000, 10000].map((amount) =>
                  action(`存入 ${money(amount)} · 1小时`, {
                    type: "invest",
                    amount,
                  }),
                )}
              </div>
            )}
          </>
        )}
        {tab === "航空展馆" && (
          <>
            <div className="museum-hall">
              <Icon name="trophy" />
              <h3>航空收藏馆 · {c.museum.length} 种机型</h3>
              <p>
                收藏成就 Lv.{c.achievement}，永久增加 {c.achievement * 5}%
                运输经验。
              </p>
              {action(
                "激活下一等级成就",
                { type: "activate-achievement" },
                c.achievement >= 6 || c.museum.length <= c.achievement,
              )}
              <small>
                需展品数达到下一等级，费用等级×1,000金币、5点券、1研发图纸。
              </small>
            </div>
            <div className="career-quests">
              {c.museum.map((id) => (
                <article key={id}>
                  <img
                    className="museum-aircraft"
                    src={artAsset(
                      aircraftSpecs({
                        modelId: id,
                        upgrades: {
                          capacity: 0,
                          engine: 0,
                          range: 0,
                          efficiency: 0,
                        },
                      }).art,
                    )}
                    alt=""
                  />
                  <h4>
                    {
                      aircraftSpecs({
                        modelId: id,
                        upgrades: {
                          capacity: 0,
                          engine: 0,
                          range: 0,
                          efficiency: 0,
                        },
                      }).name
                    }
                  </h4>
                </article>
              ))}
            </div>
            <h3>移交封存飞机</h3>
            <p>
              每种机型仅一次。消耗封存飞机与1,000金币，获得15点券、100公司经验。
            </p>
            {c.stored.map((p) => (
              <div className="career-row" key={p.id}>
                <strong>
                  {aircraftSpecs(p).name} · {p.id}
                </strong>
                <button
                  disabled={busy || c.museum.includes(p.modelId)}
                  onClick={() => {
                    if (
                      window.confirm(
                        `将 ${p.id} 永久移交展馆？这架飞机将不再参与运营。`,
                      )
                    )
                      send({ type: "museum-donate", planeId: p.id });
                  }}
                >
                  {c.museum.includes(p.modelId) ? "已收藏" : "移交展馆"}
                </button>
              </div>
            ))}
          </>
        )}
        {tab === "机场运营" && (
          <>
            {game.airports.map((a) => (
              <div className="career-row" key={a.id}>
                <div>
                  <h3>
                    {airport(a.id).city} · {a.level}级
                  </h3>
                  <small>
                    {c.demandOff.includes(a.id) ? "客流关闭" : "客流开放"} ·{" "}
                    {(c.promotions[a.id] ?? 0) > game.simTime
                      ? `宣传剩余${duration(c.promotions[a.id]! - game.simTime)}`
                      : "可宣传增加客货供给"}
                  </small>
                </div>
                <div className="career-actions">
                  {action(
                    c.demandOff.includes(a.id) ? "开放客流" : "关闭客流",
                    {
                      type: "airport-demand",
                      airportId: a.id,
                      enabled: c.demandOff.includes(a.id),
                    },
                  )}
                  {action(
                    `刷新客货 · ${(c.dailyBought[`refresh-${a.id}`] ?? 0) < 10 ? "免费" + (10 - (c.dailyBought[`refresh-${a.id}`] ?? 0)) + "次" : "1点券"}`,
                    { type: "refresh-demand", airportId: a.id },
                    c.demandOff.includes(a.id) ||
                      (c.dailyBought[`refresh-${a.id}`] ?? 0) >= 30,
                  )}
                  {action("宣传1小时 · 500金币", {
                    type: "promote-airport",
                    airportId: a.id,
                  })}
                  <button
                    disabled={busy || ["PEK", "PVG"].includes(a.id)}
                    onClick={() => {
                      if (
                        window.confirm(
                          `关闭${airport(a.id).city}机场并退还30%开通费？需要先迁出飞机和已接受订单、清空仓库。`,
                        )
                      )
                        send({ type: "close-airport", airportId: a.id });
                    }}
                  >
                    关闭机场
                  </button>
                </div>
              </div>
            ))}
            <h3>保存常用路线</h3>
            <p>
              从起点开始添加站点，最多13站。使用 {p.id}{" "}
              发航；反向路线要求飞机位于末站。
            </p>
            <div className="career-form">
              <label>
                路线名称
                <input
                  aria-label="路线名称"
                  maxLength={24}
                  value={routeName}
                  onChange={(e) => setRouteName(e.target.value)}
                />
              </label>
              <label>
                添加站点
                <select
                  aria-label="添加保存路线站点"
                  value=""
                  onChange={(e) => {
                    if (e.target.value) setStops([...stops, e.target.value]);
                  }}
                >
                  <option value="">选择城市</option>
                  {game.airports.map((a) => (
                    <option key={a.id} value={a.id}>
                      {airport(a.id).city}
                    </option>
                  ))}
                </select>
              </label>
              <button
                onClick={() => setStops(stops.slice(0, -1))}
                disabled={!stops.length}
              >
                撤销站点
              </button>
              {action(
                "保存路线",
                { type: "save-route", name: routeName, stops },
                stops.length < 2 || stops.length > 13,
              )}
            </div>
            <p>
              {stops.map((id) => airport(id).city).join(" → ") ||
                "请添加起点与目的地"}
            </p>
            {c.savedRoutes.map((r, i) => (
              <article className="career-row" key={i}>
                <div>
                  <h4>{r.name}</h4>
                  <small>
                    {r.stops.map((id) => airport(id).city).join(" → ")}
                  </small>
                </div>
                <div className="career-actions">
                  {[r.stops, [...r.stops].reverse()].map((stations, index) => (
                    <button
                      key={index}
                      disabled={
                        busy || locked || Boolean(savedFlight(stations))
                      }
                      title={savedFlight(stations)}
                      onClick={() =>
                        send({
                          type: "dispatch-plan",
                          planeId: p.id,
                          stops: stations.slice(1),
                        })
                      }
                    >
                      {index ? "反向发航" : "正向发航"}
                    </button>
                  ))}
                  {action("删除", { type: "delete-route", index: i })}
                </div>
              </article>
            ))}
          </>
        )}
      </div>
    </section>
  );
}
