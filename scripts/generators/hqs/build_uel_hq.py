"""UEL HQ — Legislative Citadel & Twin Finance Towers."""
from __future__ import annotations

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import _hq_common as hq


META = {
    "name": "Trường Đại học Kinh tế - Luật (UEL)",
    "concept": "Viện Pháp Lý & Tháp Tài Chính / Legislative Citadel",
    "primary_colors": ["#0055A5", "#F1F5F9", "#DAA520"],
    "emission_colors": ["#DAA520"],
    "tactical_role": "Gia tăng tích lũy tài chính, tạo lá chắn",
}


def build(collection):
    mat_white = hq.create_pbr_material("MAT_EL_CleanWhite", "#F1F5F9", metallic=0.1, roughness=0.3)
    mat_blue = hq.create_pbr_material("MAT_EL_RoyalBlue", "#0055A5", metallic=0.5, roughness=0.2)
    mat_glass = hq.create_pbr_material("MAT_EL_MirrorGlass", "#94A3B8", metallic=0.95, roughness=0.05)
    mat_gold = hq.create_pbr_material(
        "MAT_EL_GoldLeaf", "#DAA520", metallic=0.9, roughness=0.15,
        emit_hex="#DAA520", emit_strength=2.0,
    )
    mat_gold_glow = hq.create_pbr_material(
        "MAT_EL_GoldGlow", "#DAA520", roughness=0.2, emit_hex="#DAA520", emit_strength=9.0
    )

    objs = []
    # Semicircular parliament plinth (half cylinder via scaled cube + cylinder)
    objs.append(hq.add_cylinder("UEL_ParliamentArc", 22.0, 4.0, (0, 0, 2.0), mat_white, collection, vertices=24))
    # Cover rear half with a blocking plate look
    objs.append(hq.add_cube("UEL_ParliamentBlock", (24.0, 22.0, 4.0), (0, 9.0, 2.0), mat_white, collection))

    # Front stairs + parliament colonnade
    for i, (y, w, h) in enumerate(((-12.0, 28.0, 0.8), (-13.6, 25.0, 0.8), (-15.2, 22.0, 0.8), (-16.8, 18.0, 0.8))):
        objs.append(hq.add_cube(f"UEL_Stair_{i}", (w, 2.0, h), (0, y, 0.4 + i * 0.8), mat_white, collection))
    for i in range(8):
        ang = math.radians(200 + i * 20)
        px, py = 16.5 * math.cos(ang), 16.5 * math.sin(ang) + 4.0
        if py < -2:
            continue
        objs.append(hq.add_cylinder(f"UEL_ArcColumn_{i}", 0.55, 7.0, (px, py, 7.5), mat_white, collection, vertices=8))

    # Central plaza floor
    objs.append(hq.add_cube("UEL_Plaza", (36.0, 28.0, 0.4), (0, 0, 4.2), mat_white, collection))

    # Twin towers (Economy / Law)
    for side, sx in (("L", -9.0), ("R", 9.0)):
        objs.append(hq.add_cube(f"UEL_Tower_{side}", (7.0, 7.0, 28.0), (sx, 2.0, 4.0 + 14.0), mat_blue, collection))
        objs.append(hq.add_cube(f"UEL_TowerCap_{side}", (7.6, 7.6, 1.0), (sx, 2.0, 32.5), mat_white, collection))
        # Golden sunshade louvers (dense vertical fins)
        for j in range(14):
            z = 6.0 + j * 1.9
            for face, fy in enumerate((2.0 + 3.45, 2.0 - 3.45)):
                objs.append(
                    hq.add_cube(
                        f"UEL_Louver_{side}_{face}_{j}",
                        (7.2, 0.35, 0.28),
                        (sx, fy, z),
                        mat_gold,
                        collection,
                        rotation=(0.0, math.radians(20 if face == 0 else -20), 0.0),
                    )
                )
        # tower window grid
        for j in range(5):
            for k in range(3):
                objs.append(
                    hq.add_cube(
                        f"UEL_Win_{side}_{j}_{k}",
                        (1.4, 0.25, 1.0),
                        (sx - 2.0 + k * 2.0, 2.0 - 3.6, 8.0 + j * 4.5),
                        mat_glass,
                        collection,
                    )
                )

    # Heart-of-knowledge curved skybridge
    objs.append(hq.add_cube("UEL_HeartBridge", (18.5, 3.2, 3.0), (0, 2.0, 22.0), mat_glass, collection))
    objs.append(hq.add_cube("UEL_HeartBridgeSpine", (18.5, 1.0, 0.6), (0, 2.0, 23.7), mat_gold, collection))
    # Convex heart bump
    objs.append(hq.add_uvsphere("UEL_HeartNode", 2.2, (0, 2.0, 22.0), mat_glass, collection, segments=12, rings=8, cut_half=True))
    objs[-1].location.z = 22.0

    # Apex scales of justice
    objs.append(hq.add_cylinder("UEL_ApexStem", 0.7, 4.0, (0, 2.0, 36.0), mat_gold, collection, vertices=8))
    objs.append(hq.add_cube("UEL_ScalesBar", (10.0, 0.6, 0.5), (0, 2.0, 38.2), mat_gold_glow, collection))
    objs.append(hq.add_cylinder("UEL_PanL", 1.8, 0.4, (-4.2, 2.0, 37.2), mat_gold_glow, collection, vertices=12))
    objs.append(hq.add_cylinder("UEL_PanR", 1.8, 0.4, (4.2, 2.0, 37.2), mat_gold_glow, collection, vertices=12))
    objs.append(hq.add_cone("UEL_ApexPyramid", 2.5, 3.0, (0, 2.0, 40.5), mat_gold_glow, collection, vertices=4))

    return objs


if __name__ == "__main__":
    hq.run_school_builder(build, "uel", META)
