"""HCMUS HQ — Quantum Observatory Station (atomic rings + chrome dome)."""
from __future__ import annotations

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import _hq_common as hq


META = {
    "name": "Trường Đại học Khoa học Tự nhiên (HCMUS)",
    "concept": "Trạm Đài Thiên Văn Lượng Tử / Quantum Observatory Station",
    "primary_colors": ["#0054A6", "#E2E8F0", "#00B4D8"],
    "emission_colors": ["#00B4D8", "#FFC107"],
    "tactical_role": "Quét sương mù bản đồ, pháo xung điện",
}


def build(collection):
    mat_white = hq.create_pbr_material("MAT_US_TitaniumWhite", "#E2E8F0", metallic=0.3, roughness=0.4)
    mat_navy = hq.create_pbr_material("MAT_US_DeepNavy", "#0054A6", metallic=0.5, roughness=0.3)
    mat_chrome = hq.create_pbr_material("MAT_US_PolishedChrome", "#CBD5E1", metallic=0.95, roughness=0.1)
    mat_plasma = hq.create_pbr_material(
        "MAT_US_PlasmaGlow", "#00B4D8", roughness=0.25, emit_hex="#00B4D8", emit_strength=10.0
    )
    mat_amber = hq.create_pbr_material(
        "MAT_US_AmberFlare", "#FFC107", roughness=0.25, emit_hex="#FFC107", emit_strength=12.0
    )

    objs = []
    # Central ground pad
    objs.append(hq.add_cylinder("HCMUS_Pad", 20.0, 2.0, (0, 0, 1.0), mat_navy, collection, vertices=16))

    # 5 radial lab cubes
    for i in range(5):
        ang = math.radians(i * 72 + 90)
        r = 14.0
        x, y = r * math.cos(ang), r * math.sin(ang)
        lab = hq.add_cube(
            f"HCMUS_Lab_{i}",
            (7.0, 7.0, 5.0),
            (x, y, 4.5),
            mat_white,
            collection,
            rotation=(0.0, 0.0, ang),
        )
        objs.append(lab)
        objs.append(
            hq.add_cube(
                f"HCMUS_LabCap_{i}",
                (7.4, 7.4, 0.5),
                (x, y, 7.3),
                mat_navy,
                collection,
                rotation=(0.0, 0.0, ang),
            )
        )

    # Core accelerator tower
    objs.append(hq.add_cylinder("HCMUS_CoreTower", 5.0, 26.0, (0, 0, 15.0), mat_navy, collection, vertices=20))
    objs.append(hq.add_cylinder("HCMUS_CoreGlow", 3.4, 22.0, (0, 0, 15.0), mat_plasma, collection, vertices=16))
    for z in (8.0, 14.0, 20.0):
        objs.append(hq.add_torus(f"HCMUS_TowerBand_{int(z)}", 5.4, 0.35, (0, 0, z), mat_white, collection))

    # Chrome observatory dome
    objs.append(hq.add_cylinder("HCMUS_DomeBase", 6.5, 2.0, (0, 0, 29.0), mat_white, collection, vertices=16))
    dome = hq.add_uvsphere("HCMUS_ObsDome", 5.5, (0, 0, 30.0), mat_chrome, collection, segments=16, rings=10, cut_half=True)
    dome.location.z = 30.0
    objs.append(dome)
    objs.append(hq.add_cube("HCMUS_DomeSlot", (1.2, 10.5, 5.2), (0, 0, 33.0), mat_navy, collection))

    # 3 intersecting orbital rings
    ring_specs = [
        ((math.radians(60), 0.0, 0.0), 14.0),
        ((math.radians(20), math.radians(70), 0.0), 15.0),
        ((math.radians(75), math.radians(-30), math.radians(40)), 13.0),
    ]
    for i, (rot, maj) in enumerate(ring_specs):
        objs.append(hq.add_torus(f"HCMUS_Orbital_{i}", maj, 0.35, (0, 0, 32.0), mat_plasma, collection, rotation=rot))
        # orbital node on ring
        nx = maj * math.cos(math.radians(i * 40))
        ny = maj * math.sin(math.radians(i * 40)) * 0.3
        objs.append(hq.add_icosphere(f"HCMUS_Node_{i}", 0.9, (nx, ny, 32.0 + i * 0.4), mat_amber, collection, subdivisions=1))

    return objs


if __name__ == "__main__":
    hq.run_school_builder(build, "hcmus", META)
