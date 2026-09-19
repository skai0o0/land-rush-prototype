"""Hồ Đá — inverted stepped quarry lake, water plane, broken guard rails."""
from __future__ import annotations

import math
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import bpy
import _landmark_common as lm

META = {
    "id": "landmark_ho_da",
    "name": "Cụm Hồ Đá Làng Đại học",
    "gameplay_role": "chokepoint_hazard",
    "tile_footprint": {"width": 6, "depth": 5},
}


def _quarry_mesh():
    """Terraced inverted quarry: rim ~+2..+6m, floor ~-10m, water at Z=0."""
    random.seed(11)
    # Outer rim octagon-ish ring and inner rings
    rings = [
        # (radius_xy, z, irregular)
        (24.0, 4.5, 1.6),
        (22.0, 3.2, 1.3),
        (20.0, 2.0, 1.2),
        (17.5, 0.0, 1.1),
        (16.0, -2.0, 1.0),
        (13.5, -4.0, 0.9),
        (12.0, -6.0, 0.8),
        (9.5, -8.0, 0.6),
        (8.0, -9.5, 0.5),
    ]
    segs = 16
    verts = []
    ring_starts = []
    for ri, (rad, z, irr) in enumerate(rings):
        ring_starts.append(len(verts))
        for i in range(segs):
            ang = (2 * math.pi * i) / segs + ri * 0.07
            r = rad + random.uniform(-irr, irr)
            # elongate X for quarry feel
            x = r * 1.2 * math.cos(ang)
            y = r * 0.95 * math.sin(ang)
            zz = z + random.uniform(-0.4, 0.4)
            verts.append((x, y, zz))
    # floor center
    center_idx = len(verts)
    verts.append((0.5, -0.3, -10.0))

    faces = []
    for ri in range(len(rings) - 1):
        a0 = ring_starts[ri]
        b0 = ring_starts[ri + 1]
        for i in range(segs):
            j = (i + 1) % segs
            faces.append((a0 + i, a0 + j, b0 + j, b0 + i))
    last = ring_starts[-1]
    for i in range(segs):
        j = (i + 1) % segs
        faces.append((last + i, last + j, center_idx))
    # outer skirt down a bit
    outer = ring_starts[0]
    skirt = len(verts)
    for i in range(segs):
        ang = (2 * math.pi * i) / segs
        r = 25.5
        verts.append((r * 1.2 * math.cos(ang), r * 0.95 * math.sin(ang), 0.2))
    for i in range(segs):
        j = (i + 1) % segs
        faces.append((outer + i, outer + j, skirt + j, skirt + i))
    return verts, faces


