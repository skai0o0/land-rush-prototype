"""Shared Blender helpers for VNUHCM landmark generators (Land-Rush RTS)."""
from __future__ import annotations

import datetime
import json
import math
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector

PROJECT_ROOT = Path(__file__).resolve().parents[3]
EXPORT_DIR = PROJECT_ROOT / "client" / "public" / "models" / "landmarks"
MANIFEST_PATH = EXPORT_DIR / "manifest.json"
TILE_METERS = 8.0
FACTION_HEX = "#1488D8"
POLY_MIN = 1200
POLY_MAX = 4800
MAX_FILE_KB = 250.0


def srgb_to_linear(c_srgb: float) -> float:
    if c_srgb <= 0.04045:
        return c_srgb / 12.92
    return ((c_srgb + 0.055) / 1.055) ** 2.4


def hex_to_linear_rgb(hex_str: str, alpha: float = 1.0):
    hex_clean = hex_str.lstrip("#")
    r = int(hex_clean[0:2], 16) / 255.0
    g = int(hex_clean[2:4], 16) / 255.0
    b = int(hex_clean[4:6], 16) / 255.0
    return (srgb_to_linear(r), srgb_to_linear(g), srgb_to_linear(b), alpha)


def _set_input(node, name: str, value):
    if name in node.inputs:
        node.inputs[name].default_value = value
        return True
    return False


def create_pbr_material(
    name: str,
    base_hex: str,
    metallic: float = 0.0,
    roughness: float = 0.8,
    emit_hex: str | None = None,
    emit_strength: float = 0.0,
    alpha: float = 1.0,
    transmission: float = 0.0,
):
    mat = bpy.data.materials.get(name)
    if mat is None:
        mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    bsdf = nodes.get("Principled BSDF")
    if bsdf is None:
        bsdf = next((n for n in nodes if n.type == "BSDF_PRINCIPLED"), None)
    if bsdf is None:
        return mat

    _set_input(bsdf, "Base Color", hex_to_linear_rgb(base_hex, alpha))
    _set_input(bsdf, "Metallic", metallic)
    _set_input(bsdf, "Roughness", roughness)
    _set_input(bsdf, "Alpha", alpha)
    if transmission > 0.0:
        if not _set_input(bsdf, "Transmission Weight", transmission):
            _set_input(bsdf, "Transmission", transmission)
    if alpha < 1.0 or transmission > 0.0:
        try:
            mat.blend_method = "BLEND"
        except Exception:
            pass
        if hasattr(mat, "shadow_method"):
            try:
                mat.shadow_method = "HASHED"
            except Exception:
                pass
    if emit_hex and emit_strength > 0.0:
        if not _set_input(bsdf, "Emission Color", hex_to_linear_rgb(emit_hex)):
            _set_input(bsdf, "Emission", hex_to_linear_rgb(emit_hex))
        _set_input(bsdf, "Emission Strength", emit_strength)
    return mat


def faction_material(landmark_id: str, hex_color: str = FACTION_HEX):
    return create_pbr_material(
        f"Mat_{landmark_id}_FactionAccent",
        hex_color,
        metallic=0.2,
        roughness=0.4,
    )


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.objects, bpy.data.collections):
        for item in list(block):
            try:
                block.remove(item)
            except Exception:
                pass


def ensure_collection(name: str):
    col = bpy.data.collections.get(name)
    if col is None:
        col = bpy.data.collections.new(name)
    if col.name not in bpy.context.scene.collection.children:
        bpy.context.scene.collection.children.link(col)
    return col


def link_to_collection(obj, collection):
    for col in list(obj.users_collection):
        col.objects.unlink(obj)
    collection.objects.link(obj)


def set_flat_shading(obj):
    if obj.type != "MESH":
        return
    for poly in obj.data.polygons:
        poly.use_smooth = False


def cleanup_mesh(obj):
    if obj.type != "MESH":
        return
    set_flat_shading(obj)
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    try:
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.mesh.remove_doubles(threshold=0.01)
        try:
            bpy.ops.mesh.dissolve_degenerate()
        except Exception:
            pass
        bpy.ops.object.mode_set(mode="OBJECT")
    except Exception:
        try:
            bpy.ops.object.mode_set(mode="OBJECT")
        except Exception:
            pass
    obj.select_set(False)
    set_flat_shading(obj)


def add_cube(name, size, location, material, collection, rotation=(0.0, 0.0, 0.0)):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location, rotation=rotation)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = (size[0], size[1], size[2])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if material:
        obj.data.materials.append(material)
    link_to_collection(obj, collection)
    cleanup_mesh(obj)
    return obj


