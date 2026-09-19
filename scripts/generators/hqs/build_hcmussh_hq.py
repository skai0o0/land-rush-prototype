"""HCMUSSH HQ — Heritage Knowledge Temple (Ziggurat + Khuê Văn Các)."""
from __future__ import annotations

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import _hq_common as hq


META = {
    "name": "Trường Đại học Khoa học Xã hội và Nhân văn (HCMUSSH)",
    "concept": "Đền Đài Tri Thức Văn Hiến / Heritage Knowledge Temple",
    "primary_colors": ["#FDB813", "#D8CBB5", "#C1272D"],
    "emission_colors": ["#C1272D"],
    "tactical_role": "Mở rộng ranh giới chiếm đất, tăng sĩ khí",
}


def build(collection):
    mat_stone = hq.create_pbr_material("MAT_NV_Sandstone", "#D8CBB5", metallic=0.05, roughness=0.9)
    mat_blue = hq.create_pbr_material("MAT_NV_DeepBlue", "#002060", metallic=0.2, roughness=0.5)
    mat_gold = hq.create_pbr_material("MAT_NV_ImperialGold", "#FDB813", metallic=0.7, roughness=0.3)
    mat_terra = hq.create_pbr_material("MAT_NV_Terracotta", "#8B2500", metallic=0.1, roughness=0.7)
    mat_crimson = hq.create_pbr_material(
        "MAT_NV_CrimsonGlow", "#C1272D", roughness=0.4, emit_hex="#C1272D", emit_strength=6.0
    )

    objs = []
    # Reflecting water plinth (low wide base)
    objs.append(hq.add_cube("HCMUSSH_WaterMirror", (42.0, 42.0, 0.6), (0, 0, 0.3), mat_blue, collection))

    # 3-tier ziggurat
    tiers = [
        (36.0, 3.0, 2.1),
        (28.0, 2.6, 5.0),
        (20.0, 2.2, 7.6),
    ]
    for i, (size, h, z) in enumerate(tiers):
        objs.append(hq.add_cube(f"HCMUSSH_StoneTier_{i}", (size, size, h), (0, 0, z), mat_stone, collection))

    # 16-column colonnade
    radius = 8.5
    for i in range(16):
        ang = math.radians(i * 22.5)
        x, y = radius * math.cos(ang), radius * math.sin(ang)
        objs.append(
            hq.add_cylinder(
                f"HCMUSSH_Column_{i}",
                0.55,
                9.0,
                (x, y, 8.7 + 4.5),
                mat_blue,
                collection,
                vertices=8,
            )
        )

    # Main hall (Khuê Văn Các)
    objs.append(hq.add_cube("HCMUSSH_Hall", (14.0, 14.0, 8.0), (0, 0, 8.7 + 4.0), mat_gold, collection))
    # 4 circular windows as protruding cylinders
    for i, (dx, dy, rot) in enumerate(
        ((7.2, 0.0, (0, math.pi / 2, 0)), (-7.2, 0.0, (0, math.pi / 2, 0)), (0.0, 7.2, (math.pi / 2, 0, 0)), (0.0, -7.2, (math.pi / 2, 0, 0)))
    ):
        objs.append(
            hq.add_cylinder(
                f"HCMUSSH_Window_{i}",
                2.0,
                0.8,
                (dx, dy, 12.7),
                mat_crimson,
                collection,
                vertices=12,
                rotation=rot,
            )
        )

    # Two-tier slanted roofs
    objs.append(
        hq.add_cylinder(
            "HCMUSSH_Roof1",
            11.0,
            2.0,
            (0, 0, 17.5),
            mat_terra,
            collection,
            vertices=4,
            radius_top=8.0,
        )
    )
    objs.append(
        hq.add_cube("HCMUSSH_Roof1_Cap", (18.0, 18.0, 0.5), (0, 0, 18.4), mat_gold, collection)
    )
    objs.append(
        hq.add_cylinder(
            "HCMUSSH_Roof2",
            7.5,
            2.2,
            (0, 0, 20.0),
            mat_terra,
            collection,
            vertices=4,
            radius_top=4.5,
        )
    )
    objs.append(hq.add_cube("HCMUSSH_Roof2_Cap", (12.0, 12.0, 0.45), (0, 0, 21.2), mat_gold, collection))

    # Hall decorative bands + roof ornaments
    objs.append(hq.add_cube("HCMUSSH_HallBand", (14.6, 14.6, 0.6), (0, 0, 15.5), mat_blue, collection))
    for i in range(8):
        ang = math.radians(i * 45 + 22.5)
        objs.append(
            hq.add_cube(
                f"HCMUSSH_RoofOrnament_{i}",
                (0.7, 0.7, 1.4),
                (9.2 * math.cos(ang), 9.2 * math.sin(ang), 18.8),
                mat_gold,
                collection,
                rotation=(0.0, 0.0, ang),
            )
        )
    # ziggurat floor pattern tiles
    for tier, (size, h, z) in enumerate(tiers):
        half = size * 0.35
        for i in range(4):
            ang = math.radians(i * 90 + 45)
            objs.append(
                hq.add_cube(
                    f"HCMUSSH_Tile_{tier}_{i}",
                    (2.2, 2.2, 0.25),
                    (half * math.cos(ang), half * math.sin(ang), z + h * 0.5 + 0.05),
                    mat_gold,
                    collection,
                )
            )

    # Crimson humanities globe apex
    objs.append(hq.add_cylinder("HCMUSSH_GlobePedestal", 1.6, 2.0, (0, 0, 22.4), mat_blue, collection, vertices=8))
    objs.append(hq.add_uvsphere("HCMUSSH_GlobeApex", 3.2, (0, 0, 26.5), mat_crimson, collection, segments=16, rings=10))
    objs.append(hq.add_torus("HCMUSSH_GlobeRing", 3.4, 0.18, (0, 0, 26.5), mat_gold, collection))
    for i in range(4):
        ang = math.radians(i * 90)
        objs.append(
            hq.add_cube(
                f"HCMUSSH_GlobeRay_{i}",
                (0.25, 0.25, 2.2),
                (2.8 * math.cos(ang), 2.8 * math.sin(ang), 26.5 + 2.2),
                mat_gold,
                collection,
                rotation=(0.6, 0.0, ang),
            )
        )

    return objs


if __name__ == "__main__":
    hq.run_school_builder(build, "hcmussh", META)
