import { describe, it, expect } from "vitest";
import {
  GameCore,
  quote,
  legQuote,
  flightEnergy,
  validateSave,
  manifest,
  energyCapacity,
  type Command,
  type GameState,
} from "../src/core/game.js";
import { GameCore as V6Core } from "../src/core/save-v6.js";
import { aircraftSpecs, MODELS, distance } from "../src/core/catalog.js";
import {
  inventory,
  warehouseUsed,
  warehouseCapacity,
} from "../src/core/career.js";
const NOW = 1800000000000,
  ID = "AC0001";
function rich() {
  const s = new GameCore(NOW).snapshot();
  s.credits = 1e7;
  s.career.tickets = 1e6;
  s.career.xp = 20000;
  for (const k of Object.keys(s.career.inventory))
    s.career.inventory[k as keyof typeof s.career.inventory] = 100;
  return new GameCore(NOW, s);
}
function cmd(c: GameCore, command: Command) {
  const s = c.snapshot();
  c.execute(command, s.lastWallTime);
  expect(validateSave(c.snapshot())).toEqual(c.snapshot());
}
function wait(c: GameCore, seconds: number) {
  c.tick(c.snapshot().lastWallTime + seconds * 1000);
  expect(validateSave(c.snapshot())).toEqual(c.snapshot());
}
function unchanged(c: GameCore, command: Command) {
  const s = c.snapshot();
  expect(() => c.execute(command, s.lastWallTime)).toThrow();
  expect(c.snapshot()).toEqual(s);
}
describe("v7 economy and historical contracts", () => {
  it("starts without gems and offers twelve distinct role models", () => {
    const s = new GameCore(NOW).snapshot();
    expect(s.version).toBe(7);
    expect(s.credits).toBe(18000);
    expect(s.career.tickets).toBe(24);
    expect(JSON.stringify(s)).not.toMatch(/gem|diamond/);
    expect(MODELS).toHaveLength(12);
    expect(aircraftSpecs(s.fleet[0]!)).toMatchObject({
      seats: 3,
      cargo: 2,
      energy: 200,
    });
    expect(validateSave(s)).toEqual(s);
  });
  it("locks observed base fare, aviation duration, cost, minimum energy and full destination bonus", () => {
    const c = new GameCore(NOW);
    cmd(c, { type: "load-destination", planeId: ID, to: "PVG" });
    const s = c.snapshot(),
      p = s.fleet[0]!,
      d = Math.floor(distance("PEK", "PVG") / 4),
      q = quote(s, p, "PVG");
    expect(q.duration).toBe(Math.floor((d * 450) / 360));
    expect(q.cost).toBe(Math.floor((d * 220 * 360) / 400000));
    expect(q.revenue).toBe(
      Math.floor(manifest(s, ID).reduce((n, o) => n + o.reward, 0) * 1.25),
    );
    expect(flightEnergy(p, 30)).toBe(60);
    expect(flightEnergy(p, 119)).toBe(60);
    cmd(c, { type: "dispatch", planeId: ID, to: "PVG", auto: false });
    const departed = c.snapshot();
    wait(c, q.duration);
    expect(c.snapshot().credits).toBe(departed.credits + q.revenue);
    const arrived = c.snapshot();
    wait(c, 0);
    expect(c.snapshot()).toEqual(arrived);
  });
  it("preserves old v6 flights and exact energy on migration", () => {
    const old = new V6Core(NOW);
    old.execute({ type: "load-destination", planeId: ID, to: "PVG" }, NOW);
    old.execute({ type: "dispatch", planeId: ID, to: "PVG", auto: true }, NOW);
    const s = old.snapshot(),
      c = new GameCore(NOW, s);
    expect(c.snapshot().fleet[0]!.flight).toEqual(s.fleet[0]!.flight);
    expect(c.snapshot().fleet[0]!.energy).toEqual(s.fleet[0]!.energy);
    expect(
      c.snapshot().orders.map(({ service: _s, product: _p, ...o }) => o),
    ).toEqual(s.orders);
    expect(validateSave(c.snapshot())).toEqual(c.snapshot());
  });
  it("never accepts expanded aircraft in an old schema", () => {
    const old = new V6Core(NOW).snapshot();
    old.fleet[0]!.modelId = "swift-p";
    expect(() => validateSave(old)).toThrow();
  });
  it("gates rank and airport level before spending", () => {
    const c = new GameCore(NOW);
    unchanged(c, { type: "buy", modelId: "heron-p", airportId: "PEK" });
    const r = rich();
    unchanged(r, { type: "buy", modelId: "aurora-p", airportId: "PEK" });
  });
  it("uses historical hundred-level modifiers with real capacity and power", () => {
    const c = rich(),
      before = aircraftSpecs(c.snapshot().fleet[0]!);
    for (const upgrade of [
      "capacity",
      "engine",
      "range",
      "efficiency",
    ] as const)
      cmd(c, { type: "retrofit", planeId: ID, upgrade });
    cmd(c, { type: "power-upgrade", planeId: ID });
    const m = aircraftSpecs(c.snapshot().fleet[0]!);
    expect(m.seats).toBe(before.seats * 2);
    expect(m.range).toBe(2100);
    expect(m.speed).toBe(378);
    expect(m.weight).toBe(209);
    expect(m.energy).toBe(216);
  });
});
describe("fleet, people, collections and tasks", () => {
  it("seals, restores, dismantles and assembles without losing ids or capacity", () => {
    const c = rich();
    cmd(c, { type: "buy", modelId: "swift-f", airportId: "PEK" });
    cmd(c, { type: "store-plane", planeId: "AC0002" });
    cmd(c, { type: "restore-plane", planeId: "AC0002" });
    cmd(c, { type: "store-plane", planeId: "AC0002" });
    const bag = c.snapshot().career.inventory;
    cmd(c, { type: "dismantle-plane", planeId: "AC0002" });
    expect(c.snapshot().career.inventory.frame).toBe(bag.frame + 1);
    unchanged(c, { type: "dismantle-plane", planeId: "AC0002" });
    cmd(c, { type: "assemble-plane", modelId: "swift-f", airportId: "PEK" });
    expect(c.snapshot().fleet.at(-1)!.id).toBe("AC0003");
    expect(c.snapshot().career.assemblies).toBe(1);
  });
  it("museum consumes a unique sealed model and achievement remains permanent", () => {
    const c = rich();
    cmd(c, { type: "buy", modelId: "swift-f", airportId: "PEK" });
    cmd(c, { type: "store-plane", planeId: "AC0002" });
    cmd(c, { type: "museum-donate", planeId: "AC0002" });
    expect(c.snapshot().career.stored).toHaveLength(0);
    cmd(c, { type: "activate-achievement" });
    unchanged(c, { type: "museum-donate", planeId: "AC0002" });
    cmd(c, { type: "career-claim", id: "museum-1" });
    unchanged(c, { type: "career-claim", id: "museum-1" });
  });
  it("requires professional cargo bay and consumes materials only on success", () => {
    const c = rich();
    wait(c, 360);
    const cold = c
      .snapshot()
      .orders.find((o) => o.location === "PEK" && o.service === "cold")!;
    expect(cold).toBeDefined();
    unchanged(c, { type: "load", planeId: ID, orderId: cold.id });
    cmd(c, { type: "specialize-plane", planeId: ID, special: "cold" });
    cmd(c, { type: "load", planeId: ID, orderId: cold.id });
    unchanged(c, {
      type: "specialize-plane",
      planeId: ID,
      special: "industrial",
    });
  });
  it("requires wages for new automatic flights and completes a locked flight after expiry", () => {
    const c = rich();
    cmd(c, { type: "recruit-pilot" });
    cmd(c, { type: "assign-pilot", pilotId: 1, planeId: ID });
    const s = c.snapshot();
    s.career.pilots[0]!.paidUntil = 10;
    const run = new GameCore(NOW, s);
    cmd(run, { type: "start-duty", planeId: ID, to: "PVG" });
    const f = run.snapshot().fleet[0]!.flight!;
    wait(run, f.arriveAt + 8);
    expect(run.snapshot().stats.flights).toBe(1);
    expect(run.snapshot().fleet[0]!.autoRouteId).toBeNull();
    expect(run.snapshot().fleet[0]!.flight).toBeNull();
    cmd(run, { type: "pay-pilot", pilotId: 1 });
    expect(run.snapshot().career.pilots[0]!.paidUntil).toBe(
      run.snapshot().simTime + 7 * 86400,
    );
  });
  it("does not mint experience, tickets or materials for empty repositioning", () => {
    const c = rich(),
      before = c.snapshot().career;
    cmd(c, { type: "dispatch", planeId: ID, to: "PVG", auto: false });
    wait(c, c.snapshot().fleet[0]!.flight!.arriveAt);
    expect(c.snapshot().career.tickets).toBe(before.tickets);
    expect(c.snapshot().career.xp).toBe(before.xp);
    expect(c.snapshot().career.inventory).toEqual(before.inventory);
  });
  it("daily rewards and seeded research survive reload without rerolling", () => {
    const c = rich();
    cmd(c, { type: "career-claim", id: "checkin-0" });
    unchanged(c, { type: "career-claim", id: "checkin-0" });
    cmd(c, { type: "build-facility", building: "research" });
    const d = new GameCore(NOW, c.snapshot());
    cmd(c, { type: "research" });
    cmd(d, { type: "research" });
    expect(c.snapshot()).toEqual(d.snapshot());
  });
});
describe("physical production and transport", () => {
  function factory() {
    const c = rich();
    cmd(c, { type: "build-facility", building: "factory" });
    cmd(c, { type: "build-facility", building: "trade" });
    cmd(c, {
      type: "purchase-resource",
      material: "food",
      airportId: "PEK",
      count: 9,
    });
    cmd(c, { type: "produce", recipe: "meal", airportId: "PEK", count: 3 });
    wait(c, 246);
    return c;
  }
  it("produces, transports two consignments and settles real cross-city trade once", () => {
    const c = factory();
    expect(c.snapshot().career.warehouses.PEK!.meal).toBe(6);
    unchanged(c, { type: "claim-trade", airportId: "PEK", weekly: false });
    cmd(c, { type: "buy", modelId: "swift-f", airportId: "PEK" });
    const id = c.snapshot().fleet.at(-1)!.id;
    cmd(c, {
      type: "transport-resource",
      planeId: id,
      material: "meal",
      count: 3,
      to: "PVG",
    });
    expect(warehouseUsed(c.snapshot(), "PVG")).toBe(3);
    const start = c.snapshot();
    cmd(c, { type: "dispatch", planeId: id, to: "PVG", auto: false });
    wait(c, legQuote(start, start.fleet.at(-1)!, "PEK", "PVG").duration);
    expect(c.snapshot().career.warehouses.PVG!.meal).toBe(3);
    cmd(c, { type: "claim-trade", airportId: "PVG", weekly: false });
    expect(c.snapshot().career.warehouses.PVG!.meal).toBe(0);
    unchanged(c, { type: "claim-trade", airportId: "PVG", weekly: false });
  });
  it("reserves destination capacity before departure and production output before completion", () => {
    const c = factory(),
      s = c.snapshot();
    s.career.warehouses.PVG = inventory();
    s.career.warehouses.PVG.food = warehouseCapacity(s);
    const run = new GameCore(s.lastWallTime, s);
    unchanged(run, {
      type: "transport-resource",
      planeId: ID,
      material: "meal",
      count: 1,
      to: "PVG",
    });
  });
  it("has identical settlement under chunked and one-shot time including production and midnight", () => {
    const c = rich();
    cmd(c, { type: "build-facility", building: "factory" });
    cmd(c, {
      type: "purchase-resource",
      material: "food",
      airportId: "PEK",
      count: 6,
    });
    cmd(c, { type: "produce", recipe: "meal", airportId: "PEK", count: 2 });
    const s = c.snapshot();
    s.career.nextDayAt = 100;
    const a = new GameCore(NOW, s),
      b = new GameCore(NOW, s);
    wait(a, 500);
    for (let i = 0; i < 50; i++) wait(b, 10);
    expect(a.snapshot()).toEqual(b.snapshot());
    expect(a.snapshot().career.produced).toBe(2);
  });
  it("refreshes shop limits and power at midnight while retaining airborne reservation", () => {
    const c = rich();
    cmd(c, { type: "career-supply", material: "frame", count: 20 });
    unchanged(c, { type: "career-supply", material: "frame", count: 1 });
    cmd(c, { type: "dispatch", planeId: ID, to: "PVG", auto: false });
    const s = c.snapshot();
    s.career.nextDayAt = 1;
    const a = new GameCore(NOW, s);
    wait(a, 2);
    const p = a.snapshot().fleet[0]!;
    expect(p.energy.availableSeconds + p.energy.reservedSeconds).toBe(
      energyCapacity(p),
    );
    expect(a.snapshot().career.day).toBe(1);
    cmd(a, { type: "career-supply", material: "frame", count: 1 });
  });
  it("invests and pays the fixed return exactly once", () => {
    const c = rich(),
      gold = c.snapshot().credits;
    cmd(c, { type: "invest", amount: 1000 });
    unchanged(c, { type: "collect-investment" });
    wait(c, 3600);
    cmd(c, { type: "collect-investment" });
    expect(c.snapshot().credits).toBe(gold + 50);
    unchanged(c, { type: "collect-investment" });
  });
  it("stores reversible routes and refuses closure with accepted freight", () => {
    const c = rich();
    cmd(c, { type: "unlock", airportId: "WUH" });
    cmd(c, { type: "save-route", name: "三城", stops: ["PEK", "WUH", "PVG"] });
    cmd(c, { type: "close-airport", airportId: "WUH" });
    expect(c.snapshot().career.savedRoutes).toHaveLength(0);
    expect(c.snapshot().career.airportPeak).toBe(3);
    cmd(c, { type: "career-claim", id: "network-3" });
  });
  it("production components can be withdrawn into the workshop exactly once", () => {
    const c = rich();
    cmd(c, { type: "build-facility", building: "factory" });
    cmd(c, {
      type: "purchase-resource",
      material: "alloy",
      airportId: "PEK",
      count: 4,
    });
    cmd(c, {
      type: "purchase-resource",
      material: "fabric",
      airportId: "PEK",
      count: 2,
    });
    cmd(c, { type: "produce", recipe: "frame", airportId: "PEK", count: 1 });
    wait(c, 219);
    const before = c.snapshot().career.inventory.frame;
    cmd(c, {
      type: "withdraw-material",
      airportId: "PEK",
      material: "frame",
      count: 1,
    });
    expect(c.snapshot().career.inventory.frame).toBe(before + 1);
    unchanged(c, {
      type: "withdraw-material",
      airportId: "PEK",
      material: "frame",
      count: 1,
    });
  });
  it("cannot close an endpoint of waiting automatic duty", () => {
    const c = rich();
    cmd(c, { type: "unlock", airportId: "WUH" });
    cmd(c, { type: "hire-dispatcher", planeId: ID });
    const s = c.snapshot();
    s.orders = [];
    const run = new GameCore(NOW, s);
    cmd(run, { type: "start-duty", planeId: ID, to: "WUH" });
    unchanged(run, { type: "close-airport", airportId: "WUH" });
  });
  it("promotion increases visible supply and closing demand prevents new orders", () => {
    const c = new GameCore(NOW);
    cmd(c, { type: "promote-airport", airportId: "PEK" });
    wait(c, 120);
    expect(
      c.snapshot().orders.filter((o) => o.location === "PEK"),
    ).toHaveLength(18);
    cmd(c, { type: "airport-demand", airportId: "PVG", enabled: false });
    wait(c, 480);
    expect(c.snapshot().orders).toHaveLength(0);
    cmd(c, { type: "airport-demand", airportId: "PVG", enabled: true });
    wait(c, 120);
    expect(c.snapshot().orders.length).toBeGreaterThan(0);
  });
  it("claims prune by period without permitting duplicates within the same day or week", () => {
    const c = rich(),
      s = c.snapshot();
    s.stats.passengers = 8;
    s.career.dailyDeliveries = 8;
    s.career.nextDayAt = 1;
    const run = new GameCore(NOW, s);
    cmd(run, { type: "career-claim", id: "daily-0" });
    wait(run, 2);
    expect(run.snapshot().career.claimed).not.toContain("daily-0");
    unchanged(run, { type: "career-claim", id: "daily-0" });
    unchanged(run, { type: "career-claim", id: "daily-1" });
  });
});
describe("strict expanded schema", () => {
  it("refreshes only unaccepted demand, uses ten free refreshes then tickets, and enforces daily cap", () => {
    const c = new GameCore(NOW),
      order = c.snapshot().orders[0]!;
    cmd(c, { type: "load", planeId: ID, orderId: order.id });
    const tickets = c.snapshot().career.tickets;
    for (let i = 0; i < 10; i++)
      cmd(c, { type: "refresh-demand", airportId: "PEK" });
    expect(c.snapshot().career.tickets).toBe(tickets);
    expect(manifest(c.snapshot(), ID)[0]!.id).toBe(order.id);
    cmd(c, { type: "refresh-demand", airportId: "PEK" });
    expect(c.snapshot().career.tickets).toBe(tickets - 1);
    for (let i = 11; i < 30; i++)
      cmd(c, { type: "refresh-demand", airportId: "PEK" });
    unchanged(c, { type: "refresh-demand", airportId: "PEK" });
  });
  const mutations: [string, (s: GameState) => void][] = [
    [
      "gems",
      (s) => {
        Object.assign(s.career, { gems: 1 });
      },
    ],
    [
      "negative tickets",
      (s) => {
        s.career.tickets = -1;
      },
    ],
    [
      "extra material",
      (s) => {
        Object.assign(s.career.inventory, { gold: 10 });
      },
    ],
    [
      "future research seed",
      (s) => {
        s.career.seed = 2 ** 32;
      },
    ],
    [
      "unknown part",
      (s) => {
        s.orders[0]!.product = "oops" as never;
      },
    ],
    [
      "bad professional capacity",
      (s) => {
        s.fleet[0]!.tuning.group = 7;
      },
    ],
    [
      "unknown saved city",
      (s) => {
        s.career.savedRoutes.push({ name: "bad", stops: ["PEK", "XXX"] });
      },
    ],
    [
      "duplicate pilot",
      (s) => {
        s.career.pilots = [
          { id: 1, name: "a", paidUntil: 100, skill: 0, planeId: null },
          { id: 1, name: "b", paidUntil: 100, skill: 0, planeId: null },
        ];
        s.career.nextId = 2;
      },
    ],
    [
      "unearned daily reward",
      (s) => {
        s.career.claimed = ["daily-0"];
      },
    ],
    [
      "forged service reward",
      (s) => {
        s.orders[0]!.reward++;
      },
    ],
  ];
  it.each(mutations)("rejects %s", (_, change) => {
    const s = new GameCore(NOW).snapshot();
    change(s);
    expect(() => validateSave(s)).toThrow();
  });
});
