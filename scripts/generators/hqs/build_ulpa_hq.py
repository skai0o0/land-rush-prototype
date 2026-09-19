"""VNU-ULPA HQ — Civic Citadel & Sovereign Justice (basalt square + scales)."""
from __future__ import annotations

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import _hq_common as hq


META = {
    "name": "Trường Đại học Luật và Quản trị Công (VNU-ULPA)",
    "concept": "Điện Đền Thể Chế & Cột Trụ Trật Tự / Civic Citadel",
    "primary_colors": ["#991B1B", "#18181B", "#D97706"],
    "emission_colors": ["#D97706"],
    "tactical_role": "Thể chế pháp lý, duy trì trật tự lãnh thổ",
}


def build(collection):
    mat_basalt = hq.create_pbr_material("MAT_ULPA_Basalt", "#18181B", metallic=0.2, roughness=0.7)
    mat_titan = hq.create_pbr_material("MAT_ULPA_Titan", "#64748B", metallic=0.55, roughness=0.4)
    mat_crimson = hq.create_pbr_material("MAT_ULPA_Crimson", "#991B1B", metallic=0.25, roughness=0.45)
    mat_amber = hq.create_pbr_material(
        "MAT_ULPA_Amber", "#D97706", metallic=0.4, roughness=0.25,
        emit_hex="#D97706", emit_strength=9.0,
    )
    mat_amber_soft = hq.create_pbr_material(
        "MAT_ULPA_AmberSoft", "#F59E0B", roughness=0.3, emit_hex="#F59E0B", emit_strength=6.0
    )

    objs = []
    # Square basalt pedestal (~44m)
    objs.append(hq.add_cube("ULPA_Pedestal", (44.0, 44.0, 3.0), (0, 0, 1.5), mat_basalt, collection))
    objs.append(hq.add_cube("ULPA_PedestalTop", (38.0, 38.0, 1.2), (0, 0, 3.6), mat_basalt, collection))

    # Four-direction stairs (kept inside ~48m footprint)
    stair_data = [
        ((0, -21.5, 0), (16.0, 6.0, 0.8), 0.0),
        ((0, 21.5, 0), (16.0, 6.0, 0.8), 0.0),
        ((-21.5, 0, 0), (6.0, 16.0, 0.8), 0.0),
        ((21.5, 0, 0), (6.0, 16.0, 0.8), 0.0),
    ]
    for i, (loc, size, _) in enumerate(stair_data):
        for s in range(3):
            scale = 1.0 - s * 0.15
            sz = (size[0] * scale, size[1] * scale, 0.7)
            off = s * 0.7
            lx = loc[0] if abs(loc[0]) < 1 else loc[0] + math.copysign(-off, loc[0])
            ly = loc[1] if abs(loc[1]) < 1 else loc[1] + math.copysign(-off, loc[1])
            objs.append(hq.add_cube(f"ULPA_Stair_{i}_{s}", sz, (lx, ly, 0.35 + s * 0.7), mat_basalt, collection))

    # 12 monumental pillars around council hall
    hall_half = 9.0
    pillar_positions = []
    # 4 corners + 4 mid-sides + 4 inner
    for x in (-hall_half, hall_half):
        for y in (-hall_half, hall_half):
            pillar_positions.append((x, y))
    for x in (-hall_half, 0, hall_half):
        for y in (-hall_half - 3.5, hall_half + 3.5):
            pillar_positions.append((x, y))
    for y in (-hall_half, 0, hall_half):
        for x in (-hall_half - 3.5, hall_half + 3.5):
            pillar_positions.append((x, y))
    # keep 12 unique-ish
    seen = []
    for p in pillar_positions:
        if p not in seen:
            seen.append(p)
    pillar_positions = seen[:12]

    for i, (px, py) in enumerate(pillar_positions):
        objs.append(
            hq.add_cube(
                f"ULPA_Pillar_{i}",
                (1.6, 1.6, 14.0),
                (px, py, 4.2 + 7.0),
                mat_titan,
                collection,
            )
        )
        objs.append(hq.add_cube(f"ULPA_PillarCap_{i}", (2.2, 2.2, 0.6), (px, py, 18.5), mat_titan, collection))
        objs.append(hq.add_cube(f"ULPA_PillarBase_{i}", (2.4, 2.4, 0.7), (px, py, 4.55), mat_basalt, collection))
        objs.append(hq.add_cube(f"ULPA_PillarFlute_{i}", (0.35, 1.7, 12.0), (px + 0.85, py, 11.0), mat_titan, collection))

    # Crimson council hall
    objs.append(hq.add_cube("ULPA_CouncilHall", (16.0, 16.0, 12.0), (0, 0, 4.2 + 6.0), mat_crimson, collection))
    objs.append(hq.add_cube("ULPA_HallBand", (16.6, 16.6, 1.2), (0, 0, 4.2 + 10.0), mat_titan, collection))
    objs.append(hq.add_cube("ULPA_HallDoor", (4.0, 0.6, 6.0), (0, -8.2, 4.2 + 3.0), mat_basalt, collection))
    for face, (fx, fy, rot) in enumerate(
        ((0, -8.15, 0), (0, 8.15, 0), (-8.15, 0, math.pi / 2), (8.15, 0, math.pi / 2))
    ):
        for w in range(3):
            objs.append(
                hq.add_cube(
                    f"ULPA_HallWin_{face}_{w}",
                    (2.2, 0.35, 2.4),
                    (fx if fx else -3.5 + w * 3.5, fy if fy else -3.5 + w * 3.5, 10.0),
                    mat_amber_soft,
                    collection,
                    rotation=(0.0, 0.0, rot),
                )
            )
    # perimeter balustrade blocks + corner pylons
    for i in range(16):
        ang = math.radians(i * 22.5)
        bx, by = 16.5 * math.cos(ang), 16.5 * math.sin(ang)
        objs.append(hq.add_cube(f"ULPA_Baluster_{i}", (1.0, 1.0, 1.4), (bx, by, 5.0), mat_titan, collection))
        if i % 4 == 0:
            objs.append(hq.add_cube(f"ULPA_Pylon_{i}", (1.8, 1.8, 3.2), (bx, by, 5.8), mat_basalt, collection))
    # hall cornice blocks
    for i in range(8):
        ang = math.radians(i * 45)
        objs.append(
            hq.add_cube(
                f"ULPA_Cornice_{i}",
                (2.0, 2.0, 0.8),
                (9.8 * math.cos(ang), 9.8 * math.sin(ang), 16.6),
                mat_amber,
                collection,
                rotation=(0.0, 0.0, ang),
            )
        )

    # Truncated pyramid roof
    objs.append(
        hq.add_cylinder(
            "ULPA_RoofPyramid",
            12.0,
            4.0,
            (0, 0, 16.2 + 2.0),
            mat_basalt,
            collection,
            vertices=4,
            radius_top=5.0,
            rotation=(0.0, 0.0, math.pi / 4),
        )
    )
    objs.append(hq.add_cube("ULPA_RoofDeck", (10.0, 10.0, 0.8), (0, 0, 20.5), mat_titan, collection))

    # Scales of justice apex
    objs.append(hq.add_cylinder("ULPA_ScalesStem", 0.65, 4.0, (0, 0, 23.0), mat_amber, collection, vertices=8))
    objs.append(hq.add_cube("ULPA_ScalesBeam", (9.0, 0.55, 0.45), (0, 0, 25.2), mat_amber, collection))
    objs.append(hq.add_cylinder("ULPA_PanL", 1.6, 0.35, (-3.6, 0, 24.3), mat_amber, collection, vertices=10))
    objs.append(hq.add_cylinder("ULPA_PanR", 1.6, 0.35, (3.6, 0, 24.3), mat_amber, collection, vertices=10))
    # hanging chains
    objs.append(hq.add_cube("ULPA_ChainL", (0.15, 0.15, 1.4), (-3.6, 0, 24.9), mat_amber_soft, collection))
    objs.append(hq.add_cube("ULPA_ChainR", (0.15, 0.15, 1.4), (3.6, 0, 24.9), mat_amber_soft, collection))
    objs.append(hq.add_icosphere("ULPA_ScalesCore", 0.7, (0, 0, 25.2), mat_amber, collection, subdivisions=1))
    objs.append(hq.add_cone("ULPA_ApexSigil", 2.0, 2.5, (0, 0, 27.0), mat_amber, collection, vertices=4))
    # roof deck edge merlons
    for i in range(8):
        ang = math.radians(i * 45 + 22.5)
        objs.append(
            hq.add_cube(
                f"ULPA_Merlon_{i}",
                (1.2, 1.2, 1.5),
                (4.2 * math.cos(ang), 4.2 * math.sin(ang), 21.6),
                mat_basalt,
                collection,
            )
        )
    # hall side pilasters
    for i, (dx, dy) in enumerate((( -5.5, -8.0), (0, -8.0), (5.5, -8.0), (-5.5, 8.0), (0, 8.0), (5.5, 8.0))):
        objs.append(
            hq.add_cube(
                f"ULPA_Pilaster_{i}",
                (0.9, 0.5, 9.0),
                (dx, dy, 4.2 + 4.5),
                mat_titan,
                collection,
            )
        )

    return objs


if __name__ == "__main__":
    hq.run_school_builder(build, "ulpa", META)
