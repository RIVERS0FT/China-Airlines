# 现实机型参照与游戏数值规则

日期：2026-09-16。机型名称、容量与性能是航空经营游戏配置，不用于真实飞行、载重或航线计划。现实资料只用来确定机型定位和相对量级；可见客货槽位按《中华铁路》早期车辆约1至17节的经营节奏压缩，不按真实座位数或千克数一比一换算。

现实原型是全机型目录的不变约束：`ALL_MODELS` 中每架飞机都必须记录可核查的现实原型与容量依据，范围包括商店机型、开局赠送机、非卖机和今后可能增加的活动机。新增机型不得只提供虚构名称或通用飞机外形；可以采用原创游戏名称与原创涂装，但机体结构、用途级别和数值量级必须能追溯到现实机型及可靠资料。

## 当前目录

商店不区分客运、货运或客货型。每架机型只有游戏总容量，购买及组装后客货位均为 0；玩家自行分配。已有 v7 独立外观继续对应各机型 ID，文件名中的 p/f/m 是历史资源 ID，不代表经营类型。

| 游戏机型 | 现实参照 | 厂商容量依据 | 游戏总格数 | 价格 |
| --- | --- | --- | ---: | ---: |
| 钻石 DA40 | Diamond DA40 NG | 4座（含飞行员），最大有效载荷407 kg | 1 | 4,000 |
| 雨燕 I / II / III | Cessna SkyCourier | 19座，最大有效载荷2,347 kg | 2 / 3 / 4 | 5,500 / 7,000 / 9,000 |
| 苍鹭 I / II / III | ATR 72-600 / 72-600F | 最多78座；货运型最大结构载荷9,200 kg | 5 / 6 / 7 | 18,000 / 25,000 / 33,000 |
| 信天翁 I / II | Airbus A321XLR / A321P2F | 最多244座；货运型最大载荷28.1 t | 8 / 9 | 65,000 / 85,000 |
| 极光 | Boeing 747-8I / 747-8F | 410座；货运型收益载荷133.1 t | 10 | 150,000 |
| 雨燕 初航号（非卖） | Cessna SkyCourier | 19座，最大有效载荷2,347 kg | 5 | — |

这些格数、价格与客货改装成本均为航空化游戏配置。运输基础收入和运行成本系数参考已核实的《中华铁路》客户端公式，但五格折算一个航空成本舱段、机型性能和价格均未在原作确认。标准的北京至上海航线，按 `D≈270`、未强化且满载普通订单估算：雨燕 II 约收入 960、成本 53、单程净额 907 金币；极光约收入 3,200、成本 891、单程净额 2,309 金币。实际利润受路线、订单可得性和装载量影响，空飞可亏损。现实参照不代表游戏美术复制厂商涂装、商标、注册号、照片或技术图纸。

## 资料来源

- Diamond Aircraft DA40 Series Technical Specifications：<https://www.diamondaircraft.com/en/private-owners/aircraft/da40/tech-specs/>
- Cessna SkyCourier Passenger：<https://cessna.txtav.com/en/turboprop/skycourier-passenger>
- ATR 72-600：<https://www.atr-aircraft.com/regional-mobility/regional-aircraft/atr-72-600/>
- ATR aircraft family（含72-600F）：<https://www.atr-aircraft.com/regional-mobility/regional-aircraft/>
- Airbus A320 Family / A321XLR：<https://www.airbus.com/en/products-services/commercial-aircraft/passenger-aircraft/a320-family>
- Airbus A321P2F：<https://www.aircraft.airbus.com/en/aircraft/freighters/a321p2f>
- Boeing 747-8I passenger overview：<https://www.boeing.com/resources/boeingdotcom/company/about_bca/startup/pdf/historical/747-8I_-_passenger.pdf>
- Boeing final 747-8F release：<https://investors.boeing.com/investors/news/press-release-details/2022/Final-Boeing-747-Airplane-Leaves-Everett-Factory/default.aspx>

《中华铁路》容量节奏来自用户提供2.0.9 APK中的 `StaticTrain.csv`；采用的是早期主线基础客货槽位量级，不复制列车名称、商标、美术、代码或完整数值表，也不宣称一比一复刻。
