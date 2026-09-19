"""KTX Khu A — U-shaped slab blocks, balconies, fire escapes, mini pitch."""
from __future__ import annotations

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import bpy
import _landmark_common as lm

META = {
    "id": "landmark_ktx_khu_a",
    "name": "Ký túc xá Khu A",
    "gameplay_role": "garrison_outpost",
    "tile_footprint": {"width": 7, "depth": 6},
}


def _slab_block(name, cx, cy, length, depth, floors, mat_wall, mat_balcony, mat_window, collection, rot_z=0.0):
    objs = []
    floor_h = 3.2
    height = floors * floor_h
    body = lm.add_cube(
        f"{name}_Body", (length, depth, height),
        (cx, cy, height * 0.5), mat_wall, collection, rotation=(0, 0, rot_z)
    )
    objs.append(body)

    # Recessed balcony strips on both long faces
    for fl in range(floors):
        z = fl * floor_h + 1.3
        for sign in (-1.0, 1.0):
            bal = lm.add_cube(
                f"{name}_Bal_{fl}_{int(sign)}",
                (length * 0.85, 0.7, 0.18),
                (cx, cy + sign * (depth * 0.5 + 0.15), z),
                mat_balcony, collection, rotation=(0, 0, rot_z)
            )
            objs.append(bal)
            # window strips
            win = lm.add_cube(
                f"{name}_WinStrip_{fl}_{int(sign)}",
                (length * 0.75, 0.12, 1.4),
                (cx, cy + sign * (depth * 0.5 + 0.05), z + 0.7),
                mat_window, collection, rotation=(0, 0, rot_z)
            )
            objs.append(win)
            # balcony rail posts
            for j in range(4):
                px = cx - length * 0.3 + j * (length * 0.6 / 3)
                if abs(rot_z) > 0.01:
                    lx = -length * 0.3 + j * (length * 0.6 / 3)
                    px = cx + lx * math.cos(rot_z)
                    py = cy + sign * (depth * 0.5 + 0.45) + lx * math.sin(rot_z)
                else:
                    py = cy + sign * (depth * 0.5 + 0.45)
                post = lm.add_cube(
                    f"{name}_BalPost_{fl}_{int(sign)}_{j}",
                    (0.08, 0.08, 0.7),
                    (px, py, z + 0.45),
                    mat_balcony, collection, rotation=(0, 0, rot_z)
                )
                objs.append(post)

    # Outdoor fire escape zigzag on one end
    if abs(rot_z) > 0.01:
        end_x = cx + length * 0.5 * math.cos(rot_z)
        end_y = cy + length * 0.5 * math.sin(rot_z)
    else:
        end_x = cx + length * 0.5 + 0.5
        end_y = cy
    for fl in range(floors):
        z = fl * floor_h + 0.8
        platform = lm.add_cube(
            f"{name}_Escape_{fl}", (1.4, 2.2, 0.15),
            (end_x, end_y, z + 0.7), mat_balcony, collection
        )
        objs.append(platform)
        if fl < floors - 1:
            ramp = lm.add_cube(
                f"{name}_Ramp_{fl}", (0.9, 2.4, 0.12),
                (end_x, end_y, z + 2.0), mat_balcony, collection,
                rotation=(0, math.radians(-35 if fl % 2 == 0 else 35), 0)
            )
            objs.append(ramp)
    return objs


