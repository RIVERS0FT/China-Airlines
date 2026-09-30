#!/usr/bin/env python3
"""Static calibration for the proposed China-Airlines 0–20 hour balance.

This is NOT the production game simulator. It checks declared formulas, a
sustainable-flight benchmark, business marginal payback, and a small tutorial
cash ledger. It does not verify real order supply, arbitrary player strategies,
or the complete 20-hour progression.
All business amounts are integer milli-coins per second. No third-party packages.
"""
from dataclasses import dataclass, asdict
from pathlib import Path
import json
import math

@dataclass(frozen=True)
class Aircraft:
    name: str
    capacity: int
    speed: int
    weight: int
    energy: int
    price: int

AIRCRAFT = [
    Aircraft('钻石 DA40',1,285,140,180,2300),
    Aircraft('雨燕 I',2,360,220,200,5500),
    Aircraft('雨燕 II',3,360,220,200,8500),
    Aircraft('雨燕 III',4,360,220,200,12500),
    Aircraft('苍鹭 I',5,560,380,280,22000),
    Aircraft('苍鹭 II',6,560,380,280,32000),
    Aircraft('苍鹭 III',7,560,380,280,45000),
    Aircraft('信天翁 I',8,740,560,400,80000),
    Aircraft('信天翁 II',9,740,560,400,115000),
    Aircraft('极光',10,880,750,600,180000),
]

@dataclass(frozen=True)
class Business:
    name: str
    opening: int
    hiring: int
    expansion: int
    gross: int
    wage: int
    overhead: int
    specialist_training_base: int
    manager_training_base: int

BUSINESSES = [
    Business('票务代理',1200,900,1600,240,80,40,200,250),
    Business('地面服务',4000,2600,4600,640,220,120,550,700),
    Business('货运代理',12000,7800,12000,1800,620,300,1500,1900),
]

def operating_cost(a: Aircraft, d: int = 276) -> int:
    return (d * (a.capacity * 144000 + a.weight * a.speed)
            + a.capacity * 7200000) // 600000

