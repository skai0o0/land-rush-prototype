"""VNU-UBB HQ — Bio-Dome Eco-Spire (pentagon base + Fibonacci spire)."""
from __future__ import annotations

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import _hq_common as hq


META = {
    "name": "Trường Đại học Công nghệ Sinh học và Môi trường (VNU-UBB)",
    "concept": "Trạm Sinh Thái Sinh Học & Vòm Năng Lượng Xanh / Bio-Dome Eco-Spire",
    "primary_colors": ["#10B981", "#065F46", "#84CC16"],
    "emission_colors": ["#84CC16"],
    "tactical_role": "Trạm sinh thái, năng lượng tái tạo chiến trường",
}


def build(collection):
    mat_moss_stone = hq.create_pbr_material("MAT_UBB_Stone", "#2D3748", metallic=0.1, roughness=0.85)
    mat_white = hq.create_pbr_material("MAT_UBB_Porcelain", "#F8FAFC", metallic=0.15, roughness=0.25)
    mat_moss = hq.create_pbr_material("MAT_UBB_Moss", "#065F46", metallic=0.2, roughness=0.55)
    mat_emerald = hq.create_pbr_material(
        "MAT_UBB_Emerald", "#10B981", metallic=0.25, roughness=0.2,
        emit_hex="#10B981", emit_strength=8.0, alpha=0.75,
    )
    mat_lime = hq.create_pbr_material(
        "MAT_UBB_BioGlow", "#84CC16", roughness=0.25, emit_hex="#84CC16", emit_strength=10.0
    )

    objs = []
    # Pentagonal stepped plinth (~42m)
    objs.append(hq.add_cylinder("UBB_Plinth1", 21.0, 2.5, (0, 0, 1.25), mat_moss_stone, collection, vertices=5))
    objs.append(hq.add_cylinder("UBB_Plinth2", 16.0, 2.0, (0, 0, 3.5), mat_moss_stone, collection, vertices=5))
    objs.append(hq.add_cylinder("UBB_Plinth3", 11.0, 1.8, (0, 0, 5.4), mat_moss, collection, vertices=5))

    # Fibonacci spiral spire: stacked discs with offset + moss bands
    spiral_layers = 10
    for i in range(spiral_layers):
        t = i / (spiral_layers - 1)
        r = 6.5 * (1.0 - 0.55 * t)
        z = 6.3 + i * 2.2
        ang = t * math.pi * 1.6
        ox = 0.8 * math.cos(ang) * (1 - t)
        oy = 0.8 * math.sin(ang) * (1 - t)
        mat = mat_white if i % 2 == 0 else mat_moss
        objs.append(
            hq.add_cylinder(
                f"UBB_Spiral_{i}",
                r,
                2.0,
                (ox, oy, z + 1.0),
                mat,
                collection,
                vertices=10,
            )
        )
        if i % 2 == 1:
            objs.append(
                hq.add_torus(
                    f"UBB_MossBand_{i}",
                    r + 0.25,
                    0.22,
                    (ox, oy, z + 1.8),
                    mat_moss,
                    collection,
                )
            )

    # Geodesic bio-dome apex
    dome_z = 6.3 + spiral_layers * 2.2
    objs.append(hq.add_cylinder("UBB_DomeDeck", 7.5, 1.0, (0, 0, dome_z + 0.5), mat_moss_stone, collection, vertices=10))
    dome = hq.add_icosphere(
        "UBB_BioDome",
        6.0,
        (0, 0, dome_z + 1.0),
        mat_emerald,
        collection,
        subdivisions=1,
        cut_half=True,
    )
    dome.location.z = dome_z + 1.0
    objs.append(dome)
    # Tree of life core
    objs.append(hq.add_cylinder("UBB_TreeTrunk", 0.6, 4.0, (0, 0, dome_z + 2.5), mat_moss, collection, vertices=6))
    objs.append(hq.add_icosphere("UBB_TreeCrown", 2.2, (0, 0, dome_z + 5.2), mat_lime, collection, subdivisions=1))

    # 3 nano wind turbine blades
    for i in range(3):
        ang = math.radians(i * 120)
        r = 9.5
        x, y = r * math.cos(ang), r * math.sin(ang)
        objs.append(hq.add_cylinder(f"UBB_TurbineMast_{i}", 0.35, 8.0, (x, y, dome_z + 3.0), mat_white, collection, vertices=6))
        for b in range(3):
            bang = ang + math.radians(b * 120)
            objs.append(
                hq.add_cube(
                    f"UBB_Blade_{i}_{b}",
                    (0.25, 2.8, 0.12),
                    (x + 1.2 * math.cos(bang), y + 1.2 * math.sin(bang), dome_z + 7.0),
                    mat_lime,
                    collection,
                    rotation=(math.radians(20), 0.0, bang),
                )
            )

    return objs


if __name__ == "__main__":
    hq.run_school_builder(build, "ubb", META)
