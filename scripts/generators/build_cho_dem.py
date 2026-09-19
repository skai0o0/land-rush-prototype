"""Chợ đêm Làng ĐH — kiosk grid, striped hip awnings, string lights, food carts."""
from __future__ import annotations

import math
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import bpy
import _landmark_common as lm

META = {
    "id": "landmark_cho_dem",
    "name": "Chợ đêm Làng Đại học",
    "gameplay_role": "economy_hub",
    "tile_footprint": {"width": 5, "depth": 4},
}


def _kiosk(name, x, y, body_mat, awning_mat, collection, rot_z=0.0, scale=1.0):
    objs = []
    body = lm.add_cube(
        f"{name}_Body", (2.2 * scale, 1.8 * scale, 1.6 * scale),
        (x, y, 0.8 * scale), body_mat, collection, rotation=(0, 0, rot_z)
    )
    objs.append(body)
    counter = lm.add_cube(
        f"{name}_Counter", (2.4 * scale, 0.45 * scale, 0.9 * scale),
        (x, y - 0.95 * scale * math.cos(rot_z), 0.5 * scale),
        body_mat, collection, rotation=(0, 0, rot_z)
    )
    objs.append(counter)
    roof = lm.pyramid_roof(
        f"{name}_Awning", 2.8 * scale, 2.4 * scale, 0.85 * scale,
        (x, y, 1.6 * scale), awning_mat, collection, top_scale=0.25
    )
    roof.rotation_euler = (0, 0, rot_z)
    bpy.ops.object.transform_apply(rotation=True)
    objs.append(roof)
    return objs