def build(collection):
    mat_mustard = lm.create_pbr_material("Mat_ktxa_Mustard", "#C9A227", roughness=0.88)
    mat_old_white = lm.create_pbr_material("Mat_ktxa_OldWhite", "#D7CCC8", roughness=0.9)
    mat_balcony = lm.create_pbr_material("Mat_ktxa_Balcony", "#8D6E63", metallic=0.2, roughness=0.7)
    mat_window = lm.create_pbr_material(
        "Mat_ktxa_Window", "#546E7A", roughness=0.25, metallic=0.1, alpha=0.9
    )
    mat_turf = lm.create_pbr_material("Mat_ktxa_Turf", "#43A047", roughness=0.92)
    mat_line = lm.create_pbr_material("Mat_ktxa_Line", "#E8F5E9", roughness=0.7)
    mat_trunk = lm.create_pbr_material("Mat_ktxa_Trunk", "#4E342E", roughness=0.9)
    mat_leaf = lm.create_pbr_material("Mat_ktxa_Leaf", "#2E7D32", roughness=0.88)
    mat_court = lm.create_pbr_material("Mat_ktxa_CourtEdge", "#5D4037", roughness=0.9)
    mat_clothes = lm.create_pbr_material("Mat_ktxa_Clothes", "#EF5350", roughness=0.75)
    mat_faction = lm.faction_material("ktx_khu_a")

    objs = []
    floors = 5
    floor_h = 3.2
    # U-shape around courtyard center at origin
    # Back slab (north)
    objs.extend(_slab_block("KTXA_Back", 0.0, 14.0, 40.0, 10.0, floors, mat_mustard, mat_balcony, mat_window, collection))
    # Left wing
    objs.extend(_slab_block("KTXA_Left", -18.0, 0.0, 28.0, 10.0, floors, mat_old_white, mat_balcony, mat_window, collection, rot_z=math.pi/2))
    # Right wing
    objs.extend(_slab_block("KTXA_Right", 18.0, 0.0, 28.0, 10.0, floors, mat_mustard, mat_balcony, mat_window, collection, rot_z=math.pi/2))

    # Mini football pitch in courtyard
    pitch = lm.add_plane("KTXA_Pitch", (22.0, 14.0), (0.0, 0.0, 0.05), mat_turf, collection)
    objs.append(pitch)
    mid = lm.add_cube("KTXA_PitchMid", (0.25, 14.0, 0.02), (0.0, 0.0, 0.08), mat_line, collection)
    center_circle = lm.add_cylinder("KTXA_PitchCircle", 2.2, 0.03, (0.0, 0.0, 0.09), mat_line, collection, vertices=10)
    for sign in (-1.0, 1.0):
        goal = lm.add_cube(f"KTXA_Goal_{int(sign)}", (0.3, 3.5, 1.2), (sign * 10.5, 0.0, 0.65), mat_line, collection)
        objs.append(goal)
    objs.extend([mid, center_circle])

    # Trees around courtyard
    for i, (x, y) in enumerate([(-10, -7), (10, -7), (-10, 7), (10, 7), (-14, 0), (14, 0), (0, -8), (0, 8)]):
        trunk = lm.add_cylinder(f"KTXA_Trunk_{i}", 0.25, 2.8, (x, y, 1.4), mat_trunk, collection, vertices=6)
        canopy = lm.add_icosphere(f"KTXA_Canopy_{i}", 1.8 + (i % 3) * 0.2, (x, y, 3.4), mat_leaf, collection, subdivisions=1)
        canopy2 = lm.add_icosphere(f"KTXA_Canopy2_{i}", 1.1, (x + 0.5, y - 0.3, 4.3), mat_leaf, collection, subdivisions=1)
        objs.extend([trunk, canopy, canopy2])

    # Clothesline accents
    for i in range(5):
        y = 9.5 + (i % 2) * 1.2
        cloth = lm.add_cube(
            f"KTXA_Cloth_{i}", (0.7, 0.08, 0.9),
            (-8 + i * 4.0, y, 8.0 + (i % 2) * 0.5),
            mat_clothes if i % 2 == 0 else mat_line, collection
        )
        objs.append(cloth)

    # Faction barracks sign
    sign = lm.add_cube("KTXA_FactionSign", (6.0, 0.35, 1.3), (0.0, 8.8, 2.2), mat_faction, collection)
    objs.append(sign)
    gate = lm.add_cube("KTXA_Gate", (8.0, 0.6, 3.5), (0.0, -9.5, 1.75), mat_old_white, collection)
    objs.append(gate)

    return objs


if __name__ == "__main__":
    lm.run_landmark_builder(build, "ktx_khu_a", META)
