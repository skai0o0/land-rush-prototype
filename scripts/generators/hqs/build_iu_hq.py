"""IU HQ — Global Scarlet Nexus Complex (cantilever blocks + skywalk tubes)."""
from __future__ import annotations

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import _hq_common as hq


META = {
    "name": "Trường Đại học Quốc tế (IU)",
    "concept": "Tổ Hợp Không Gian Toàn Cầu / Global Scarlet Complex",
    "primary_colors": ["#B83227", "#009CD1", "#323393"],
    "emission_colors": ["#009CD1"],
    "tactical_role": "Tiếp vận lính dù, giao thương tài nguyên",
}


def build(collection):
    mat_scarlet = hq.create_pbr_material("MAT_IU_ScarletRed", "#B83227", metallic=0.1, roughness=0.6)
    mat_cyan = hq.create_pbr_material(
        "MAT_IU_CyanGlass", "#009CD1", metallic=0.9, roughness=0.05,
        emit_hex="#009CD1", emit_strength=3.0,
    )
    mat_navy = hq.create_pbr_material("MAT_IU_NavyFrame", "#323393", metallic=0.7, roughness=0.2)
    mat_pad = hq.create_pbr_material("MAT_IU_LandingGrey", "#374151", metallic=0.4, roughness=0.5)
    mat_pad_glow = hq.create_pbr_material(
        "MAT_IU_PadGlow", "#009CD1", roughness=0.3, emit_hex="#009CD1", emit_strength=8.0
    )

    objs = []
    # Foundation pad
    objs.append(hq.add_cube("IU_Foundation", (40.0, 36.0, 2.0), (0, 0, 1.0), mat_pad, collection))

    # Three scarlet cantilevered blocks
    blocks = [
        ("West", (-12.0, -2.0, 9.0), (14.0, 16.0, 14.0)),
        ("Mid", (2.0, 6.0, 12.0), (12.0, 12.0, 20.0)),
        ("East", (12.0, -6.0, 14.0), (12.0, 14.0, 24.0)),
    ]
    for name, loc, size in blocks:
        objs.append(hq.add_cube(f"IU_Block_{name}", size, (loc[0], loc[1], 2.0 + loc[2] / 2), mat_scarlet, collection))
        objs.append(
            hq.add_cube(
                f"IU_BlockFoot_{name}",
                (size[0] * 0.4, size[1] * 0.4, 3.0),
                (loc[0] - size[0] * 0.25, loc[1], 3.5),
                mat_navy,
                collection,
            )
        )
        # façade panel grid
        floors = max(3, int(size[2] // 5))
        for f in range(floors):
            z = 4.0 + f * (size[2] / floors)
            objs.append(
                hq.add_cube(
                    f"IU_Panel_{name}_{f}",
                    (size[0] * 0.85, 0.35, 0.4),
                    (loc[0], loc[1] - size[1] * 0.5, z),
                    mat_navy,
                    collection,
                )
            )
            for c in range(2):
                objs.append(
                    hq.add_cube(
                        f"IU_Window_{name}_{f}_{c}",
                        (2.0, 0.25, 1.2),
                        (loc[0] - size[0] * 0.2 + c * size[0] * 0.4, loc[1] - size[1] * 0.5 - 0.05, z + 1.2),
                        mat_cyan,
                        collection,
                    )
                )

    # Two horizontal cyan skywalk tubes
    tube_specs = [
        ("Skywalk_1", (-4.0, 2.0, 14.0), (0.0, math.pi / 2, 0.0), 18.0),
        ("Skywalk_2", (7.0, -2.0, 18.0), (math.pi / 2, 0.0, 0.0), 16.0),
    ]
    for name, loc, rot, length in tube_specs:
        objs.append(
            hq.add_cylinder(
                f"IU_{name}",
                1.4,
                length,
                loc,
                mat_cyan,
                collection,
                vertices=12,
                rotation=rot,
            )
        )
        for ring_i in range(4):
            offset = -length * 0.3 + ring_i * (length * 0.2)
            if rot[1]:  # along X
                ring_loc = (loc[0] + offset, loc[1], loc[2])
            else:
                ring_loc = (loc[0], loc[1] + offset, loc[2])
            objs.append(
                hq.add_torus(
                    f"IU_{name}_Ring{ring_i}",
                    1.55,
                    0.16,
                    ring_loc,
                    mat_navy,
                    collection,
                    rotation=rot,
                )
            )

    # Geodesic bio-dome on west block roof
    west_top = 2.0 + 14.0 + 20.0  # approx roof of Mid? West roof ~ 2+14=16, use Mid for dome
    dome_loc = (2.0, 6.0, 2.0 + 20.0 + 1.0)
    objs.append(hq.add_cylinder("IU_DomeBase", 5.0, 1.0, (dome_loc[0], dome_loc[1], dome_loc[2] - 0.4), mat_navy, collection, vertices=12))
    dome = hq.add_icosphere(
        "IU_GeodesicDome",
        4.5,
        (dome_loc[0], dome_loc[1], dome_loc[2]),
        mat_navy,
        collection,
        subdivisions=1,
        cut_half=True,
    )
    dome.location.z = dome_loc[2]
    objs.append(dome)
    objs.append(hq.add_icosphere("IU_DomeGlow", 3.2, (dome_loc[0], dome_loc[1], dome_loc[2] + 0.2), mat_cyan, collection, subdivisions=1, cut_half=True))

    # VTOL hex landing pad on east tower
    east_top = 2.0 + 24.0
    objs.append(hq.add_cylinder("IU_VTOLPad", 5.5, 0.8, (12.0, -6.0, east_top + 0.4), mat_pad, collection, vertices=6))
    objs.append(hq.add_cylinder("IU_VTOLMark", 2.2, 0.25, (12.0, -6.0, east_top + 0.9), mat_pad_glow, collection, vertices=6))
    for i in range(4):
        ang = math.radians(45 + i * 90)
        objs.append(
            hq.add_icosphere(
                f"IU_VTOLLight_{i}",
                0.4,
                (12.0 + 4.2 * math.cos(ang), -6.0 + 4.2 * math.sin(ang), east_top + 0.9),
                mat_pad_glow,
                collection,
                subdivisions=1,
            )
        )

    return objs


if __name__ == "__main__":
    hq.run_school_builder(build, "iu", META)
