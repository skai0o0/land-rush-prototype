"""UHS HQ — Biomedical Aegis Spire (medical cross + DNA helix)."""
from __future__ import annotations

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import _hq_common as hq


META = {
    "name": "Trường Đại học Khoa học Sức khỏe (UHS)",
    "concept": "Tháp Cứu Sinh Y Sinh Học / Biomedical Aegis Spire",
    "primary_colors": ["#FFFFFF", "#008B8B", "#4CBB17"],
    "emission_colors": ["#4CBB17", "#BF86BF"],
    "tactical_role": "Hào quang hồi phục sinh lực, giải độc",
}


def build(collection):
    mat_white = hq.create_pbr_material("MAT_HS_SterileWhite", "#FFFFFF", metallic=0.1, roughness=0.15)
    mat_white2 = hq.create_pbr_material("MAT_HS_NanoShield", "#F8FAFC", metallic=0.2, roughness=0.2)
    mat_teal = hq.create_pbr_material("MAT_HS_CaduceusTeal", "#008B8B", metallic=0.6, roughness=0.3)
    mat_kelly = hq.create_pbr_material(
        "MAT_HS_EmeraldFluid", "#4CBB17", roughness=0.2, emit_hex="#4CBB17", emit_strength=5.0, alpha=0.85
    )
    mat_lilac = hq.create_pbr_material(
        "MAT_HS_LilacAccent", "#BF86BF", roughness=0.3, emit_hex="#BF86BF", emit_strength=8.0
    )

    objs = []
    # Medical cross foundation (two arms)
    objs.append(hq.add_cube("HS_CrossBase_X", (38.0, 12.0, 2.5), (0, 0, 1.25), mat_white, collection))
    objs.append(hq.add_cube("HS_CrossBase_Y", (12.0, 38.0, 2.5), (0, 0, 1.25), mat_white, collection))
    objs.append(hq.add_cylinder("HS_CrossHub", 7.0, 3.0, (0, 0, 1.5), mat_white2, collection, vertices=16))

    # Corner nano shields
    for i, (dx, dy) in enumerate(((14.0, 14.0), (-14.0, 14.0), (14.0, -14.0), (-14.0, -14.0))):
        objs.append(
            hq.add_cube(
                f"HS_NanoShield_{i}",
                (5.0, 5.0, 3.5),
                (dx, dy, 2.75),
                mat_white2,
                collection,
                rotation=(0.0, 0.0, math.radians(45)),
            )
        )

    # Central bio-cylinder
    objs.append(hq.add_cylinder("HS_BioShell", 4.5, 28.0, (0, 0, 2.5 + 14.0), mat_white, collection, vertices=20))
    objs.append(hq.add_cylinder("HS_BioFluid", 3.0, 26.0, (0, 0, 2.5 + 13.0), mat_kelly, collection, vertices=16))
    for z in (8.0, 16.0, 24.0):
        objs.append(hq.add_torus(f"HS_BioBand_{int(z)}", 4.8, 0.25, (0, 0, z), mat_teal, collection))

    # Double-helix DNA exoskeleton (connected segment chain)
    steps = 22
    height0, height1 = 4.0, 30.0
    for strand in range(2):
        phase = strand * math.pi
        prev = None
        for i in range(steps):
            t = i / (steps - 1)
            z = height0 + t * (height1 - height0)
            ang = t * math.pi * 3.5 + phase
            r = 5.8
            x, y = r * math.cos(ang), r * math.sin(ang)
            objs.append(
                hq.add_cube(
                    f"HS_Helix_{strand}_{i}",
                    (0.9, 0.9, 1.1),
                    (x, y, z),
                    mat_teal,
                    collection,
                    rotation=(0.0, 0.0, ang),
                )
            )
            if prev is not None:
                mx = (prev[0] + x) * 0.5
                my = (prev[1] + y) * 0.5
                mz = (prev[2] + z) * 0.5
                objs.append(
                    hq.add_cube(
                        f"HS_HelixLink_{strand}_{i}",
                        (0.55, 0.55, 1.4),
                        (mx, my, mz),
                        mat_teal,
                        collection,
                        rotation=(0.0, 0.0, math.atan2(my, mx)),
                    )
                )
            prev = (x, y, z)
        # ladder rungs every 3 steps
        for i in range(1, steps - 1, 3):
            t = i / (steps - 1)
            z = height0 + t * (height1 - height0)
            ang = t * math.pi * 3.5 + phase
            ang2 = t * math.pi * 3.5 + (1 - strand) * math.pi
            x1, y1 = 5.2 * math.cos(ang), 5.2 * math.sin(ang)
            x2, y2 = 5.2 * math.cos(ang2), 5.2 * math.sin(ang2)
            if strand == 0:
                mx, my = (x1 + x2) * 0.5, (y1 + y2) * 0.5
                rung_len = math.hypot(x2 - x1, y2 - y1) or 2.0
                objs.append(
                    hq.add_cube(
                        f"HS_Rung_{i}",
                        (rung_len, 0.28, 0.28),
                        (mx, my, z),
                        mat_kelly,
                        collection,
                        rotation=(0.0, 0.0, math.atan2(y2 - y1, x2 - x1)),
                    )
                )

    # Apex lilac medical cross
    objs.append(hq.add_cylinder("HS_CrestStem", 1.2, 3.0, (0, 0, 33.5), mat_white, collection, vertices=8))
    objs.append(hq.add_cube("HS_Crest_X", (7.0, 2.0, 2.0), (0, 0, 36.0), mat_lilac, collection))
    objs.append(hq.add_cube("HS_Crest_Y", (2.0, 7.0, 2.0), (0, 0, 36.0), mat_lilac, collection))
    objs.append(hq.add_icosphere("HS_CrestCore", 1.0, (0, 0, 36.0), mat_lilac, collection, subdivisions=1))

    return objs


if __name__ == "__main__":
    hq.run_school_builder(build, "uhs", META)