def add_cylinder(
    name,
    radius,
    depth,
    location,
    material,
    collection,
    vertices=8,
    rotation=(0.0, 0.0, 0.0),
    radius_top=None,
    scale=None,
):
    if radius_top is None:
        bpy.ops.mesh.primitive_cylinder_add(
            vertices=vertices,
            radius=radius,
            depth=depth,
            location=location,
            rotation=rotation,
        )
    else:
        bpy.ops.mesh.primitive_cone_add(
            vertices=vertices,
            radius1=radius,
            radius2=radius_top,
            depth=depth,
            location=location,
            rotation=rotation,
        )
    obj = bpy.context.active_object
    obj.name = name
    if scale:
        obj.scale = scale
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if material:
        obj.data.materials.append(material)
    link_to_collection(obj, collection)
    cleanup_mesh(obj)
    return obj


def add_cone(name, radius, depth, location, material, collection, vertices=8, rotation=(0.0, 0.0, 0.0)):
    bpy.ops.mesh.primitive_cone_add(
        vertices=vertices,
        radius1=radius,
        radius2=0.0,
        depth=depth,
        location=location,
        rotation=rotation,
    )
    obj = bpy.context.active_object
    obj.name = name
    if material:
        obj.data.materials.append(material)
    link_to_collection(obj, collection)
    cleanup_mesh(obj)
    return obj


def add_plane(name, size_xy, location, material, collection, rotation=(0.0, 0.0, 0.0)):
    bpy.ops.mesh.primitive_plane_add(size=1.0, location=location, rotation=rotation)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = (size_xy[0], size_xy[1], 1.0)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if material:
        obj.data.materials.append(material)
    link_to_collection(obj, collection)
    cleanup_mesh(obj)
    return obj


def add_icosphere(name, radius, location, material, collection, subdivisions=1, scale=None):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdivisions, radius=radius, location=location)
    obj = bpy.context.active_object
    obj.name = name
    if scale:
        obj.scale = scale
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if material:
        obj.data.materials.append(material)
    link_to_collection(obj, collection)
    cleanup_mesh(obj)
    return obj


def create_mesh_object(name, verts, faces, location, material, collection, materials=None, mat_ids=None):
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    obj.location = location
    collection.objects.link(obj)
    if materials:
        for mat in materials:
            obj.data.materials.append(mat)
        if mat_ids:
            for poly, mid in zip(obj.data.polygons, mat_ids):
                poly.material_index = mid
    elif material:
        obj.data.materials.append(material)
    cleanup_mesh(obj)
    return obj


