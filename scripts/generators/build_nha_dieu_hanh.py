"""Khu Nhà điều hành ĐHQG — 10-story symmetrical command HQ tower."""
from __future__ import annotations

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import bpy
import _landmark_common as lm

META = {
    "id": "landmark_nha_dieu_hanh",
    "name": "Khu Nhà điều hành ĐHQG-HCM",
    "gameplay_role": "command_headquarters",
    "tile_footprint": {"width": 6, "depth": 5},
}


def build(collection):
    mat_concrete = lm.create_pbr_material("Mat_dieu_hanh_Concrete", "#E8ECED", roughness=0.78)
    mat_glass = lm.create_pbr_material(
        "Mat_dieu_hanh_Glass", "#81D4FA", roughness=0.12, alpha=0.85, transmission=0.7
    )
    mat_louver = lm.create_pbr_material("Mat_dieu_hanh_Louver", "#B0BEC5", roughness=0.7)
    mat_roof = lm.create_pbr_material("Mat_dieu_hanh_Roof", "#8D6E63", roughness=0.85)
    mat_plaza = lm.create_pbr_material("Mat_dieu_hanh_Plaza", "#90A4AE", roughness=0.88)
    mat_stairs = lm.create_pbr_material("Mat_dieu_hanh_Stairs", "#CFD8DC", roughness=0.8)
    mat_flag = lm.create_pbr_material("Mat_dieu_hanh_Flagpole", "#78909C", metallic=0.7, roughness=0.35)
    mat_flag_cloth = lm.create_pbr_material(
        "Mat_dieu_hanh_FlagCloth", "#DA251D", roughness=0.6, emit_hex="#DA251D", emit_strength=0.5
    )
    mat_wing = lm.create_pbr_material("Mat_dieu_hanh_Wing", "#E0E0E0", roughness=0.8)
    mat_faction = lm.faction_material("nha_dieu_hanh")

    objs = []

    # Plaza (pivot at front stair base)
    plaza = lm.add_plane("DieuHanh_Plaza", (46.0, 36.0), (0.0, 8.0, 0.0), mat_plaza, collection)
    objs.append(plaza)

    # Grand stairs (3 steps toward -Y front)
    for i, (sy, sz, sdepth) in enumerate([( -10.5, 0.25, 2.5), (-8.8, 0.5, 2.0), (-7.4, 0.75, 1.6)]):
        step = lm.add_cube(f"DieuHanh_Step_{i}", (16.0, sdepth, 0.25), (0.0, sy, sz), mat_stairs, collection)
        objs.append(step)

    # Podium 2 floors
    podium = lm.add_cube("DieuHanh_Podium", (28.0, 18.0, 8.0), (0.0, 2.0, 4.0 + 0.75), mat_concrete, collection)
    objs.append(podium)
    lm.bevel_object(podium, width=0.15, segments=1)

    # Glass lobby recess suggestion
    lobby = lm.add_cube("DieuHanh_LobbyGlass", (10.0, 0.4, 4.5), (0.0, -6.9, 3.2), mat_glass, collection)
    objs.append(lobby)

    # Columns at entrance
    for i, x in enumerate((-6.5, -2.2, 2.2, 6.5)):
        col = lm.add_cylinder(f"DieuHanh_Col_{i}", 0.45, 5.5, (x, -6.2, 3.5), mat_concrete, collection, vertices=8)
        objs.append(col)

    # Main tower body 10 floors (~32m) above podium
    tower = lm.add_cube("DieuHanh_Tower", (22.0, 14.0, 32.0), (0.0, 2.0, 8.75 + 16.0), mat_glass, collection)
    objs.append(tower)

    # Vertical louvers on long faces (denser rhythm)
    for face_sign in (-1.0, 1.0):
        y = 2.0 + face_sign * 7.2
        for i in range(13):
            x = -10.8 + i * 1.8
            lou = lm.add_cube(
                f"DieuHanh_Louver_{int(face_sign)}_{i}",
                (0.32, 0.45, 30.0),
                (x, y, 8.75 + 15.5),
                mat_louver,
                collection,
            )
            objs.append(lou)
            # sunshade fins every other louver
            if i % 2 == 0:
                fin = lm.add_cube(
                    f"DieuHanh_Fin_{int(face_sign)}_{i}",
                    (0.32, 0.9, 0.25),
                    (x, y + face_sign * 0.25, 8.75 + 22.0),
                    mat_concrete,
                    collection,
                )
                objs.append(fin)

    # Short side louvers
    for face_sign in (-1.0, 1.0):
        x = face_sign * 11.2
        for i in range(9):
            y = -5.0 + i * 1.6
            lou = lm.add_cube(
                f"DieuHanh_SideLou_{int(face_sign)}_{i}",
                (0.4, 0.32, 28.0),
                (x, y, 8.75 + 14.5),
                mat_louver,
                collection,
            )
            objs.append(lou)

    # Floor bands + window strip suggestion
    for fl in range(1, 10):
        z = 8.75 + fl * 3.2
        band = lm.add_cube(f"DieuHanh_Band_{fl}", (22.4, 14.4, 0.25), (0.0, 2.0, z), mat_concrete, collection)
        objs.append(band)
        for sign in (-1.0, 1.0):
            win = lm.add_cube(
                f"DieuHanh_WinBand_{fl}_{int(sign)}",
                (18.0, 0.2, 1.4),
                (0.0, 2.0 + sign * 7.05, z + 1.4),
                mat_glass,
                collection,
            )
            objs.append(win)

    # Hip roof
    roof = lm.hip_roof("DieuHanh_Roof", 22.0, 14.0, 5.5, (0.0, 2.0, 8.75 + 32.0), mat_roof, collection)
    objs.append(roof)

    # Facade sign band + faction accent
    signband = lm.add_cube("DieuHanh_SignBand", (12.0, 0.35, 1.4), (0.0, -5.2, 8.75 + 30.5), mat_faction, collection)
    objs.append(signband)
    accent = lm.add_cube("DieuHanh_FactionAccent", (18.0, 0.3, 1.0), (0.0, 9.1, 20.0), mat_faction, collection)
    objs.append(accent)

    # Symmetric 3-story side wings
    for sign in (-1.0, 1.0):
        wing = lm.add_cube(
            f"DieuHanh_Wing_{int(sign)}", (10.0, 12.0, 9.0),
            (sign * 19.0, 4.0, 4.5 + 0.75), mat_wing, collection
        )
        objs.append(wing)
        wing_roof = lm.hip_roof(
            f"DieuHanh_WingRoof_{int(sign)}", 10.0, 12.0, 2.0,
            (sign * 19.0, 4.0, 13.5 + 0.75), mat_roof, collection
        )
        objs.append(wing_roof)
        # wing windows
        for fl in range(3):
            for j in range(4):
                win = lm.add_cube(
                    f"DieuHanh_WingWin_{int(sign)}_{fl}_{j}",
                    (1.5, 0.2, 1.2),
                    (sign * 19.0 - 3.0 + j * 2.0, 4.0 - 6.1, 2.2 + fl * 2.8 + 0.75),
                    mat_glass,
                    collection,
                )
                objs.append(win)
            # side windows on wing
            for j in range(2):
                win = lm.add_cube(
                    f"DieuHanh_WingSideWin_{int(sign)}_{fl}_{j}",
                    (0.2, 1.4, 1.1),
                    (sign * 24.05, 1.5 + j * 3.0, 2.2 + fl * 2.8 + 0.75),
                    mat_glass,
                    collection,
                )
                objs.append(win)
        # wing louver strip
        strip = lm.add_cube(
            f"DieuHanh_WingStrip_{int(sign)}",
            (0.35, 9.0, 7.5),
            (sign * 24.05, 4.0, 6.0),
            mat_louver,
            collection,
        )
        objs.append(strip)

    # Ceremonial flagpole in plaza center-front
    pole = lm.add_cylinder("DieuHanh_Flagpole", 0.18, 16.0, (0.0, -4.0, 8.0), mat_flag, collection, vertices=8)
    base = lm.add_cylinder("DieuHanh_FlagBase", 0.7, 0.6, (0.0, -4.0, 0.3), mat_stairs, collection, vertices=8)
    cloth = lm.add_cube("DieuHanh_Flag", (2.4, 0.08, 1.5), (1.3, -4.0, 14.5), mat_flag_cloth, collection)
    objs.extend([pole, base, cloth])

    return objs


if __name__ == "__main__":
    lm.run_landmark_builder(build, "nha_dieu_hanh", META)
