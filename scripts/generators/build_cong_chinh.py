"""Nút giao Cổng chính ĐHQG — overpass, underpass, open-book monument, 3D name."""
from __future__ import annotations

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import bpy
import _landmark_common as lm

META = {
    "id": "landmark_cong_chinh",
    "name": "Nút giao Cổng chính ĐHQG",
    "gameplay_role": "frontier_gate",
    "tile_footprint": {"width": 8, "depth": 5},
}


def _overpass_deck(name, points, width, thickness, mat, collection):
    """Swept rectangular deck along a polyline of (x,y,z) centers."""
    verts = []
    faces = []
    hw = width * 0.5
    ht = thickness * 0.5
    for i, (x, y, z) in enumerate(points):
        if i < len(points) - 1:
            dx, dy = points[i + 1][0] - x, points[i + 1][1] - y
        else:
            dx, dy = x - points[i - 1][0], y - points[i - 1][1]
        length = math.hypot(dx, dy) or 1.0
        nx, ny = -dy / length, dx / length
        # 4 corners of deck section
        verts.extend([
            (x + nx * hw, y + ny * hw, z + ht),
            (x - nx * hw, y - ny * hw, z + ht),
            (x - nx * hw, y - ny * hw, z - ht),
            (x + nx * hw, y + ny * hw, z - ht),
        ])
    n = len(points)
    for i in range(n - 1):
        a = i * 4
        b = (i + 1) * 4
        faces.append((a, a + 1, b + 1, b))
        faces.append((a + 1, a + 2, b + 2, b + 1))
        faces.append((a + 2, a + 3, b + 3, b + 2))
        faces.append((a + 3, a, b, b + 3))
    faces.append((0, 1, 2, 3))
    last = (n - 1) * 4
    faces.append((last + 3, last + 2, last + 1, last))
    return lm.create_mesh_object(name, verts, faces, (0, 0, 0), mat, collection)