def build(collection):
    mat_rock = lm.create_pbr_material("Mat_ho_da_Rock", "#6D4C41", roughness=0.92)
    mat_rock_dark = lm.create_pbr_material("Mat_ho_da_RockDark", "#4E342E", roughness=0.95)
    mat_water = lm.create_pbr_material(
        "Mat_ho_da_Water", "#0D5C4D", roughness=0.05, alpha=0.72, transmission=0.85
    )
    mat_rail = lm.create_pbr_material("Mat_ho_da_Rail", "#37474F", metallic=0.7, roughness=0.45)
    mat_sign = lm.create_pbr_material("Mat_ho_da_Sign", "#FDD835", roughness=0.55)
    mat_sign_border = lm.create_pbr_material("Mat_ho_da_SignBorder", "#C62828", roughness=0.5)
    mat_bush = lm.create_pbr_material("Mat_ho_da_Bush", "#2E7D32", roughness=0.9)
    mat_dirt = lm.create_pbr_material("Mat_ho_da_Dirt", "#8D6E63", roughness=0.95)
    mat_faction = lm.faction_material("ho_da")

    objs = []

    verts, faces = _quarry_mesh()
    quarry = lm.create_mesh_object("HoDa_Quarry", verts, faces, (0, 0, 0), mat_rock, collection)
    objs.append(quarry)

    # Water plane at Z=0
    water = lm.add_plane("HoDa_Water", (42.0, 34.0), (0, 0, 0.0), mat_water, collection)
    objs.append(water)

    # Outer ground apron
    apron = lm.add_cylinder("HoDa_Apron", 27.0, 0.4, (0, 0, 0.2), mat_dirt, collection, vertices=12)
    apron.scale = (1.15, 0.95, 1.0)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    objs.append(apron)

    # Fragmented guard rails on rim
    random.seed(7)
    for i in range(18):
        ang = math.radians(i * 20 + random.uniform(-5, 5))
        if i in (2, 5, 8, 12, 15):
            continue  # broken segments
        r = 23.0
        x = r * 1.15 * math.cos(ang)
        y = r * 0.92 * math.sin(ang)
        post = lm.add_cone(
            f"HoDa_RailPost_{i}", 0.18, 1.4, (x, y, 5.2), mat_rail, collection, vertices=5
        )
        objs.append(post)
        rail = lm.add_cube(
            f"HoDa_RailBar_{i}",
            (2.4, 0.12, 0.1),
            (x, y, 5.7),
            mat_rail,
            collection,
            rotation=(0, 0, ang + math.pi / 2),
        )
        objs.append(rail)
        if i % 2 == 0:
            brace = lm.add_cube(
                f"HoDa_RailBrace_{i}",
                (0.1, 0.1, 0.7),
                (x, y, 5.0),
                mat_rail,
                collection,
            )
            objs.append(brace)

    # Hazard signs (triangle-ish: cone 3)
    for i, ang_deg in enumerate((15, 95, 170, 250)):
        ang = math.radians(ang_deg)
        r = 21.5
        x = r * 1.12 * math.cos(ang)
        y = r * 0.9 * math.sin(ang)
        post = lm.add_cylinder(f"HoDa_SignPost_{i}", 0.08, 1.2, (x, y, 4.0), mat_rail, collection, vertices=5)
        sign = lm.add_cone(f"HoDa_Sign_{i}", 0.7, 0.12, (x, y, 4.7), mat_sign, collection, vertices=3)
        sign.rotation_euler = (math.pi / 2, 0, ang)
        bpy.ops.object.transform_apply(rotation=True)
        objs.extend([post, sign])

    # Low-poly tràm bushes + terrace shrubs
    for i in range(16):
        ang = math.radians(i * 22 + 10)
        r = 12.0 + (i % 5) * 2.4
        x = r * 1.05 * math.cos(ang)
        y = r * 0.88 * math.sin(ang)
        z = -1.0 + (i % 4) * 1.4
        bush = lm.add_icosphere(
            f"HoDa_Bush_{i}", 0.85 + (i % 3) * 0.25, (x, y, z), mat_bush, collection, subdivisions=1
        )
        objs.append(bush)

    # Faction accent ring on rim (capture point)
    ring = lm.add_cylinder("HoDa_FactionRing", 24.8, 0.35, (0, 0, 4.85), mat_faction, collection, vertices=12)
    ring.scale = (1.12, 0.93, 1.0)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    cutter = lm.add_cylinder("HoDa_RingCut", 24.0, 1.0, (0, 0, 4.85), None, collection, vertices=12)
    cutter.scale = (1.12, 0.93, 1.0)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    lm.boolean_difference(ring, cutter)
    objs.append(ring)

    # Dark rock accents + quarry step rubble
    rocks = [
        (14, 8, 3.2), (-16, -6, 2.4), (8, -14, 1.8),
        (12, -8, -1.5), (-10, 9, -3.0), (5, 11, -5.5),
        (-7, -10, -7.0), (3, -5, -8.8), (-4, 3, -9.2),
        (18, 2, 2.8), (-18, 4, 2.0), (0, 16, 3.5),
        (0, -16, 2.2), (-20, -2, 3.0), (20, -4, 2.6),
    ]
    for i, (x, y, z) in enumerate(rocks):
        rock = lm.add_icosphere(
            f"HoDa_RockAcc_{i}", 0.9 + (i % 3) * 0.35,
            (x, y, z), mat_rock_dark, collection, subdivisions=1
        )
        objs.append(rock)

    return objs


if __name__ == "__main__":
    lm.run_landmark_builder(build, "ho_da", META)
