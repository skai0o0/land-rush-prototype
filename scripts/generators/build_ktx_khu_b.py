"""KTX Khu B — H-shaped 16-floor twin towers over 2-floor commercial podium."""
from __future__ import annotations

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import bpy
import _landmark_common as lm

META = {
    "id": "landmark_ktx_khu_b",
    "name": "Ký túc xá Khu B",
    "gameplay_role": "mega_stronghold",
    "tile_footprint": {"width": 9, "depth": 8},
}


def _tower_wing(name, cx, cy, w, d, height, z0, mat_wall, mat_paint, mat_glass, collection, paint_color_idx=0):
    objs = []
    body = lm.add_cube(f"{name}_Body", (w, d, height), (cx, cy, z0 + height * 0.5), mat_wall, collection)
    objs.append(body)
    lm.bevel_object(body, width=0.1, segments=1)

    # Vertical glass strips
    for j in range(3):
        gx = cx - w * 0.3 + j * w * 0.3
        glass = lm.add_cube(
            f"{name}_Glass_{j}", (w * 0.12, d + 0.08, height * 0.92),
            (gx, cy, z0 + height * 0.5), mat_glass, collection
        )
        objs.append(glass)

    # Color accent slabs (modern paint bands)
    for fl in (3, 7, 11, 14):
        z = z0 + fl * 3.0
        if z > z0 + height:
            continue
        band = lm.add_cube(
            f"{name}_Paint_{fl}", (w + 0.15, d + 0.15, 0.7),
            (cx, cy, z), mat_paint, collection
        )
        objs.append(band)

    # Balcony array floors 3-15
    for fl in range(3, 16):
        z = z0 + fl * 3.0 + 0.9
        if z > z0 + height - 0.5:
            continue
        for sign in (-1.0, 1.0):
            bal = lm.add_cube(
                f"{name}_Bal_{fl}_{int(sign)}",
                (w * 0.7, 0.55, 0.14),
                (cx, cy + sign * (d * 0.5 + 0.18), z),
                mat_glass, collection
            )
            objs.append(bal)

    # Rooftop elevator tum
    tum_z = z0 + height
    tum = lm.add_cube(f"{name}_Tum", (w * 0.28, d * 0.35, 2.8), (cx, cy, tum_z + 1.4), mat_wall, collection)
    tank = lm.add_cylinder(f"{name}_WaterTank", 0.9, 1.6, (cx + w * 0.2, cy, tum_z + 2.2), mat_paint, collection, vertices=8)
    objs.extend([tum, tank])
    return objs


def build(collection):
    mat_podium = lm.create_pbr_material("Mat_ktxb_Podium", "#ECEFF1", roughness=0.75)
    mat_wall = lm.create_pbr_material("Mat_ktxb_Wall", "#CFD8DC", roughness=0.8)
    mat_paint_orange = lm.create_pbr_material("Mat_ktxb_PaintOrange", "#EF6C00", roughness=0.7)
    mat_paint_blue = lm.create_pbr_material("Mat_ktxb_PaintBlue", "#1565C0", roughness=0.7)
    mat_paint_yellow = lm.create_pbr_material("Mat_ktxb_PaintYellow", "#F9A825", roughness=0.7)
    mat_glass = lm.create_pbr_material(
        "Mat_ktxb_Glass", "#81D4FA", roughness=0.15, alpha=0.88, transmission=0.45
    )
    mat_shop = lm.create_pbr_material("Mat_ktxb_Shop", "#FFCC80", roughness=0.65)
    mat_plaza = lm.create_pbr_material("Mat_ktxb_Plaza", "#90A4AE", roughness=0.88)
    mat_bridge = lm.create_pbr_material("Mat_ktxb_Bridge", "#B0BEC5", roughness=0.7)
    mat_faction = lm.faction_material("ktx_khu_b")

    objs = []
    floors = 16
    fh = 3.0
    tower_h = floors * fh  # 48m
    podium_h = 6.0

    # Plaza
    plaza = lm.add_plane("KTXB_Plaza", (60.0, 54.0), (0.0, 0.0, 0.0), mat_plaza, collection)
    objs.append(plaza)

    # Podium 2 floors
    podium = lm.add_cube("KTXB_Podium", (48.0, 36.0, podium_h), (0.0, 0.0, podium_h * 0.5), mat_podium, collection)
    objs.append(podium)
    # shopfront glass ribbon
    for sign in (-1.0, 1.0):
        shop = lm.add_cube(
            f"KTXB_Shop_{int(sign)}", (40.0, 0.35, 2.8),
            (0.0, sign * 18.1, 2.0), mat_shop, collection
        )
        objs.append(shop)

    # H-shape twin towers: two vertical bars + connecting bar
    # North bar
    objs.extend(_tower_wing("KTXB_N", 0.0, 14.0, 34.0, 10.0, tower_h, podium_h, mat_wall, mat_paint_orange, mat_glass, collection))
    # South bar
    objs.extend(_tower_wing("KTXB_S", 0.0, -14.0, 34.0, 10.0, tower_h, podium_h, mat_wall, mat_paint_blue, mat_glass, collection))
    # Cross bar (H mid)
    objs.extend(_tower_wing("KTXB_Mid", 0.0, 0.0, 10.0, 20.0, tower_h, podium_h, mat_wall, mat_paint_yellow, mat_glass, collection))

    # Sky bridges on floor 8 and 12
    for fl in (8, 12):
        z = podium_h + fl * fh + 1.2
        bridge = lm.add_cube(
            f"KTXB_Bridge_{fl}", (8.0, 10.0, 2.4),
            (0.0, 0.0, z), mat_bridge, collection
        )
        objs.append(bridge)

    # Mid plaza pattern
    medallion = lm.add_cylinder("KTXB_Medallion", 5.0, 0.15, (0.0, 0.0, 0.08), mat_paint_yellow, collection, vertices=8)
    objs.append(medallion)

    # Faction crest on podium front
    crest = lm.add_cube("KTXB_FactionCrest", (8.0, 0.4, 2.0), (0.0, -18.3, 4.5), mat_faction, collection)
    objs.append(crest)

    # Rooftop tanks already in wings; add corner tums for silhouette
    for sign in (-1.0, 1.0):
        tum = lm.add_cube(
            f"KTXB_CornerTum_{int(sign)}",
            (4.0, 4.0, 3.2),
            (sign * 14.0, 0.0, podium_h + tower_h + 1.6),
            mat_wall, collection
        )
        objs.append(tum)

    return objs


if __name__ == "__main__":
    lm.run_landmark_builder(build, "ktx_khu_b", META)
