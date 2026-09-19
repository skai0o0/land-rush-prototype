"""Dốc tình Nhân Văn — S-curve slope road, flower trees, benches, lamps."""
from __future__ import annotations

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import bpy
import _landmark_common as lm

META = {
    "id": "landmark_doc_tinh",
    "name": "Dốc tình Nhân Văn",
    "gameplay_role": "speed_corridor",
    "tile_footprint": {"width": 5, "depth": 2},
}


def _s_path_points(n=10):
    """S-curve from (x=-20,y=0,z=0) to (x=20,y=±,z=5.5)."""
    pts = []
    for i in range(n + 1):
        t = i / n
        x = -20.0 + 40.0 * t
        y = 3.2 * math.sin(t * math.pi * 1.6)
        z = 5.5 * t
        pts.append((x, y, z))
    return pts


def _ribbon_mesh(pts, half_width, z_offset=0.0):
    verts = []
    faces = []
    for i, (x, y, z) in enumerate(pts):
        if i < len(pts) - 1:
            dx = pts[i + 1][0] - x
            dy = pts[i + 1][1] - y
        else:
            dx = x - pts[i - 1][0]
            dy = y - pts[i - 1][1]
        length = math.hypot(dx, dy) or 1.0
        nx, ny = -dy / length, dx / length
        zz = z + z_offset
        verts.append((x + nx * half_width, y + ny * half_width, zz))
        verts.append((x - nx * half_width, y - ny * half_width, zz))
    for i in range(len(pts) - 1):
        a = i * 2
        faces.append((a, a + 1, a + 3, a + 2))
    return verts, faces


def _ribbon_solid(pts, half_width, thickness, z_offset=0.0):
    top_v, top_f = _ribbon_mesh(pts, half_width, z_offset)
    bot_v, bot_f = _ribbon_mesh(pts, half_width, z_offset - thickness)
    n = len(top_v)
    verts = top_v + bot_v
    faces = list(top_f)
    for f in bot_f:
        faces.append(tuple(i + n for i in reversed(f)))
    for i in range(len(pts) - 1):
        a = i * 2
        # side walls
        faces.append((a, a + 2, a + 2 + n, a + n))
        faces.append((a + 1 + n, a + 3 + n, a + 3, a + 1))
    return verts, faces


