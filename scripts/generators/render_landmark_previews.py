"""Render isometric preview PNGs for all VNUHCM landmark GLBs."""
from __future__ import annotations

import math
from pathlib import Path

import bpy

ROOT = Path(r"C:\Users\AMTECH\Desktop\Land-Rush-Prototype")
SRC = ROOT / "public" / "models" / "landmarks"
OUT = SRC / "preview"
OUT.mkdir(parents=True, exist_ok=True)

LANDMARKS = [
    "ho_da",
    "doc_tinh",
    "duong_danh_nhan",
    "nha_dieu_hanh",
    "nvh_sinh_vien",
    "cho_dem",
    "ktx_khu_a",
    "ktx_khu_b",
    "tram_xe_buyt",
    "cong_chinh",
]


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def setup_world():
    world = bpy.data.worlds.get("World") or bpy.data.worlds.new("World")
    bpy.context.scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs[0].default_value = (0.12, 0.13, 0.15, 1.0)
        bg.inputs[1].default_value = 1.0


def frame_and_render(glb_name: str):
    path = SRC / f"{glb_name}.glb"
    if not path.exists():
        print(f"[PREVIEW] missing {path}")
        return None
    clear_scene()
    setup_world()

    bpy.ops.import_scene.gltf(filepath=str(path))

    # bounds
    from mathutils import Vector
    min_v = Vector((1e9, 1e9, 1e9))
    max_v = Vector((-1e9, -1e9, -1e9))
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    if not meshes:
        print(f"[PREVIEW] empty {glb_name}")
        return None
    for o in meshes:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            for i in range(3):
                min_v[i] = min(min_v[i], w[i])
                max_v[i] = max(max_v[i], w[i])
    center = (min_v + max_v) / 2.0
    size = max_v - min_v
    extent = max(size.x, size.y, size.z, 8.0)

    # sun
    bpy.ops.object.light_add(type="SUN", location=(center.x + 30, center.y - 40, center.z + 60))
    sun = bpy.context.active_object
    sun.data.energy = 3.5
    sun.rotation_euler = (math.radians(50), 0, math.radians(35))

    # isometric-ish camera
    dist = extent * 1.55
    bpy.ops.object.camera_add()
    cam = bpy.context.active_object
    cam.data.lens = 45
    cam.location = (
        center.x + dist * 0.62,
        center.y - dist * 0.78,
        center.z + dist * 0.62,
    )
    direction = center - cam.location
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.camera = cam

    scene = bpy.context.scene
    engine = None
    for candidate in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT", "CYCLES"):
        try:
            scene.render.engine = candidate
            engine = candidate
            break
        except Exception:
            continue
    if engine is None:
        raise RuntimeError("No render engine available")
    scene.render.resolution_x = 960
    scene.render.resolution_y = 720
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    out_path = OUT / f"{glb_name}.png"
    scene.render.filepath = str(out_path)
    bpy.ops.render.render(write_still=True)
    size_kb = out_path.stat().st_size / 1024.0 if out_path.exists() else 0
    print(f"[PREVIEW] {glb_name}: {out_path.name} {size_kb:.1f}KB meshes={len(meshes)}")
    return str(out_path)


def main():
    results = []
    for name in LANDMARKS:
        try:
            results.append(frame_and_render(name))
        except Exception as exc:
            print(f"[PREVIEW][FAIL] {name}: {exc}")
            results.append(None)
    ok = [r for r in results if r]
    print(f"[PREVIEW] done {len(ok)}/{len(LANDMARKS)} -> {OUT}")


if __name__ == "__main__":
    main()
