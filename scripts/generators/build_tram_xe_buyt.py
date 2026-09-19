"""Trạm xe buýt ĐHQG — oval island, wave canopy, Saigon bus, LED route board."""
from __future__ import annotations

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import bpy
import _landmark_common as lm

META = {
    "id": "landmark_tram_xe_buyt",
    "name": "Trạm xe buýt ĐHQG",
    "gameplay_role": "fast_travel_hub",
    "tile_footprint": {"width": 4, "depth": 2},
}


def build(collection):
    mat_road = lm.create_pbr_material("Mat_bus_Asphalt", "#37474F", roughness=0.9)
    mat_island = lm.create_pbr_material("Mat_bus_Island", "#B0BEC5", roughness=0.82)
    mat_curb = lm.create_pbr_material("Mat_bus_Curb", "#78909C", roughness=0.8)
    mat_canopy = lm.create_pbr_material(
        "Mat_bus_Canopy", "#81D4FA", roughness=0.2, alpha=0.55, transmission=0.6
    )
    mat_steel = lm.create_pbr_material("Mat_bus_Steel", "#546E7A", metallic=0.75, roughness=0.35)
    mat_bench = lm.create_pbr_material("Mat_bus_Bench", "#90A4AE", metallic=0.6, roughness=0.4)
    mat_led = lm.create_pbr_material(
        "Mat_bus_LED", "#212121", roughness=0.4, emit_hex="#FF1744", emit_strength=5.0
    )
    mat_bus_green = lm.create_pbr_material("Mat_bus_Green", "#1B5E20", roughness=0.55)
    mat_bus_cream = lm.create_pbr_material("Mat_bus_Cream", "#FFF8E1", roughness=0.55)
    mat_bus_glass = lm.create_pbr_material(
        "Mat_bus_Glass", "#B3E5FC", roughness=0.15, alpha=0.75, transmission=0.5
    )
    mat_tire = lm.create_pbr_material("Mat_bus_Tire", "#212121", roughness=0.9)
    mat_line = lm.create_pbr_material("Mat_bus_Line", "#FDD835", roughness=0.65)
    mat_faction = lm.faction_material("tram_xe_buyt")

    objs = []

    # Surrounding asphalt
    road = lm.add_plane("Bus_Road", (40.0, 24.0), (0.0, 0.0, 0.0), mat_road, collection)
    objs.append(road)

    # Oval island platform (stretched cylinder)
    island = lm.add_cylinder("Bus_Island", 7.0, 0.25, (0.0, 0.0, 0.125), mat_island, collection, vertices=16)
    island.scale = (2.0, 0.85, 1.0)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    objs.append(island)

    curb = lm.add_cylinder("Bus_Curb", 7.3, 0.35, (0.0, 0.0, 0.1), mat_curb, collection, vertices=16)
    curb.scale = (2.0, 0.85, 1.0)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    cutter = lm.add_cylinder("Bus_CurbCut", 6.85, 1.0, (0.0, 0.0, 0.15), None, collection, vertices=16)
    cutter.scale = (2.0, 0.85, 1.0)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    lm.boolean_difference(curb, cutter)
    objs.append(curb)

    # Turnaround lane yellow marks
    for i in range(8):
        ang = math.radians(i * 45)
        x = 13.5 * math.cos(ang)
        y = 6.2 * math.sin(ang)
        mark = lm.add_cube(
            f"Bus_LaneMark_{i}", (1.8, 0.35, 0.04),
            (x, y, 0.03), mat_line, collection, rotation=(0, 0, ang)
        )
        objs.append(mark)

    # Wave cantilever canopy supports + translucent panels
    for i, x in enumerate((-7.5, -2.5, 2.5, 7.5)):
        post = lm.add_cylinder(f"Bus_Post_{i}", 0.12, 3.4, (x, 0.0, 1.95), mat_steel, collection, vertices=6)
        objs.append(post)
        # wave rib segments
        for k in range(4):
            z = 3.5 + math.sin(k * 0.9 + i) * 0.4
            rib = lm.add_cube(
                f"Bus_Rib_{i}_{k}", (2.6, 0.16, 0.16),
                (x + (k - 1.5) * 0.35, 0.0, z + 0.85),
                mat_steel, collection,
                rotation=(0, math.radians(10 if k % 2 == 0 else -10), 0)
            )
            objs.append(rib)
            cross = lm.add_cube(
                f"Bus_RibCross_{i}_{k}", (0.12, 2.8, 0.12),
                (x, 0.0, z + 1.0),
                mat_steel, collection,
            )
            objs.append(cross)
        panel = lm.add_cube(
            f"Bus_CanopyPanel_{i}", (3.0, 3.4, 0.1),
            (x, 0.0, 4.4 + math.sin(i) * 0.25),
            mat_canopy, collection,
            rotation=(0, math.radians(8 if i % 2 == 0 else -8), 0)
        )
        objs.append(panel)
        # panel edge trim
        trim = lm.add_cube(
            f"Bus_CanopyTrim_{i}", (3.0, 3.45, 0.08),
            (x, 0.0, 4.28 + math.sin(i) * 0.25),
            mat_steel, collection,
            rotation=(0, math.radians(8 if i % 2 == 0 else -8), 0)
        )
        objs.append(trim)

    # Benches + backrests + armrests
    for i, x in enumerate((-5.0, -1.5, 2.0, 5.5)):
        bench = lm.add_cube(f"Bus_Bench_{i}", (2.2, 0.55, 0.4), (x, 0.3, 0.45), mat_bench, collection)
        back = lm.add_cube(f"Bus_BenchBack_{i}", (2.2, 0.12, 0.55), (x, 0.55, 0.88), mat_bench, collection)
        leg1 = lm.add_cube(f"Bus_BenchLegA_{i}", (0.12, 0.45, 0.4), (x - 0.8, 0.3, 0.22), mat_steel, collection)
        leg2 = lm.add_cube(f"Bus_BenchLegB_{i}", (0.12, 0.45, 0.4), (x + 0.8, 0.3, 0.22), mat_steel, collection)
        objs.extend([bench, back, leg1, leg2])

    # LED route display + info pillars
    led_post = lm.add_cylinder("Bus_LEDPost", 0.08, 2.4, (8.5, 0.0, 1.45), mat_steel, collection, vertices=6)
    led_panel = lm.add_cube("Bus_LEDDisplay", (2.4, 0.15, 0.75), (8.5, 0.0, 2.55), mat_led, collection)
    led_frame = lm.add_cube("Bus_LEDFrame", (2.6, 0.22, 0.95), (8.5, 0.0, 2.55), mat_steel, collection)
    objs.extend([led_post, led_panel, led_frame])
    for j, ix in enumerate((-6.5, 0.0)):
        ipost = lm.add_cylinder(f"Bus_InfoPost_{j}", 0.07, 2.2, (ix, 0.4, 1.35), mat_steel, collection, vertices=6)
        iboard = lm.add_cube(f"Bus_InfoBoard_{j}", (1.2, 0.1, 0.9), (ix, 0.4, 2.2), mat_bus_cream, collection)
        objs.extend([ipost, iboard])

    # Faction station pole
    fac_pole = lm.add_cylinder("Bus_FactionPole", 0.1, 3.2, (-9.0, 0.0, 1.7), mat_steel, collection, vertices=6)
    fac_flag = lm.add_cube("Bus_FactionFlag", (0.25, 1.6, 0.9), (-9.0, 0.7, 3.0), mat_faction, collection)
    objs.extend([fac_pole, fac_flag])

    # Low-poly Saigon bus parked at lane
    bx, by = 2.0, -5.5
    body = lm.add_cube("Bus_VehicleBody", (9.0, 2.6, 2.4), (bx, by, 1.5), mat_bus_green, collection)
    cabin = lm.add_cube("Bus_VehicleCabin", (2.2, 2.5, 2.1), (bx + 3.2, by, 2.7), mat_bus_cream, collection)
    stripe = lm.add_cube("Bus_VehicleStripe", (9.05, 2.65, 0.55), (bx, by, 1.35), mat_bus_cream, collection)
    windows = lm.add_cube("Bus_VehicleWindows", (5.5, 2.7, 0.85), (bx - 0.8, by, 2.3), mat_bus_glass, collection)
    roofline = lm.add_cube("Bus_VehicleRoof", (8.2, 2.2, 0.25), (bx - 0.3, by, 2.8), mat_bus_cream, collection)
    bumper = lm.add_cube("Bus_VehicleBumper", (0.35, 2.4, 0.45), (bx - 4.5, by, 0.7), mat_steel, collection)
    headlamp_l = lm.add_cube("Bus_HeadlampL", (0.15, 0.35, 0.25), (bx - 4.65, by + 0.8, 1.2), mat_led, collection)
    headlamp_r = lm.add_cube("Bus_HeadlampR", (0.15, 0.35, 0.25), (bx - 4.65, by - 0.8, 1.2), mat_led, collection)
    door = lm.add_cube("Bus_Door", (0.2, 0.9, 1.6), (bx + 1.2, by - 1.35, 1.3), mat_bus_glass, collection)
    objs.extend([body, cabin, stripe, windows, roofline, bumper, headlamp_l, headlamp_r, door])
    for i, wx in enumerate((bx - 3.0, bx - 0.5, bx + 2.0, bx + 3.4)):
        for sign in (-1.0, 1.0):
            wheel = lm.add_cylinder(
                f"Bus_Wheel_{i}_{int(sign)}", 0.45, 0.3,
                (wx, by + sign * 1.25, 0.45), mat_tire, collection, vertices=8,
                rotation=(math.pi / 2, 0, 0)
            )
            hub = lm.add_cylinder(
                f"Bus_Hub_{i}_{int(sign)}", 0.2, 0.32,
                (wx, by + sign * 1.25, 0.45), mat_bench, collection, vertices=8,
                rotation=(math.pi / 2, 0, 0)
            )
            objs.extend([wheel, hub])

    return objs


if __name__ == "__main__":
    lm.run_landmark_builder(build, "tram_xe_buyt", META)