def build(collection):
    mat_road = lm.create_pbr_material("Mat_doc_tinh_Asphalt", "#37474F", roughness=0.88)
    mat_walk = lm.create_pbr_material("Mat_doc_tinh_Sidewalk", "#D7CCC8", roughness=0.85)
    mat_trunk = lm.create_pbr_material("Mat_doc_tinh_Trunk", "#5D4037", roughness=0.9)
    mat_leaf_y = lm.create_pbr_material("Mat_doc_tinh_Bellflower", "#FDD835", roughness=0.75)
    mat_leaf_p = lm.create_pbr_material("Mat_doc_tinh_Bougainvillea", "#E91E63", roughness=0.75)
    mat_leaf_g = lm.create_pbr_material("Mat_doc_tinh_Leaf", "#2E7D32", roughness=0.85)
    mat_bench = lm.create_pbr_material("Mat_doc_tinh_Bench", "#ECEFF1", roughness=0.7)
    mat_lamp = lm.create_pbr_material("Mat_doc_tinh_Lamp", "#455A64", metallic=0.75, roughness=0.35)
    mat_lamp_glow = lm.create_pbr_material(
        "Mat_doc_tinh_LampGlow", "#FFF59D", roughness=0.4, emit_hex="#FFEE58", emit_strength=3.0
    )
    mat_grass = lm.create_pbr_material("Mat_doc_tinh_Grass", "#43A047", roughness=0.9)
    mat_faction = lm.faction_material("doc_tinh")

    objs = []
    pts = _s_path_points(10)

    road_v, road_f = _ribbon_solid(pts, 3.2, 0.35, 0.0)
    road = lm.create_mesh_object("DocTinh_Road", road_v, road_f, (0, 0, 0), mat_road, collection)
    objs.append(road)

    # sidewalks both sides
    for side, sign in (("L", 1.0), ("R", -1.0)):
        side_pts = []
        for i, (x, y, z) in enumerate(pts):
            if i < len(pts) - 1:
                dx = pts[i + 1][0] - x
                dy = pts[i + 1][1] - y
            else:
                dx = x - pts[i - 1][0]
                dy = y - pts[i - 1][1]
            length = math.hypot(dx, dy) or 1.0
            nx, ny = -dy / length, dx / length
            side_pts.append((x + nx * 4.2 * sign, y + ny * 4.2 * sign, z))
        sv, sf = _ribbon_solid(side_pts, 0.9, 0.25, 0.05)
        walk = lm.create_mesh_object(f"DocTinh_Sidewalk_{side}", sv, sf, (0, 0, 0), mat_walk, collection)
        objs.append(walk)
        gv, gf = _ribbon_solid(
            [(p[0] + (0), p[1] + (2.0 * sign if False else 0), p[2]) for p in side_pts],
            1.2,
            0.1,
            0.0,
        )
        # planter strips
        for i in range(1, len(side_pts), 2):
            x, y, z = side_pts[i]
            planter = lm.add_cube(
                f"DocTinh_Planter_{side}_{i}",
                (2.2, 1.4, 0.45),
                (x, y, z + 0.35),
                mat_grass,
                collection,
            )
            objs.append(planter)

    # Trees: shade + yellow bellflower + pink bougainvillea
    tree_specs = []
    for i in range(1, len(pts) - 1):
        x, y, z = pts[i]
        if i < len(pts) - 1:
            dx = pts[i + 1][0] - x
            dy = pts[i + 1][1] - y
        else:
            dx = x - pts[i - 1][0]
            dy = y - pts[i - 1][1]
        length = math.hypot(dx, dy) or 1.0
        nx, ny = -dy / length, dx / length
        for sign in (1.0, -1.0):
            tx = x + nx * 5.2 * sign
            ty = y + ny * 5.2 * sign
            tree_specs.append((tx, ty, z, i, sign))

    for idx, (tx, ty, z, i, sign) in enumerate(tree_specs):
        trunk_h = 2.4 + (idx % 3) * 0.25
        trunk = lm.add_cylinder(
            f"DocTinh_Trunk_{idx}", 0.18, trunk_h, (tx, ty, z + trunk_h * 0.5), mat_trunk, collection, vertices=6
        )
        objs.append(trunk)
        if idx % 3 == 0:
            leaf_mat = mat_leaf_y
        elif idx % 3 == 1:
            leaf_mat = mat_leaf_p
        else:
            leaf_mat = mat_leaf_g
        for k, (ox, oy, oz, r) in enumerate([
            (0, 0, trunk_h + 0.6, 1.3),
            (0.6, 0.3, trunk_h + 1.2, 0.9),
            (-0.5, -0.4, trunk_h + 1.0, 0.85),
        ]):
            canopy = lm.add_icosphere(
                f"DocTinh_Canopy_{idx}_{k}", r, (tx + ox, ty + oy, z + oz), leaf_mat, collection, subdivisions=1
            )
            objs.append(canopy)

    # Benches + lamps every ~2 path steps
    for i in range(2, len(pts) - 1, 2):
        x, y, z = pts[i]
        if i < len(pts) - 1:
            dx = pts[i + 1][0] - x
            dy = pts[i + 1][1] - y
        else:
            dx = x - pts[i - 1][0]
            dy = y - pts[i - 1][1]
        length = math.hypot(dx, dy) or 1.0
        nx, ny = -dy / length, dx / length
        ang = math.atan2(dy, dx)
        for sign in (1.0, -1.0):
            bx = x + nx * 3.8 * sign
            by = y + ny * 3.8 * sign
            bench = lm.add_cube(
                f"DocTinh_Bench_{i}_{int(sign)}",
                (1.8, 0.55, 0.45),
                (bx, by, z + 0.35),
                mat_bench,
                collection,
                rotation=(0, 0, ang),
            )
            objs.append(bench)
        # lamp one side
        lx = x + nx * 4.8
        ly = y + ny * 4.8
        pole = lm.add_cylinder(f"DocTinh_LampPole_{i}", 0.08, 3.6, (lx, ly, z + 1.8), mat_lamp, collection, vertices=6)
        head = lm.add_cone(f"DocTinh_LampHead_{i}", 0.35, 0.45, (lx, ly, z + 3.7), mat_lamp_glow, collection, vertices=6)
        head.rotation_euler = (math.pi, 0, 0)
        bpy.ops.object.transform_apply(rotation=True)
        objs.extend([pole, head])

    # Faction pano strip at crest
    crest = pts[-1]
    pano = lm.add_cube(
        "DocTinh_FactionPano",
        (3.5, 0.35, 1.2),
        (crest[0] - 1.5, crest[1] + 5.0, crest[2] + 1.4),
        mat_faction,
        collection,
        rotation=(0, 0, 0.2),
    )
    objs.append(pano)

    # Ground pad at foot
    pad = lm.add_cube("DocTinh_FootPad", (10.0, 8.0, 0.2), (-20.0, 0.0, 0.0), mat_walk, collection)
    objs.append(pad)

    return objs


if __name__ == "__main__":
    lm.run_landmark_builder(build, "doc_tinh", META)
