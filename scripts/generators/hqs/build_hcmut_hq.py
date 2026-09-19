"""HCMUT HQ — Mechanical Engineering Fortress (hex plinth + plasma core)."""
from __future__ import annotations

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import _hq_common as hq
import bpy


META = {
    "name": "Trường Đại học Bách khoa (HCMUT)",
    "concept": "Pháo Đài Cơ Khí Kỹ Thuật / Mechanical Engineering Fortress",
    "primary_colors": ["#030391", "#4A5568", "#1488D8"],
    "emission_colors": ["#1488D8"],
    "tactical_role": "Giáp phòng thủ kiên cố, sửa chữa cơ giới",
}


def build(collection):
    mat_concrete = hq.create_pbr_material("MAT_BK_Concrete", "#4A5568", metallic=0.1, roughness=0.85)
    mat_armor = hq.create_pbr_material("MAT_BK_ArmorNavy", "#030391", metallic=0.65, roughness=0.35)
    mat_steel = hq.create_pbr_material("MAT_BK_DarkSteel", "#1A202C", metallic=0.85, roughness=0.25)
    mat_glow = hq.create_pbr_material(
        "MAT_BK_GlowCyan", "#030391", metallic=0.0, roughness=0.4,
        emit_hex="#1488D8", emit_strength=8.0,
    )
    mat_glow_hot = hq.create_pbr_material(
        "MAT_BK_GlowHot", "#1488D8", metallic=0.0, roughness=0.3,
        emit_hex="#1488D8", emit_strength=10.0,
    )

    objs = []
    # Hex plinth (~44m across)
    objs.append(hq.add_cylinder("HCMUT_Plinth", 22.0, 4.0, (0, 0, 2.0), mat_concrete, collection, vertices=6))
    objs.append(hq.add_cylinder("HCMUT_Plinth_Rim", 20.0, 1.2, (0, 0, 4.4), mat_steel, collection, vertices=6))

    # Central hex core
    objs.append(hq.add_cylinder("HCMUT_HexCore", 12.0, 22.0, (0, 0, 15.0), mat_armor, collection, vertices=6))
    objs.append(hq.add_cylinder("HCMUT_CoreBand", 12.6, 2.0, (0, 0, 20.0), mat_steel, collection, vertices=6))

    # Tripod cantilever beams at 0/120/240°
    for i, ang_deg in enumerate((90.0, 210.0, 330.0)):
        ang = math.radians(ang_deg)
        r = 10.0
        x, y = r * math.cos(ang), r * math.sin(ang)
        beam = hq.add_cube(
            f"HCMUT_Beam_{i}",
            (3.2, 8.0, 2.2),
            (x, y, 7.5),
            mat_steel,
            collection,
            rotation=(0.0, 0.0, ang - math.pi / 2),
        )
        objs.append(beam)
        # honeycomb louver block (hollow-looking via nested hex)
        objs.append(
            hq.add_cylinder(
                f"HCMUT_Louver_{i}",
                1.6,
                3.0,
                (x * 1.35, y * 1.35, 9.0),
                mat_concrete,
                collection,
                vertices=6,
            )
        )

    # Honeycomb façade nodes on core faces
    for i in range(6):
        ang = math.radians(30 + i * 60)
        for row, z in enumerate((12.0, 16.0, 20.0)):
            x, y = 11.2 * math.cos(ang), 11.2 * math.sin(ang)
            objs.append(
                hq.add_cylinder(
                    f"HCMUT_HexCell_{i}_{row}",
                    1.15,
                    1.0,
                    (x, y, z),
                    mat_glow if row == 1 else mat_concrete,
                    collection,
                    vertices=6,
                    rotation=(math.pi / 2, 0, ang + math.pi / 2),
                )
            )
            objs.append(
                hq.add_cylinder(
                    f"HCMUT_HexFrame_{i}_{row}",
                    1.45,
                    0.35,
                    (x * 1.02, y * 1.02, z),
                    mat_steel,
                    collection,
                    vertices=6,
                    rotation=(math.pi / 2, 0, ang + math.pi / 2),
                )
            )

    # Plasma chamber + energy core
    objs.append(hq.add_cylinder("HCMUT_ReactorShell", 6.5, 8.0, (0, 0, 30.0), mat_armor, collection, vertices=16))
    objs.append(hq.add_cylinder("HCMUT_PlasmaCore", 4.2, 6.0, (0, 0, 30.0), mat_glow_hot, collection, vertices=16))
    objs.append(hq.add_torus("HCMUT_Ring1", 7.2, 0.28, (0, 0, 28.0), mat_steel, collection))
    objs.append(hq.add_torus("HCMUT_Ring2", 7.5, 0.28, (0, 0, 30.0), mat_steel, collection))
    objs.append(hq.add_torus("HCMUT_Ring3", 7.2, 0.28, (0, 0, 32.0), mat_steel, collection))

    # Apex antenna mast + lattice struts
    objs.append(hq.add_cylinder("HCMUT_AntennaBase", 1.8, 2.0, (0, 0, 35.0), mat_steel, collection, vertices=8))
    objs.append(hq.add_cone("HCMUT_Antenna", 1.4, 10.0, (0, 0, 41.0), mat_steel, collection, vertices=8))
    objs.append(hq.add_icosphere("HCMUT_Beacon", 0.7, (0, 0, 46.5), mat_glow_hot, collection, subdivisions=1))
    for i in range(6):
        ang = math.radians(i * 60)
        objs.append(
            hq.add_cube(
                f"HCMUT_AntennaBrace_{i}",
                (0.25, 0.25, 6.0),
                (1.8 * math.cos(ang), 1.8 * math.sin(ang), 38.0),
                mat_steel,
                collection,
                rotation=(0.35, 0.0, ang),
            )
        )
        objs.append(
            hq.add_cube(
                f"HCMUT_PlinthBolt_{i}",
                (1.0, 1.0, 1.2),
                (18.0 * math.cos(ang), 18.0 * math.sin(ang), 4.8),
                mat_steel,
                collection,
            )
        )

    return objs


if __name__ == "__main__":
    hq.run_school_builder(build, "hcmut", META)
