"""Nhà Văn hóa Sinh viên — hex prism, elliptical atrium, roof garden, faction ring."""
from __future__ import annotations

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import bpy
import _landmark_common as lm

META = {
    "id": "landmark_nvh_sinh_vien",
    "name": "Nhà Văn hóa Sinh viên",
    "gameplay_role": "spirit_camp",
    "tile_footprint": {"width": 8, "depth": 7},
}


def build(collection):
    mat_facade = lm.create_pbr_material("Mat_NVHSV_WhiteShell", "#ECEFF1", roughness=0.6)
    mat_roof_lawn = lm.create_pbr_material("Mat_NVHSV_RoofLawn", "#2E7D32", roughness=0.9)
    mat_base_plaza = lm.create_pbr_material("Mat_NVHSV_BasePlaza", "#607D8B", roughness=0.85)
    mat_honeycomb = lm.create_pbr_material("Mat_NVHSV_Honeycomb", "#FFFFFF", roughness=0.55)
    mat_column = lm.create_pbr_material("Mat_NVHSV_Column", "#B0BEC5", roughness=0.75)
    mat_faction = lm.faction_material("nvh_sinh_vien")

    objs = []

    # Ground plaza hexagon
    base = lm.add_cylinder("NVHSV_GroundPlaza", 31.0, 1.0, (0.0, 0.0, 0.5), mat_base_plaza, collection, vertices=6)
    objs.append(base)

    # Angled ground columns (recessed base)
    for i in range(6):
        ang = math.radians(30 + i * 60)
        x, y = 22.0 * math.cos(ang), 22.0 * math.sin(ang)
        col = lm.add_cylinder(
            f"NVHSV_Column_{i}", 0.9, 7.0, (x, y, 4.0), mat_column, collection, vertices=6,
            rotation=(math.radians(8) * math.cos(ang + math.pi/2), math.radians(8) * math.sin(ang + math.pi/2), 0),
        )
        objs.append(col)

    # Main hexagonal shell 5 floors
    main = lm.add_cylinder("NVHSV_MainStructure", 28.0, 20.0, (0.0, 0.0, 11.0), mat_facade, collection, vertices=6)
    objs.append(main)

    # Elliptical atrium cutter (Boolean)
    cutter = lm.add_cylinder("Cutter_Atrium_Volume", 9.5, 32.0, (0.0, 0.0, 15.0), None, collection, vertices=24)
    cutter.scale = (1.45, 0.85, 1.0)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    lm.boolean_difference(main, cutter)

    # Honeycomb lattice suggestion: hex studs on 6 faces
    for i in range(6):
        ang = math.radians(i * 60)
        nx, ny = math.cos(ang + math.pi/6), math.sin(ang + math.pi/6)
        for row in range(4):
            for col in range(2):
                # place on hex face mid
                face_r = 26.8
                fx = face_r * math.cos(ang) + nx * 0.3
                fy = face_r * math.sin(ang) + ny * 0.3
                # offset along face tangent
                tx, ty = -math.sin(ang), math.cos(ang)
                fx += tx * (col * 4.5 - 2.2)
                fy += ty * (col * 4.5 - 2.2)
                fz = 5.0 + row * 4.5
                cell = lm.add_cylinder(
                    f"NVHSV_HexCell_{i}_{row}_{col}",
                    1.4, 0.35, (fx, fy, fz), mat_honeycomb, collection, vertices=6,
                    rotation=(math.pi/2, 0, ang),
                )
                objs.append(cell)

    # Roof garden with atrium hole
    roof = lm.add_cylinder("NVHSV_RoofPark", 26.5, 0.6, (0.0, 0.0, 21.3), mat_roof_lawn, collection, vertices=6)
    roof_cutter = lm.add_cylinder("Roof_AtriumCut", 9.5, 2.0, (0.0, 0.0, 21.3), None, collection, vertices=24)
    roof_cutter.scale = (1.45, 0.85, 1.0)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    lm.boolean_difference(roof, roof_cutter)
    objs.append(roof)

    # Terraced garden pads
    for i, (x, y, r) in enumerate([(12, 8, 3.5), (-12, -6, 3.0), (8, -12, 2.8), (-10, 10, 3.2)]):
        pad = lm.add_cylinder(f"NVHSV_GardenPad_{i}", r, 0.5, (x, y, 21.8), mat_roof_lawn, collection, vertices=6)
        objs.append(pad)

    # Faction ring at roof edge
    ring = lm.add_cylinder("NVHSV_FactionRing", 28.2, 1.2, (0.0, 0.0, 20.4), mat_faction, collection, vertices=6)
    ring_cutter = lm.add_cylinder("Ring_Hole", 27.4, 2.0, (0.0, 0.0, 20.4), None, collection, vertices=6)
    lm.boolean_difference(ring, ring_cutter)
    objs.append(ring)

    # Bevel main masses
    for target in (base, main):
        lm.bevel_object(target, width=0.25, segments=1, angle_limit=35.0)

    return objs


if __name__ == "__main__":
    lm.run_landmark_builder(build, "nvh_sinh_vien", META)