def pyramid_roof(name, base_x, base_y, height, location, material, collection, top_scale=0.35):
    bx, by = base_x * 0.5, base_y * 0.5
    tx, ty = bx * top_scale, by * top_scale
    verts = [
        (-bx, -by, 0), (bx, -by, 0), (bx, by, 0), (-bx, by, 0),
        (-tx, -ty, height), (tx, -ty, height), (tx, ty, height), (-tx, ty, height),
    ]
    faces = [(0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
    return create_mesh_object(name, verts, faces, location, material, collection)


def hip_roof(name, length, width, height, location, material, collection):
    hx, hy = length * 0.5, width * 0.5
    ridge = max(0.2, length * 0.25)
    verts = [
        (-hx, -hy, 0), (hx, -hy, 0), (hx, hy, 0), (-hx, hy, 0),
        (-ridge, 0, height), (ridge, 0, height),
    ]
    faces = [(0, 1, 5, 4), (2, 3, 4, 5), (1, 2, 5), (3, 0, 4), (0, 3, 2, 1)]
    return create_mesh_object(name, verts, faces, location, material, collection)


def boolean_difference(target, cutter):
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = target
    target.select_set(True)
    mod = target.modifiers.new(name="Bool_Diff", type="BOOLEAN")
    mod.operation = "DIFFERENCE"
    mod.object = cutter
    try:
        bpy.ops.object.modifier_apply(modifier=mod.name)
    except Exception:
        try:
            target.modifiers.remove(mod)
        except Exception:
            pass
    bpy.data.objects.remove(cutter, do_unlink=True)
    cleanup_mesh(target)
    return target


def bevel_object(obj, width=0.06, segments=1, angle_limit=35.0):
    bev = obj.modifiers.new(name="LP_EdgeBevel", type="BEVEL")
    bev.width = width
    bev.segments = segments
    bev.limit_method = "ANGLE"
    bev.angle_limit = math.radians(angle_limit)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    try:
        bpy.ops.object.modifier_apply(modifier=bev.name)
    except Exception:
        try:
            obj.modifiers.remove(bev)
        except Exception:
            pass
    cleanup_mesh(obj)
    return obj


def count_triangles():
    total = 0
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            continue
        total += sum(len(p.vertices) - 2 for p in obj.data.polygons)
    return total


def bounds_of_scene():
    min_v = [1e9, 1e9, 1e9]
    max_v = [-1e9, -1e9, -1e9]
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            continue
        for corner in obj.bound_box:
            world = obj.matrix_world @ Vector(corner)
            for i in range(3):
                min_v[i] = min(min_v[i], world[i])
                max_v[i] = max(max_v[i], world[i])
    size = [max_v[i] - min_v[i] for i in range(3)]
    return {
        "min": [round(v, 3) for v in min_v],
        "max": [round(v, 3) for v in max_v],
        "size_m": [round(v, 3) for v in size],
        "size_tiles": [round(v / TILE_METERS, 3) for v in size],
    }


def parent_to_root(objects, root_name="Landmark_Root"):
    root = bpy.data.objects.get(root_name)
    if root is None:
        root = bpy.data.objects.new(root_name, None)
        root.empty_display_size = 0.5
        bpy.context.scene.collection.objects.link(root)
    for obj in objects:
        if obj != root and obj.parent is None:
            obj.parent = root
            obj.matrix_parent_inverse = root.matrix_world.inverted()
    return root


def export_glb(landmark_file_id: str, meta: dict) -> dict:
    EXPORT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = EXPORT_DIR / f"{landmark_file_id}.glb"
    for obj in bpy.context.scene.objects:
        if obj.type == "MESH":
            cleanup_mesh(obj)
    tris = count_triangles()
    bounds = bounds_of_scene()

    bpy.ops.object.select_all(action="DESELECT")
    export_kwargs = dict(
        filepath=str(out_path),
        export_format="GLB",
        use_selection=False,
        export_apply=True,
        export_yup=True,
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
        export_extras=False,
    )
    # Prefer Draco when available to stay under 250KB
    try:
        bpy.ops.export_scene.gltf(
            export_draco_mesh_compression_enable=True,
            export_draco_mesh_compression_level=6,
            **export_kwargs,
        )
    except TypeError:
        try:
            bpy.ops.export_scene.gltf(
                export_meshopt_compression=True,
                **export_kwargs,
            )
        except TypeError:
            bpy.ops.export_scene.gltf(**export_kwargs)

    size_bytes = out_path.stat().st_size if out_path.exists() else 0
    size_kb = round(size_bytes / 1024.0, 2)
    tile_w = meta.get("tile_footprint", {}).get("width")
    tile_d = meta.get("tile_footprint", {}).get("depth")
    if tile_w is None or tile_d is None:
        tile_w = max(1, int(round(bounds["size_m"][0] / TILE_METERS)))
        tile_d = max(1, int(round(bounds["size_m"][1] / TILE_METERS)))

    entry = {
        "id": meta.get("id", f"landmark_{landmark_file_id}"),
        "name": meta.get("name", landmark_file_id),
        "model_path": f"/models/landmarks/{landmark_file_id}.glb",
        "tile_footprint": {"width": int(tile_w), "depth": int(tile_d)},
        "tris_count": tris,
        "gameplay_role": meta.get("gameplay_role", "neutral_structure"),
        "bounding_box_m": bounds["size_m"],
        "file_size_kb": size_kb,
        "faction_material": f"Mat_{landmark_file_id}_FactionAccent",
        "poly_budget_ok": POLY_MIN <= tris <= POLY_MAX,
        "size_budget_ok": size_kb <= MAX_FILE_KB,
    }
    _update_manifest(entry)
    status = "OK"
    if not entry["poly_budget_ok"]:
        status = "POLY_WARN"
    if not entry["size_budget_ok"]:
        status = "SIZE_WARN"
    print(
        f"[LANDMARK] {landmark_file_id}: tris={tris}, size={size_kb}KB, "
        f"bbox={bounds['size_m']}m, tiles={tile_w}x{tile_d}, {status}"
    )
    return entry


def _update_manifest(entry: dict):
    data = {}
    if MANIFEST_PATH.exists():
        try:
            data = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
        except Exception:
            data = {}
    landmarks = data.get("landmarks")
    if not isinstance(landmarks, list):
        landmarks = []
    landmarks = [x for x in landmarks if x.get("id") != entry["id"] and x.get("model_path") != entry["model_path"]]
    core_keys = (
        "id", "name", "model_path", "tile_footprint", "tris_count",
        "gameplay_role", "bounding_box_m", "file_size_kb",
        "faction_material", "poly_budget_ok", "size_budget_ok",
    )
    landmarks.append({k: entry[k] for k in core_keys if k in entry})
    data = {
        "tile_meters": TILE_METERS,
        "aesthetic": "Chunky Low-Poly, Flat Shading",
        "polygon_budget": f"{POLY_MIN}-{POLY_MAX} triangles",
        "pivot": [0.0, 0.0, 0.0],
        "up_axis_export": "+Y",
        "default_faction_color": FACTION_HEX,
        "landmarks": landmarks,
        "updated_at": datetime.datetime.utcnow().isoformat() + "Z",
    }
    MANIFEST_PATH.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def finalize_and_export(landmark_file_id: str, objects, meta: dict) -> dict:
    if not isinstance(objects, (list, tuple)):
        objects = [objects]
    parent_to_root(list(objects), root_name=f"{landmark_file_id}_Root")
    for obj in objects:
        cleanup_mesh(obj)
    return export_glb(landmark_file_id, meta)


def run_landmark_builder(build_fn, landmark_file_id: str, meta: dict):
    clear_scene()
    collection = ensure_collection(f"Gameplay_Node_{landmark_file_id.upper()}")
    objects = build_fn(collection)
    return finalize_and_export(landmark_file_id, objects, meta)