def build(collection):
    mat_road = lm.create_pbr_material("Mat_cong_Asphalt", "#37474F", roughness=0.9)
    mat_deck = lm.create_pbr_material("Mat_cong_Deck", "#90A4AE", roughness=0.8)
    mat_pier = lm.create_pbr_material("Mat_cong_Pier", "#78909C", roughness=0.85)
    mat_ground = lm.create_pbr_material("Mat_cong_Ground", "#8D6E63", roughness=0.92)
    mat_granite = lm.create_pbr_material("Mat_cong_Granite", "#8E2430", roughness=0.72)
    mat_book = lm.create_pbr_material("Mat_cong_Book", "#ECEFF1", roughness=0.65)
    mat_globe = lm.create_pbr_material(
        "Mat_cong_Globe", "#F2A900", metallic=0.9, roughness=0.2
    )
    mat_text = lm.create_pbr_material(
        "Mat_cong_Text", "#F2A900", metallic=0.9, roughness=0.2
    )
    mat_flower = lm.create_pbr_material("Mat_cong_Flower", "#E91E63", roughness=0.8)
    mat_lawn = lm.create_pbr_material("Mat_cong_Lawn", "#2E7D32", roughness=0.9)
    mat_faction = lm.faction_material("cong_chinh")

    objs = []

    # Ground plane with underpass cut suggestion (side ramps + dark channel)
    ground = lm.add_plane("Cong_Ground", (64.0, 42.0), (0.0, 0.0, 0.0), mat_ground, collection)
    objs.append(ground)
    channel = lm.add_cube("Cong_UnderpassChannel", (64.0, 10.0, 0.3), (0.0, 0.0, -0.55), mat_road, collection)
    objs.append(channel)
    # underpass walls
    for sign in (-1.0, 1.0):
        wall = lm.add_cube(
            f"Cong_UnderWall_{int(sign)}", (48.0, 0.6, 2.2),
            (0.0, sign * 5.2, -1.0), mat_pier, collection
        )
        objs.append(wall)
    # local road through underpass
    under_road = lm.add_plane("Cong_UnderRoad", (48.0, 8.0), (0.0, 0.0, -0.35), mat_road, collection)
    objs.append(under_road)

    # S-curved overpass deck (Xa lộ style)
    pts = []
    for i in range(9):
        t = i / 8.0
        x = -28.0 + 56.0 * t
        y = 6.0 * math.sin(t * math.pi)
        z = 7.5 + 1.2 * math.sin(t * math.pi)
        pts.append((x, y, z))
    deck = _overpass_deck("Cong_OverpassDeck", pts, 8.0, 0.7, mat_deck, collection)
    objs.append(deck)

    # Piers with pier caps + approach ramps
    for i in (1, 3, 5, 7):
        x, y, z = pts[i]
        pier = lm.add_cube(f"Cong_Pier_{i}", (1.4, 2.2, z - 0.4), (x, y, (z - 0.4) * 0.5), mat_pier, collection)
        cap = lm.add_cube(f"Cong_PierCap_{i}", (3.0, 3.2, 0.5), (x, y, z - 0.55), mat_pier, collection)
        foot = lm.add_cube(f"Cong_PierFoot_{i}", (2.2, 3.0, 0.4), (x, y, 0.2), mat_pier, collection)
        objs.extend([pier, cap, foot])

    # Road approach slabs
    for sign in (-1.0, 1.0):
        ramp = lm.add_cube(
            f"Cong_Approach_{int(sign)}", (12.0, 10.0, 0.25),
            (sign * 26.0, 0.0, 0.12), mat_road, collection
        )
        objs.append(ramp)
        # lane marks
        for j in range(3):
            mark = lm.add_cube(
                f"Cong_LaneMark_{int(sign)}_{j}",
                (2.0, 0.35, 0.04),
                (sign * (22.0 + j * 3.0), 0.0, 0.28),
                mat_text if False else mat_deck,
                collection,
            )
            objs.append(mark)

    # Guard rails on overpass (sparse)
    for i, (x, y, z) in enumerate(pts[::3]):
        for sign in (-1.0, 1.0):
            rail = lm.add_cube(
                f"Cong_Rail_{i}_{int(sign)}", (5.5, 0.15, 0.45),
                (x, y + sign * 3.9, z + 0.55), mat_deck, collection
            )
            objs.append(rail)

    # Central roundabout / landscape island (simple concentric pads)
    island = lm.add_cylinder("Cong_Island", 8.0, 0.35, (0.0, 0.0, 0.15), mat_lawn, collection, vertices=14)
    objs.append(island)
    flower_outer = lm.add_cylinder("Cong_FlowerOuter", 6.2, 0.22, (0.0, 0.0, 0.4), mat_flower, collection, vertices=14)
    flower_mid = lm.add_cylinder("Cong_FlowerMid", 5.0, 0.26, (0.0, 0.0, 0.42), mat_lawn, collection, vertices=12)
    flower_inner = lm.add_cylinder("Cong_FlowerInner", 4.0, 0.28, (0.0, 0.0, 0.45), mat_flower, collection, vertices=12)
    objs.extend([flower_outer, flower_mid, flower_inner])
    # decorative flower clumps
    for i in range(8):
        ang = math.radians(i * 45 + 12)
        fx, fy = 5.5 * math.cos(ang), 5.5 * math.sin(ang)
        clump = lm.add_icosphere(f"Cong_FlowerClump_{i}", 0.45, (fx, fy, 0.65), mat_flower, collection, subdivisions=1)
        objs.append(clump)

    # Open-book monument base (tilted slabs)
    base = lm.add_cube("Cong_MonumentBase", (7.0, 4.5, 1.2), (0.0, 0.0, 0.95), mat_granite, collection)
    lm.bevel_object(base, width=0.12, segments=1)
    objs.append(base)

    # Book pages (two tilted planes as cubes)
    page_l = lm.add_cube(
        "Cong_BookLeft", (4.2, 2.8, 0.25),
        (-1.9, 0.0, 2.2), mat_book, collection,
        rotation=(0, math.radians(-18), math.radians(8))
    )
    page_r = lm.add_cube(
        "Cong_BookRight", (4.2, 2.8, 0.25),
        (1.9, 0.0, 2.2), mat_book, collection,
        rotation=(0, math.radians(18), math.radians(-8))
    )
    objs.extend([page_l, page_r])

    # Globe on book
    globe = lm.add_icosphere("Cong_Globe", 1.35, (0.0, 0.0, 3.6), mat_globe, collection, subdivisions=1)
    ring = lm.add_cylinder("Cong_GlobeRing", 1.45, 0.12, (0.0, 0.0, 3.6), mat_text, collection, vertices=10)
    ring.rotation_euler = (math.pi / 2, 0, 0)
    bpy.ops.object.transform_apply(rotation=True)
    objs.extend([globe, ring])

    # Side pillars with faction color + wall panels
    for sign in (-1.0, 1.0):
        pillar = lm.add_cube(
            f"Cong_Pillar_{int(sign)}", (1.2, 2.0, 5.5),
            (sign * 7.5, 0.0, 2.75), mat_granite, collection
        )
        cap = lm.add_cube(
            f"Cong_PillarCap_{int(sign)}", (1.6, 2.4, 0.4),
            (sign * 7.5, 0.0, 5.7), mat_faction, collection
        )
        wall = lm.add_cube(
            f"Cong_Wall_{int(sign)}", (4.5, 0.6, 2.2),
            (sign * 10.5, 0.0, 1.1), mat_granite, collection
        )
        objs.extend([pillar, cap, wall])

    # 3D text nameplate — low-res extruded lettering strip (budget-safe)
    # Default Blender font + long Vietnamese string explodes tri count; use
    # a gold nameplate bar + chunky block glyphs instead.
    plaque = lm.add_cube("Cong_NamePlaque", (18.0, 0.35, 1.0), (0.0, -3.8, 0.7), mat_text, collection)
    objs.append(plaque)
    # simplified block "letters" to imply the nameplate at isometric range
    for i in range(9):
        glyph = lm.add_cube(
            f"Cong_NameGlyph_{i}",
            (1.1, 0.18, 0.55),
            (-7.2 + i * 1.8, -4.05, 0.85),
            mat_book if i % 2 == 0 else mat_text,
            collection,
        )
        objs.append(glyph)

    # Optional true text mesh kept very small if budget allows after rebuild
    try:
        bpy.ops.object.text_add(location=(0.0, -4.35, 0.35))
        txt = bpy.context.active_object
        txt.name = "Cong_NameText"
        txt.data.body = "DHQG-HCM"
        txt.data.size = 0.42
        txt.data.extrude = 0.04
        txt.data.resolution_u = 2
        txt.data.align_x = "CENTER"
        txt.rotation_euler = (math.radians(90), 0.0, 0.0)
        bpy.ops.object.convert(target="MESH")
        txt = bpy.context.active_object
        if txt.data.materials:
            txt.data.materials[0] = mat_text
        else:
            txt.data.materials.append(mat_text)
        lm.link_to_collection(txt, collection)
        lm.cleanup_mesh(txt)
        objs.append(txt)
    except Exception as exc:
        print(f"[cong_chinh] text mesh skipped: {exc}")

    # Faction banner atop left pillar
    banner = lm.add_cube("Cong_FactionBanner", (0.2, 2.2, 2.4), (-7.5, 0.0, 7.2), mat_faction, collection)
    objs.append(banner)

    return objs


if __name__ == "__main__":
    lm.run_landmark_builder(build, "cong_chinh", META)
