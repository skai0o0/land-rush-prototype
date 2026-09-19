"""VNU-UFLIS HQ — Polyglot Beacon & Global Nexus (octagram + gold prism)."""
from __future__ import annotations

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import _hq_common as hq


META = {
    "name": "Trường Đại học Ngoại ngữ và Ngoại giao (VNU-UFLIS)",
    "concept": "Hải Đăng Đa Văn Hóa & Tháp Truyền Tin Ngoại Giao / Polyglot Beacon",
    "primary_colors": ["#7C3AED", "#1E40AF", "#F59E0B"],
    "emission_colors": ["#F59E0B"],
    "tactical_role": "Truyền tin ngoại giao, kết nối đa phương",
}


def build(collection):
    mat_marble = hq.create_pbr_material("MAT_UFLIS_Marble", "#F1F5F9", metallic=0.05, roughness=0.45)
    mat_violet = hq.create_pbr_material("MAT_UFLIS_Violet", "#7C3AED", metallic=0.45, roughness=0.3)
    mat_sapphire = hq.create_pbr_material("MAT_UFLIS_Sapphire", "#1E40AF", metallic=0.55, roughness=0.25)
    mat_gold = hq.create_pbr_material(
        "MAT_UFLIS_Gold", "#F59E0B", metallic=0.85, roughness=0.2,
        emit_hex="#F59E0B", emit_strength=12.0,
    )
    mat_glyph = hq.create_pbr_material(
        "MAT_UFLIS_Glyph", "#F59E0B", roughness=0.3, emit_hex="#F59E0B", emit_strength=6.0
    )

    objs = []
    # Octagram star plinth
    verts, faces = hq.star_prism_mesh(points=8, outer_r=19.0, inner_r=11.5, height=3.0)
    star = hq.create_mesh_object("UFLIS_OctagramPlinth", verts, faces, (0, 0, 0.0), mat_marble, collection)
    objs.append(star)
    objs.append(hq.add_cylinder("UFLIS_PlinthCore", 9.0, 3.5, (0, 0, 1.75), mat_marble, collection, vertices=8))
    objs.append(hq.add_cylinder("UFLIS_PlinthTier", 7.0, 2.0, (0, 0, 4.2), mat_sapphire, collection, vertices=8))

    # Slender multi-faceted spire
    objs.append(
        hq.add_cylinder(
            "UFLIS_SpireLower",
            5.5,
            16.0,
            (0, 0, 6.0 + 8.0),
            mat_violet,
            collection,
            vertices=8,
            radius_top=4.0,
        )
    )
    objs.append(
        hq.add_cylinder(
            "UFLIS_SpireMid",
            4.0,
            12.0,
            (0, 0, 22.0 + 6.0),
            mat_sapphire,
            collection,
            vertices=8,
            radius_top=2.4,
        )
    )
    objs.append(
        hq.add_cylinder(
            "UFLIS_SpireUpper",
            2.4,
            8.0,
            (0, 0, 34.0 + 4.0),
            mat_violet,
            collection,
            vertices=8,
            radius_top=1.2,
        )
    )

    # Gothic arch fins + multilingual glyph grooves
    for i in range(8):
        ang = math.radians(i * 45 + 22.5)
        for layer, z in enumerate((10.0, 16.0, 22.0)):
            x, y = (5.2 - layer * 0.35) * math.cos(ang), (5.2 - layer * 0.35) * math.sin(ang)
            objs.append(
                hq.add_cube(
                    f"UFLIS_ArchFin_{i}_{layer}",
                    (0.7, 2.0, 5.0),
                    (x, y, z),
                    mat_violet if layer != 1 else mat_sapphire,
                    collection,
                    rotation=(0.0, 0.0, ang),
                )
            )
            objs.append(
                hq.add_cube(
                    f"UFLIS_ArchRib_{i}_{layer}",
                    (0.35, 1.2, 1.2),
                    (x * 0.92, y * 0.92, z + 3.0),
                    mat_marble,
                    collection,
                    rotation=(0.0, 0.0, ang),
                )
            )
        for g in range(4):
            gx, gy = 3.6 * math.cos(ang), 3.6 * math.sin(ang)
            objs.append(
                hq.add_cube(
                    f"UFLIS_Glyph_{i}_{g}",
                    (0.22, 0.75, 0.9),
                    (gx, gy, 20.0 + g * 2.2 + (i % 2) * 0.4),
                    mat_glyph,
                    collection,
                    rotation=(0.0, 0.0, ang),
                )
            )
    # star plinth edge jewels
    for i in range(8):
        ang = math.radians(i * 45)
        objs.append(
            hq.add_icosphere(
                f"UFLIS_PlinthJewel_{i}",
                0.7,
                (15.5 * math.cos(ang), 15.5 * math.sin(ang), 3.2),
                mat_gold,
                collection,
                subdivisions=1,
            )
        )
        objs.append(
            hq.add_cube(
                f"UFLIS_PlinthStep_{i}",
                (3.5, 2.0, 0.7),
                (12.0 * math.cos(ang), 12.0 * math.sin(ang), 3.6),
                mat_marble,
                collection,
                rotation=(0.0, 0.0, ang),
            )
        )

    # Gold octahedron prism apex (two 4-sided cones)
    apex_z = 42.0
    objs.append(
        hq.add_cylinder(
            "UFLIS_PrismBase",
            1.4,
            1.5,
            (0, 0, apex_z - 0.5),
            mat_sapphire,
            collection,
            vertices=4,
        )
    )
    objs.append(
        hq.add_cylinder(
            "UFLIS_OctahedronLow",
            2.2,
            2.5,
            (0, 0, apex_z + 1.2),
            mat_gold,
            collection,
            vertices=4,
            radius_top=0.0,
        )
    )
    objs.append(
        hq.add_cylinder(
            "UFLIS_OctahedronHigh",
            0.0,
            2.5,
            (0, 0, apex_z + 3.6),
            mat_gold,
            collection,
            vertices=4,
            radius_top=2.2,
        )
    )
    # 4 fog-scan beams as thin emissive shards
    for i in range(4):
        ang = math.radians(i * 90)
        objs.append(
            hq.add_cube(
                f"UFLIS_Beam_{i}",
                (0.35, 0.35, 6.0),
                (2.8 * math.cos(ang), 2.8 * math.sin(ang), apex_z + 2.5),
                mat_gold,
                collection,
                rotation=(math.radians(25), 0.0, ang),
            )
        )
        objs.append(
            hq.add_icosphere(
                f"UFLIS_BeamNode_{i}",
                0.45,
                (2.8 * math.cos(ang), 2.8 * math.sin(ang), apex_z + 5.2),
                mat_glyph,
                collection,
                subdivisions=1,
            )
        )
    # spire shoulder diamonds
    for i in range(8):
        ang = math.radians(i * 45)
        objs.append(
            hq.add_cube(
                f"UFLIS_Shoulder_{i}",
                (0.8, 0.8, 0.8),
                (2.9 * math.cos(ang), 2.9 * math.sin(ang), 30.0),
                mat_gold,
                collection,
                rotation=(0.0, math.radians(45), ang),
            )
        )

    return objs


if __name__ == "__main__":
    hq.run_school_builder(build, "uflis", META)
