"""UIT HQ — Cyber Data Monolith (server plinth + LED buses + dish)."""
from __future__ import annotations

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import _hq_common as hq


META = {
    "name": "Trường Đại học Công nghệ Thông tin (UIT)",
    "concept": "Trung Tâm Dữ Liệu Cyber Core / Cyber Data Monolith",
    "primary_colors": ["#0000FD", "#111827", "#2F6BFF"],
    "emission_colors": ["#2F6BFF", "#FF5722"],
    "tactical_role": "Áp chế mạng điện tử, trinh sát tự hành",
}


def build(collection):
    mat_graphite = hq.create_pbr_material("MAT_IT_GraphiteCase", "#111827", metallic=0.8, roughness=0.3)
    mat_glass = hq.create_pbr_material("MAT_IT_GlassBlue", "#0000FD", metallic=0.9, roughness=0.1)
    mat_neon = hq.create_pbr_material(
        "MAT_IT_NeonCyan", "#2F6BFF", roughness=0.2, emit_hex="#2F6BFF", emit_strength=15.0
    )
    mat_white = hq.create_pbr_material("MAT_IT_WhitePlates", "#F9FAFB", metallic=0.4, roughness=0.2)
    mat_alert = hq.create_pbr_material(
        "MAT_IT_AlertOrange", "#FF5722", roughness=0.3, emit_hex="#FF5722", emit_strength=10.0
    )

    objs = []
    # Graphite server rack plinth (~36m footprint)
    objs.append(hq.add_cube("UIT_ServerBase", (28.0, 28.0, 4.0), (0, 0, 2.0), mat_graphite, collection))
    objs.append(hq.add_cube("UIT_ServerDeck", (24.0, 24.0, 0.6), (0, 0, 4.3), mat_white, collection))
    for i, ang_deg in enumerate((0, 90, 180, 270)):
        ang = math.radians(ang_deg)
        x, y = 13.2 * math.cos(ang), 13.2 * math.sin(ang)
        size = (24.0, 0.9, 2.0) if ang_deg % 180 == 0 else (0.9, 24.0, 2.0)
        objs.append(hq.add_cube(f"UIT_Slit_{i}", size, (x, y, 2.0), mat_neon, collection))
        for j in range(6):
            o = -9.0 + j * 3.6
            if ang_deg % 180 == 0:
                objs.append(hq.add_cube(f"UIT_SlitTick_{i}_{j}", (0.35, 0.35, 2.2), (o, y, 2.0), mat_neon, collection))
            else:
                objs.append(hq.add_cube(f"UIT_SlitTick_{i}_{j}", (0.35, 0.35, 2.2), (x, o, 2.0), mat_neon, collection))

    # Secondary rack blocks with panel stacks
    for i, (dx, dy) in enumerate(((-9.5, -9.5), (9.5, -9.5), (-9.5, 9.5), (9.5, 9.5))):
        objs.append(hq.add_cube(f"UIT_Rack_{i}", (6.5, 6.5, 5.5), (dx, dy, 6.8), mat_graphite, collection))
        for k in range(4):
            objs.append(hq.add_cube(f"UIT_RackPanel_{i}_{k}", (6.8, 0.3, 0.35), (dx, dy + 2.9 - k * 0.9, 5.4 + k * 0.8), mat_neon, collection))

    # E-Monolith tower (slender, slanted top via trapezoid cone)
    objs.append(hq.add_cube("UIT_Monolith", (10.0, 8.0, 34.0), (0, 0, 4 + 17.0), mat_glass, collection))
    objs.append(
        hq.add_cylinder(
            "UIT_Monolith_Slant",
            5.2,
            6.0,
            (0, 0, 41.0),
            mat_glass,
            collection,
            vertices=4,
            radius_top=2.0,
            rotation=(0, 0, math.pi / 4),
        )
    )

    # 8 vertical LED data buses + micro segments
    bus_positions = [
        (5.2, 4.2), (-5.2, 4.2), (5.2, -4.2), (-5.2, -4.2),
        (5.2, 0.0), (-5.2, 0.0), (0.0, 4.2), (0.0, -4.2),
    ]
    for i, (bx, by) in enumerate(bus_positions):
        objs.append(
            hq.add_cube(
                f"UIT_DataBus_{i}",
                (0.35 if abs(bx) > 1 else 3.0, 0.35 if abs(by) > 1 else 2.5, 30.0),
                (bx, by, 4 + 15.0),
                mat_neon,
                collection,
            )
        )
        for s in range(6):
            objs.append(
                hq.add_cube(
                    f"UIT_BusSeg_{i}_{s}",
                    (0.5, 0.5, 0.4),
                    (bx, by, 7.0 + s * 4.2),
                    mat_white,
                    collection,
                )
            )
    # monolith corner ribs
    for i, (dx, dy) in enumerate(((4.8, 3.8), (-4.8, 3.8), (4.8, -3.8), (-4.8, -3.8))):
        objs.append(hq.add_cube(f"UIT_Rib_{i}", (0.6, 0.6, 32.0), (dx, dy, 20.0), mat_graphite, collection))

    # Quantum parabolic dish (inverted bowl approximation)
    objs.append(hq.add_cylinder("UIT_DishStem", 0.8, 3.0, (0, 0, 47.0), mat_white, collection, vertices=8))
    objs.append(
        hq.add_cylinder(
            "UIT_Dish",
            4.5,
            1.2,
            (0, 0, 49.0),
            mat_white,
            collection,
            vertices=16,
            radius_top=2.0,
        )
    )
    objs.append(hq.add_cylinder("UIT_DishFeed", 0.4, 2.5, (0, 0, 50.5), mat_neon, collection, vertices=6))

    # 4 status beacons at tower corners
    for i, (dx, dy) in enumerate(((4.5, 3.5), (-4.5, 3.5), (4.5, -3.5), (-4.5, -3.5))):
        objs.append(hq.add_icosphere(f"UIT_Beacon_{i}", 0.7, (dx, dy, 42.5), mat_alert, collection, subdivisions=1))

    return objs


if __name__ == "__main__":
    hq.run_school_builder(build, "uit", META)
