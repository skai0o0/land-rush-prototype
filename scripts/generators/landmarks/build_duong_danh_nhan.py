"""Con đường Danh nhân — granite boulevard with 10 bust pedestals."""
from __future__ import annotations

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import bpy
import _landmark_common as lm

META = {
    "id": "landmark_duong_danh_nhan",
    "name": "Con đường Danh nhân",
    "gameplay_role": "research_buff_boulevard",
    "tile_footprint": {"width": 6, "depth": 1},
}


def _bust(collection, name, x, y, z, mat_stone, mat_faction, standing=True):
    objs = []
    ped_h = 1.0
    ped = lm.add_cube(f"{name}_Pedestal", (1.6, 1.6, ped_h), (x, y, z + ped_h * 0.5), mat_stone, collection)
    objs.append(ped)
    # bevel pedestal
    lm.bevel_object(ped, width=0.06, segments=1)

    body_h = 2.2 if standing else 1.7
    # stylized torso
    torso = lm.add_cylinder(
        f"{name}_Torso", 0.45 if standing else 0.55, body_h * 0.55,
        (x, y, z + ped_h + body_h * 0.28), mat_stone, collection, vertices=6
    )
    objs.append(torso)
    # robe / lower mass
    robe = lm.add_cylinder(
        f"{name}_Robe", 0.7 if standing else 0.85, body_h * 0.45,
        (x, y, z + ped_h + body_h * 0.18), mat_stone, collection, vertices=6,
        radius_top=0.4 if standing else 0.55,
    )
    objs.append(robe)
    # head
    head_z = z + ped_h + body_h * 0.72
    head = lm.add_icosphere(f"{name}_Head", 0.32, (x, y, head_z), mat_stone, collection, subdivisions=1)
    objs.append(head)
    # arm / book gesture
    book = lm.add_cube(
        f"{name}_Book", (0.55, 0.18, 0.4),
        (x + 0.35, y - 0.1, z + ped_h + body_h * 0.4),
        mat_stone, collection, rotation=(0.2, 0, 0.4),
    )
    objs.append(book)
    # faction plaque on pedestal
    plaque = lm.add_cube(
        f"{name}_Plaque", (0.7, 0.06, 0.35),
        (x, y - 0.82, z + ped_h * 0.55), mat_faction, collection,
    )
    objs.append(plaque)
    return objs


def build(collection):
    mat_granite_a = lm.create_pbr_material("Mat_duong_GraniteA", "#90A4AE", roughness=0.82)
    mat_granite_b = lm.create_pbr_material("Mat_duong_GraniteB", "#546E7A", roughness=0.82)
    mat_stone = lm.create_pbr_material("Mat_duong_BustStone", "#CFD8DC", roughness=0.78)
    mat_uplight = lm.create_pbr_material(
        "Mat_duong_Uplight", "#FFF3E0", roughness=0.4, emit_hex="#FFB74D", emit_strength=4.0
    )
    mat_planter = lm.create_pbr_material("Mat_duong_Planter", "#5D4037", roughness=0.9)
    mat_plant = lm.create_pbr_material("Mat_duong_Plant", "#2E7D32", roughness=0.88)
    mat_faction = lm.faction_material("duong_danh_nhan")

    objs = []

    # Boulevard floor: two-tone granite strips along X (48m long, 10m wide)
    # Pivot at start of walkway at Z=0: path runs +X from 0 to 48, centered Y=0
    for i in range(12):
        x0 = i * 4.0
        mat = mat_granite_a if i % 2 == 0 else mat_granite_b
        tile = lm.add_cube(f"Duong_Tile_{i}", (4.0, 10.0, 0.2), (x0 + 2.0, 0.0, 0.1), mat, collection)
        objs.append(tile)

    # Center strip
    center = lm.add_cube("Duong_CenterStrip", (46.0, 2.2, 0.22), (24.0, 0.0, 0.12), mat_granite_b, collection)
    objs.append(center)

    # 10 statues: 5 each side, symmetric on Y
    for i in range(5):
        x = 6.0 + i * 8.5
        standing = i % 2 == 0
        for sign in (1.0, -1.0):
            y = 3.4 * sign
            objs.extend(
                _bust(collection, f"Duong_Bust_{i}_{'L' if sign>0 else 'R'}", x, y, 0.2, mat_stone, mat_faction, standing)
            )
            # uplight at foot
            light = lm.add_cylinder(
                f"Duong_Uplight_{i}_{int(sign)}", 0.18, 0.12,
                (x, y - 0.9 * sign, 0.28), mat_uplight, collection, vertices=8
            )
            objs.append(light)
            # planter between
            planter = lm.add_cube(
                f"Duong_Planter_{i}_{int(sign)}", (2.2, 1.2, 0.55),
                (x + 3.2, y, 0.45), mat_planter, collection
            )
            plant = lm.add_icosphere(
                f"Duong_Plant_{i}_{int(sign)}", 0.7, (x + 3.2, y, 1.2), mat_plant, collection, subdivisions=1
            )
            objs.extend([planter, plant])

    # Entry plinth + faction banner
    entry = lm.add_cube("Duong_EntryPlinth", (2.0, 4.0, 0.8), (0.5, 0.0, 0.5), mat_stone, collection)
    banner = lm.add_cube("Duong_FactionBanner", (0.25, 2.4, 2.8), (0.3, 0.0, 2.2), mat_faction, collection)
    objs.extend([entry, banner])

    # End cap
    endcap = lm.add_cube("Duong_EndCap", (1.5, 9.0, 0.6), (47.2, 0.0, 0.4), mat_stone, collection)
    objs.append(endcap)

    return objs


if __name__ == "__main__":
    lm.run_landmark_builder(build, "duong_danh_nhan", META)
