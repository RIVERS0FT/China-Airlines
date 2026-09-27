import { confirmPurchase, test, expect, type Page } from '../helpers/configured-airport.js';
import { readFile } from "node:fs/promises";
import { GameCore, type GameState } from "../helpers/configured-game.js";
import { openGlobal, selectCity, launchRoute } from "../helpers/dispatch-helpers.js";
const NOW = Date.parse("2026-09-13T02:00:00Z");
async function setup(page: Page, saved?: GameState) {
  await page.clock.install({ time: new Date(NOW) });
  await page.goto("./");
  await expect(page.getByTestId("fleet-count")).toHaveText("1 架");
  if (saved) {
    await openGlobal(page, "存档设置");
    page.once("dialog", (d) => void d.accept());
    await page.getByLabel("选择存档文件").setInputFiles({ name: "career.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(saved)) });
    await expect(page.getByTestId("credits")).toContainText(saved.credits.toLocaleString("zh-CN"));
    await page.getByRole("button", { name: "关闭存档设置" }).click();
  }
}
function funded() {
  const s = new GameCore(NOW).snapshot();
  s.credits = 1000000;
  s.career.tickets = 1000;
  return s;
}
async function exportState(page: Page) {
  if (await page.locator(".game-modal").isVisible()) await page.locator(".game-modal>header button").click();
  await openGlobal(page, "存档设置");
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出存档", exact: true }).click();
  const file = await pending;
  const saved = JSON.parse(await readFile((await file.path())!, "utf8")) as GameState;
  await page.getByRole("button", { name: "关闭存档设置" }).click();
  return saved;
}
for (const [width, height] of [[1440, 900],[844, 390],[667, 375]])
  test(`career tabs, organization, daily claim and original art remain usable at ${width}`, async ({page}) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.setViewportSize({ width: width!, height: height! });
    await setup(page);
    await openGlobal(page, "任务中心");
    await page.locator('[data-task-id="checkin-0"]').getByRole("button", { name: "领取奖励", exact: true }).click();
    await page.getByRole("tab", { name: /^已领取/ }).click();
    await expect(page.locator('[data-task-id="checkin-0"]').getByRole("button", { name: "已领取", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "关闭任务中心" }).click();
    await openGlobal(page, "公司组织");
    await expect(page.locator('.organization-workspace')).toBeVisible();
    await page.getByRole("button", { name: "人才市场", exact:true }).click();
    await page.locator('[data-talent-position="flight-specialist"] [data-candidate-id]').filter({has:page.getByRole('heading',{name:'林航',exact:true})}).getByRole('button',{name:'招募林航 · 飞行员',exact:true}).click();
    await expect(page.getByLabel("林航岗位")).toHaveValue("AC0001");
    await page.getByRole('navigation',{name:'主导航'}).getByRole('button',{name:'机场装载',exact:true}).click();
    await openGlobal(page, "经营中心");
    await expect(page.getByRole("main", { name: "公司经营中心" })).toBeVisible();
    for (const name of ["机体工坊","物流园","物资商店","航空展馆","机场运营"]) {
      await page.getByRole("tab", { name, exact: true }).click();
      await expect(page.getByRole("tabpanel", { name, exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.getByRole("tab", { name: "物流园" }).click();
    const decoded = await page.locator(".logistics-scene img").evaluateAll(async (els) => {
        await Promise.all(els.map((el) => (el as HTMLImageElement).decode()));
        return els.every((el) => (el as HTMLImageElement).naturalWidth > 0);
      });
    expect(decoded).toBe(true);
    await page.screenshot({ path: `artifacts/career-logistics-${width}.png` });
    const saved = await exportState(page);
    expect(saved.version).toBe(14);
    expect(saved.career.employees[0]?.planeId).toBe("AC0001");
    expect(saved.fleet[0]?.dispatcher).toBe(true);
    expect(saved.career.claimed).toContain("checkin-0");
    expect(Object.keys(saved.career)).not.toContain("gems");
    await page.reload();
    await openGlobal(page, "任务中心");
    await page.getByRole("tab", { name: /^已领取/ }).click();
    await expect(page.locator('[data-task-id="checkin-0"]').getByRole("button", { name: "已领取", exact: true })).toBeDisabled();
    expect(errors).toEqual([]);
  });
test("workshop quotes match growth and assembly charges and persist after refresh", async ({page}) => {
  const state = funded();
  state.career.inventory.frame = 10;
  state.career.inventory.engine = 10;
  state.career.inventory.wing = 10;
  state.career.inventory.blueprint = 10;
  await setup(page, state);
  await openGlobal(page, "经营中心");
  await page.getByRole("tab", { name: "机体工坊", exact: true }).click();
  await page.getByRole("button", { name: "提升编队 · 4400金币＋2券", exact: true }).click();
  await expect(page.getByTestId("credits")).toHaveText("¥ 995,600");
  await page.getByRole("button", { name: "提升编队 · 12500金币＋4券", exact: true }).click();
  await page.getByRole("button", { name: "机体进化 · 1800金币＋2券", exact: true }).click();
  await expect(page.getByTestId("credits")).toHaveText("¥ 981,300");
  await page.getByLabel("组装机型", { exact: true }).selectOption("swift-f");
  await expect(page.locator(".career-form").filter({ has: page.getByLabel("组装机型", { exact: true }) })).toContainText("¥ 7,500");
  await page.getByRole("button", { name: "组装飞机", exact: true }).click();
  await expect(page.getByTestId("credits")).toHaveText("¥ 973,800");
  await page.reload();
  const saved = await exportState(page);
  expect(saved.credits).toBe(973800);
  expect(saved.fleet[0]!.tuning).toMatchObject({ group: 2, evolution: 1 });
  expect(saved.fleet[1]!).toMatchObject({ modelId: "swift-f", allocation: { passengers: 0, cargo: 0 } });
  expect(saved.career.inventory.frame).toBe(5);
  expect(saved.career.tickets).toBe(990);
});

test("factory goods load onto a cargo plane, arrive in another city and fulfil one trade", async ({page}) => {
  await setup(page, funded());
  await openGlobal(page, "飞机商店");
  await page.getByRole("button", { name: "支付 ¥ 12,500 购买", exact: true }).click();await confirmPurchase(page, 0, 4);
  await page.getByRole("button", { name: "机场装载" }).click();
  await openGlobal(page, "经营中心");
  await page.getByRole("tab", { name: "物流园" }).click();
  await page.getByRole("button", { name: /制造工厂 Lv.0/ }).click();
  await page.getByRole("button", { name: /贸易中心 Lv.0/ }).click();
  await page.getByRole("button", { name: "采购5份餐食原料" }).click();
  await page.getByRole("button", { name: "采购5份餐食原料" }).click();
  await page.getByRole("button", { name: "生产航空餐食", exact: true }).click();
  await page.getByRole("button", { name: "生产航空餐食", exact: true }).click();
  await page.clock.fastForward(90_000);
  await page.getByLabel("承运飞机").selectOption("AC0002");
  await page.getByLabel("运输物资").selectOption("meal");
  await page.getByLabel("运输数量").fill("3");
  await page.getByLabel("物资目的地").selectOption("PVG");
  await page.getByRole("button", { name: "物资装机", exact: true }).click();
  await expect(page.locator(".career-feedback")).toContainText("航空餐食已装机");
  await page.getByRole('navigation',{name:'主导航'}).getByRole('button',{name:'机场装载',exact:true}).click();
  await page.getByRole("button", { name: "下一架飞机" }).click();
  await expect(page.getByTestId("loaded-order")).toHaveCount(1);
  await page.getByRole("button", { name: "制定航线", exact: true }).click();
  await selectCity(page, "PVG");
  await launchRoute(page);
  await expect(page.getByRole("region", { name: "客货列表" })).toHaveCount(0);
  await page.clock.fastForward(400_000);
  await openGlobal(page, "经营中心");
  await page.getByRole("tab", { name: "物流园" }).click();
  await page.getByLabel("当地仓库").selectOption("PVG");
  await page.getByRole("button", { name: "每日贸易 · 交付3份餐食" }).click();
  await expect(page.locator(".career-feedback")).toContainText("贸易已交付");
  const saved = await exportState(page);
  expect(saved.career.trades).toBe(1);
  expect(saved.career.warehouses.PVG?.meal).toBe(0);
  expect(saved.career.warehouses.PEK?.meal).toBe(1);
});
test("new career art, facilities and saved progress open offline", async ({page,context}) => {
  await setup(page);
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await context.setOffline(true);
  await page.reload();
  await openGlobal(page, "经营中心");
  await page.getByRole("tab", { name: "物流园" }).click();
  await page.getByRole("button", { name: /制造工厂 Lv.0/ }).click();
  await expect(page.getByRole("button", { name: /制造工厂 Lv.1/ })).toBeVisible();
  await page.reload();
  await openGlobal(page, "经营中心");
  await page.getByRole("tab", { name: "物流园" }).click();
  await expect(page.getByRole("button", { name: /制造工厂 Lv.1/ })).toBeVisible();
});
