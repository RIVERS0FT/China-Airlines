# 现实机型参照与游戏数值规则

日期：2026-09-16。机型名称、容量与性能是航空经营游戏配置，不用于真实飞行、载重或航线计划。现实资料只用来确定机型定位和相对量级；可见客货槽位按《中华铁路》早期车辆约1至17节的经营节奏压缩，不按真实座位数或千克数一比一换算。

现实原型是全机型目录的不变约束：`ALL_MODELS` 中每架飞机都必须记录可核查的现实原型与容量依据，范围包括商店机型、开局赠送机、非卖机和今后可能增加的活动机。新增机型不得只提供虚构名称或通用飞机外形；可以采用原创游戏名称与原创涂装，但机体结构、用途级别和数值量级必须能追溯到现实机型及可靠资料。

## 当前目录

| 游戏机型 | 现实参照 | 厂商容量依据 | 游戏基础容量 | 游戏航程/速度 | 价格/门槛 |
| --- | --- | --- | --- | --- | --- |
| 钻石 DA40 | Diamond DA40 NG | 4座（含飞行员），最大有效载荷407 kg | 1客/0货 | 1,730 km / 285 | 4,000金币，Lv.1，机场1级 |
| 雨燕 客/货/混合型、初航号 | Cessna SkyCourier | 19座，最大有效载荷2,347 kg | 4客；3货；2客/2货；初航号3客/2货 | 2,000 km / 360 | 客机7,000金币，Lv.1，机场1级 |
| 苍鹭 客/货/混合型 | ATR 72-600 / 72-600F | 最多78座；货运型最大结构载荷9,200 kg | 8客；6货；4客/3货 | 4,400 km / 560 | 客机26,000金币，Lv.3，机场1级 |
| 信天翁 客/货/混合型 | Airbus A321XLR / A321P2F | 最多244座；货运型最大载荷28.1 t | 12客；9货；6客/5货 | 8,500 km / 740 | 客机85,000金币，Lv.6，机场2级 |
| 极光 客/货/混合型 | Boeing 747-8I / 747-8F | 410座；货运型收益载荷133.1 t | 18客；14货；9客/7货 | 16,000 km / 880 | 客机220,000金币，Lv.10，机场3级 |

非卖的「雨燕 初航号」沿用Cessna SkyCourier现实原型，游戏基础容量为3客/2货。同系列货机为客机价格的95%，混合型为110%。现实参照不代表游戏美术复制厂商涂装、商标、注册号、照片或技术图纸；现役14架v7资源全部使用原创蓝白金涂装，并按各自现实原型绘制仅限客货舱段的剖面图与匹配外观图。

## 数值取舍

- DA40放在雨燕之前形成4,000→7,000金币的入门购买梯度。1客0货来自已确认的游戏容量；现实4座包含飞行员及非经营座位，不等于4个可售客位。
- DA40容量改装上限为0，避免1客机在同一机体上扩成10客；其他现役机型最多9级扩舱。当前没有满载收益倍率，扩舱只通过增加可承运订单影响收入，并按有效舱段数增加运行成本。
- 雨燕至极光的运行航程、速度、重量、容量与价格使用当前目录值。所有当前航班统一使用 `DESIGN.md` 的运输经济公式。
- 商店同时显示现实容量和游戏容量，让玩家知道槽位是经营抽象。货位界面仍沿用“吨”的既有游戏单位，但目录数字不是现实吨位。

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