def build(collection):
    random.seed(21)
    mat_ground = lm.create_pbr_material("Mat_cho_Ground", "#455A64", roughness=0.92)
    mat_kiosk_a = lm.create_pbr_material("Mat_cho_KioskFrame", "#37474F", roughness=0.8)
    mat_kiosk_b = lm.create_pbr_material("Mat_cho_KioskWood", "#6D4C41", roughness=0.85)
    mat_awn_1 = lm.create_pbr_material("Mat_cho_AwningBlue", "#1565C0", roughness=0.7)
    mat_awn_2 = lm.create_pbr_material("Mat_cho_AwningRed", "#C62828", roughness=0.7)
    mat_awn_3 = lm.create_pbr_material("Mat_cho_AwningYellow", "#F9A825", roughness=0.7)
    mat_awn_4 = lm.create_pbr_material("Mat_cho_AwningGreen", "#2E7D32", roughness=0.7)
    mat_wire = lm.create_pbr_material("Mat_cho_Wire", "#212121", metallic=0.4, roughness=0.5)
    mat_bulb = lm.create_pbr_material(
        "Mat_cho_Bulb", "#FFA726", roughness=0.35, emit_hex="#FFA726", emit_strength=4.0
    )
    mat_bulb_w = lm.create_pbr_material(
        "Mat_cho_BulbWhite", "#FFFDE7", roughness=0.35, emit_hex="#FFF59D", emit_strength=4.0
    )
    mat_chair_r = lm.create_pbr_material("Mat_cho_ChairR", "#E53935", roughness=0.6)
    mat_chair_b = lm.create_pbr_material("Mat_cho_ChairB", "#1E88E5", roughness=0.6)
    mat_cart = lm.create_pbr_material("Mat_cho_Cart", "#795548", roughness=0.8)
    mat_smoke = lm.create_pbr_material("Mat_cho_Smoke", "#ECEFF1", roughness=0.9, alpha=0.45)
    mat_faction = lm.faction_material("cho_dem")
    awnings = [mat_awn_1, mat_awn_2, mat_awn_3, mat_awn_4]

    objs = []
    ground = lm.add_plane("ChoDem_Ground", (36.0, 28.0), (0.0, 0.0, 0.0), mat_ground, collection)
    objs.append(ground)

    # 2D grid of kiosks: 2 rows x 4-5, walkways between
    # Pivot at main entrance axis
    positions = []
    for row, y in enumerate((-7.0, -1.5, 4.0, 9.0)):
        cols = 4 if row % 2 == 0 else 3
        x0 = -12.0 if cols == 4 else -8.0
        for col in range(cols):
            x = x0 + col * 6.5
            positions.append((x, y, row, col))

    for idx, (x, y, row, col) in enumerate(positions):
        body_mat = mat_kiosk_a if idx % 2 == 0 else mat_kiosk_b
        awn = awnings[idx % 4]
        rot = math.radians(random.uniform(-5, 5))
        sc = random.uniform(0.9, 1.1)
        objs.extend(_kiosk(f"ChoDem_Kiosk_{idx}", x, y, body_mat, awn, collection, rot, sc))
        # striped awning stripe accent
        if idx % 2 == 0:
            stripe = lm.add_cube(
                f"ChoDem_Stripe_{idx}",
                (2.5 * sc, 0.35, 0.12),
                (x, y + 1.0 * sc, 2.15 * sc),
                awnings[(idx + 1) % 4],
                collection,
                rotation=(0, 0, rot),
            )
            objs.append(stripe)

    # Overhead sagging wires + bulbs along walkways
    for wi, y in enumerate((-4.2, 1.3, 6.5)):
        # approximate sag with 4 short segments
        pts = []
        for i in range(5):
            t = i / 4.0
            x = -14.0 + 28.0 * t
            z = 4.2 - 0.9 * math.sin(t * math.pi)
            pts.append((x, y, z))
        for i in range(4):
            x0, y0, z0 = pts[i]
            x1, y1, z1 = pts[i + 1]
            mx, my, mz = (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2
            dx, dy, dz = x1 - x0, y1 - y0, z1 - z0
            length = math.sqrt(dx * dx + dy * dy + dz * dz)
            wire = lm.add_cylinder(
                f"ChoDem_Wire_{wi}_{i}", 0.035, length, (mx, my, mz), mat_wire, collection, vertices=5
            )
            # orient roughly
            wire.rotation_euler = (0, math.atan2(math.hypot(dx, dy), dz) if dz else 0, math.atan2(dy, dx))
            # simpler: leave as vertical-ish stubs + bulbs
            objs.append(wire)
            bulb_mat = mat_bulb if (i + wi) % 2 == 0 else mat_bulb_w
            bulb = lm.add_icosphere(
                f"ChoDem_Bulb_{wi}_{i}", 0.28, (mx, my, mz - 0.2), bulb_mat, collection, subdivisions=1
            )
            objs.append(bulb)

    # Food carts + smoke puffs
    for i, (x, y) in enumerate([(-2, -9.5), (8, -9.0), (-10, 8.5)]):
        cart = lm.add_cube(f"ChoDem_Cart_{i}", (2.0, 1.2, 1.0), (x, y, 0.55), mat_cart, collection)
        wheel1 = lm.add_cylinder(f"ChoDem_Wheel_{i}_0", 0.28, 0.15, (x - 0.7, y - 0.5, 0.28), mat_wire, collection, vertices=8, rotation=(math.pi/2, 0, 0))
        wheel2 = lm.add_cylinder(f"ChoDem_Wheel_{i}_1", 0.28, 0.15, (x + 0.7, y - 0.5, 0.28), mat_wire, collection, vertices=8, rotation=(math.pi/2, 0, 0))
        objs.extend([cart, wheel1, wheel2])
        for k in range(3):
            puff = lm.add_icosphere(
                f"ChoDem_Smoke_{i}_{k}", 0.35 + k * 0.15,
                (x + 0.2, y, 1.3 + k * 0.45), mat_smoke, collection, subdivisions=1
            )
            objs.append(puff)

    # Plastic chairs stacks
    for i, (x, y, mat) in enumerate([
        (3.5, -3.0, mat_chair_b), (-6.0, 2.5, mat_chair_r), (11.0, 2.0, mat_chair_b), (-3.0, 7.5, mat_chair_r)
    ]):
        for k in range(2):
            chair = lm.add_cube(
                f"ChoDem_Chair_{i}_{k}", (0.55, 0.55, 0.45),
                (x, y, 0.25 + k * 0.42), mat, collection, rotation=(0, 0, math.radians(i * 20))
            )
            objs.append(chair)

    # Faction market gate banner
    gate_l = lm.add_cube("ChoDem_GateL", (0.5, 0.5, 4.0), (-3.0, -13.0, 2.0), mat_kiosk_a, collection)
    gate_r = lm.add_cube("ChoDem_GateR", (0.5, 0.5, 4.0), (3.0, -13.0, 2.0), mat_kiosk_a, collection)
    banner = lm.add_cube("ChoDem_FactionBanner", (6.5, 0.35, 1.1), (0.0, -13.0, 3.7), mat_faction, collection)
    objs.extend([gate_l, gate_r, banner])

    return objs


if __name__ == "__main__":
    lm.run_landmark_builder(build, "cho_dem", META)