def plane_benchmark(a: Aircraft) -> dict:
    duration = max(30, (276 * 450) // a.speed)
    cost = operating_cost(a)
    revenue = a.capacity * (276 + 50)
    energy_per_flight = max(1, duration // 60)
    flights_per_charge = a.energy // energy_per_flight
    recharge_per_flight = 120 / flights_per_charge
    cycle = duration + 8 + 30 + recharge_per_flight
    full_per_minute = (revenue - cost) * 60 / cycle
    # Aggregate 80% revenue utilization, not fractional in-game passengers.
    # Includes all flight costs; this is a reference only, not an optimizer.
    ordinary_per_minute = (0.8 * revenue - cost) * 60 / cycle
    return dict(name=a.name, capacity=a.capacity, price=a.price,
                flight_seconds=duration, full_revenue=revenue, cost=cost,
                full_profit=revenue-cost, cycle_seconds=cycle,
                full_net_per_minute=full_per_minute,
                reference_net_per_minute=ordinary_per_minute,
                reference_payback_minutes=a.price / ordinary_per_minute)

def gross_rate(b: Business, skill: int = 1, management: int = 1) -> int:
    bonus = min(40, 2 * management)
    return b.gross * (100 + 10 * (skill-1) + bonus) // 100

def net_rate(b: Business, n: int, skill: int = 1, management: int = 1) -> int:
    return max(0, n * (gross_rate(b, skill, management) - b.wage) - b.overhead)

def minutes_to_payback(cost: int, gain_milli: int) -> float:
    if gain_milli <= 0:
        return math.inf
    return cost / (gain_milli / 1000) / 60

def business_benchmark(b: Business) -> dict:
    single = net_rate(b, 1)
    two = net_rate(b, 2)
    hire_gain = two - single
    specialist_gain = gross_rate(b,2) - gross_rate(b,1)
    manager_gain_two = net_rate(b,2,management=2)-two
    manager_gain_six = net_rate(b,6,management=2)-net_rate(b,6)
    expansion_and_hires = b.expansion + b.hiring + 2*b.hiring
    return dict(**asdict(b),
                single_net_per_second=single/1000,
                two_workers_net_per_second=two/1000,
                staffed_team_cost=b.opening+b.hiring,
                staffed_payback_minutes=minutes_to_payback(b.opening+b.hiring,two),
                opening_payback_minutes=minutes_to_payback(b.opening,single),
                second_hire_payback_minutes=minutes_to_payback(b.hiring,hire_gain),
                expansion_to_four_cost=expansion_and_hires,
                expansion_to_four_gain_per_second=(net_rate(b,4)-two)/1000,
                expansion_to_four_payback_minutes=minutes_to_payback(expansion_and_hires,net_rate(b,4)-two),
                specialist_first_training_gain_per_second=specialist_gain/1000,
                specialist_first_training_payback_minutes=minutes_to_payback(b.specialist_training_base,specialist_gain),
                manager_first_training_two_workers_payback_minutes=minutes_to_payback(b.manager_training_base,manager_gain_two),
                manager_first_training_six_workers_payback_minutes=minutes_to_payback(b.manager_training_base,manager_gain_six))

def tutorial_ledger() -> list[dict]:
    # Two-minute setup, fully paid single-seat first route, 15 s player delay.
    # Buy a second DA40 only when at least 300 coins remain, then open one team
    # when at least 400 coins remain. No other purchases or quest cash are added.
    cash = 6000-2500-2300
    planes = [dict(next_departure=120.0, arrival=None)]
    records = [dict(minute=0.0,event='购买上海和首架DA40',cash=cash,planes=1)]
    flights = 0
    team = False
    fractional = 0
    for second in range(1,3601):
        if team:
            fractional += 124
            cash += fractional // 1000
            fractional %= 1000
        for p in planes:
            if p['arrival'] == second:
                cash += 326
                flights += 1
                p['arrival'] = None
                p['next_departure'] = second + 23
                if flights == 1:
                    cash += 600
                    records.append(dict(minute=second/60,event='首航完成并领取600奖励',cash=cash,planes=len(planes)))
        if len(planes)==1 and flights>=1 and cash>=2300+300:
            cash-=2300
            planes.append(dict(next_departure=second+15,arrival=None))
            records.append(dict(minute=second/60,event='购买第二架DA40',cash=cash,planes=2))
        if len(planes)==2 and not team and cash>=1200+400:
            cash-=1200
            team=True
            records.append(dict(minute=second/60,event='开设票务团队',cash=cash,planes=2))
        for p in planes:
            if p['arrival'] is None and second>=p['next_departure'] and cash>=96:
                cash-=96
                p['arrival']=second+435
                p['next_departure']=math.inf
    records.append(dict(minute=60,event='一小时结束（含在途已扣成本）',cash=cash,planes=len(planes),flights=flights,team=team,remainder_milli=fractional))
    return records

def main() -> None:
    planes = [plane_benchmark(a) for a in AIRCRAFT]
    businesses = [business_benchmark(b) for b in BUSINESSES]
    ledger = tutorial_ledger()
    assert planes[0]['full_revenue']==326 and planes[0]['cost']==96
    assert planes[0]['flight_seconds']==435
    assert [p['full_profit'] for p in planes] == [230,460,707,955,1141,1389,1637,1792,2040,2174]
    assert businesses[0]['single_net_per_second']==0.124
    assert businesses[0]['two_workers_net_per_second']==0.288
    assert 20 <= next(r['minute'] for r in ledger if r['event']=='购买第二架DA40') <= 40
    assert 30 <= next(r['minute'] for r in ledger if r['event']=='开设票务团队') <= 60
    data = dict(scope='Static checks and one simplified one-hour route ledger, NOT full game simulation',
                assumptions=dict(distance_units=276,reference_utilization=0.8,turnaround_seconds=8,
                                 benchmark_player_delay_seconds=30,recharge_seconds=120,
                                 tutorial_setup_seconds=120,tutorial_player_delay_seconds=15,
                                 tutorial_full_load=True,tutorial_other_task_rewards=False,
                                 tutorial_order_supply_verified=False),
                aircraft=planes,business=businesses,tutorial=ledger)
    path = Path(__file__).with_name('china_airlines_balance_check.json')
    path.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(data,ensure_ascii=False,indent=2))

if __name__=='__main__':
    main()
