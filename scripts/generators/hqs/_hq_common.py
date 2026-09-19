"""Shared Blender helpers for VNU HQ generators (Land-Rush RTS)."""
from __future__ import annotations

import json
import math
import os
import sys
from pathlib import Path

import bpy
import bmesh


PROJECT_ROOT = Path(__file__).resolve().parents[3]
EXPORT_DIR = PROJECT_ROOT / "client" / "public" / "models" / "hqs"
MANIFEST_PATH = EXPORT_DIR / "manifest.json"
TILE_METERS = 8.0


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
    roughness: float = 0.5,
    emit_hex: str | None = None,
    emit_strength: float = 0.0,
    alpha: float = 1.0,
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
    if alpha < 1.0:
        mat.blend_method = "BLEND"
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
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    try:
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.mesh.remove_doubles(threshold=0.0001)
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


def add_uvsphere(name, radius, location, material, collection, segments=12, rings=8, cut_half=False):
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=segments,
        ring_count=rings,
        radius=radius,
        location=location,
    )
    obj = bpy.context.active_object
    obj.name = name
    if cut_half:
        me = obj.data
        bm = bmesh.new()
        bm.from_mesh(me)
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        bmesh.ops.bisect_plane(
            bm,
            geom=geom,
            plane_co=(0.0, 0.0, 0.0),
            plane_no=(0.0, 0.0, 1.0),
            clear_inner=True,
        )
        bm.to_mesh(me)
        bm.free()
        me.update()
    if material:
        obj.data.materials.append(material)
    link_to_collection(obj, collection)
    cleanup_mesh(obj)
    return obj


def add_icosphere(name, radius, location, material, collection, subdivisions=1, cut_half=False):
    bpy.ops.mesh.primitive_ico_sphere_add(
        subdivisions=subdivisions,
        radius=radius,
        location=location,
    )
    obj = bpy.context.active_object
    obj.name = name
    if cut_half:
        me = obj.data
        bm = bmesh.new()
        bm.from_mesh(me)
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        bmesh.ops.bisect_plane(
            bm,
            geom=geom,
            plane_co=(0.0, 0.0, 0.0),
            plane_no=(0.0, 0.0, 1.0),
            clear_inner=True,
        )
        bm.to_mesh(me)
        bm.free()
        me.update()
    if material:
        obj.data.materials.append(material)
    link_to_collection(obj, collection)
    cleanup_mesh(obj)
    return obj


def add_torus(name, major_radius, minor_radius, location, material, collection, rotation=(0.0, 0.0, 0.0)):
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major_radius,
        minor_radius=minor_radius,
        major_segments=20,
        minor_segments=6,
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


def create_mesh_object(name, verts, faces, location, material, collection):
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    obj.location = location
    collection.objects.link(obj)
    if material:
        obj.data.materials.append(material)
    cleanup_mesh(obj)
    return obj


def star_prism_mesh(points=8, outer_r=22.0, inner_r=14.0, height=3.0):
    verts = []
    faces = []
    n = points * 2
    for z in (0.0, height):
        for i in range(n):
            ang = (math.pi * 2.0 * i) / n + math.pi / points
            r = outer_r if i % 2 == 0 else inner_r
            verts.append((r * math.cos(ang), r * math.sin(ang), z))
    for i in range(n):
        j = (i + 1) % n
        faces.append((i, j, j + n, i + n))
    faces.append(tuple(range(n - 1, -1, -1)))
    faces.append(tuple(range(n, 2 * n)))
    return verts, faces


def cross_boxes(name_prefix, arm_x, arm_y, height, material, collection, z_center=None):
    if z_center is None:
        z_center = height * 0.5
    a = add_cube(f"{name_prefix}_X", (arm_x, arm_y, height), (0.0, 0.0, z_center), material, collection)
    b = add_cube(f"{name_prefix}_Y", (arm_y, arm_x, height), (0.0, 0.0, z_center), material, collection)
    return a, b


def count_triangles():
    total = 0
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            continue
        me = obj.data
        total += sum(len(p.vertices) - 2 for p in me.polygons)
    return total


def bounds_of_scene():
    min_v = [1e9, 1e9, 1e9]
    max_v = [-1e9, -1e9, -1e9]
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            continue
        for corner in obj.bound_box:
            world = obj.matrix_world @ __import__("mathutils").Vector(corner)
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


def parent_to_root(objects, root_name="HQ_Root"):
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


def export_glb(school_id: str, meta: dict) -> dict:
    EXPORT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = EXPORT_DIR / f"{school_id}_hq.glb"
    tris = count_triangles()
    bounds = bounds_of_scene()

    for obj in bpy.context.scene.objects:
        if obj.type == "MESH":
            cleanup_mesh(obj)

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
    # Prefer Draco compression when available (keeps files < 200KB).
    for key, val in (
        ("export_draco_mesh_compression_enable", True),
        ("export_draco_mesh_compression_level", 6),
        ("export_draco_position_quantization", 12),
        ("export_draco_normal_quantization", 10),
        ("export_draco_texcoord_quantization", 10),
    ):
        export_kwargs[key] = val
    try:
        bpy.ops.export_scene.gltf(**export_kwargs)
    except TypeError:
        for key in list(export_kwargs):
            if key.startswith("export_draco"):
                export_kwargs.pop(key)
        bpy.ops.export_scene.gltf(**export_kwargs)

    size_bytes = out_path.stat().st_size if out_path.exists() else 0
    entry = {
        "id": school_id,
        "name": meta.get("name", school_id.upper()),
        "model": f"models/hqs/{school_id}_hq.glb",
        "concept": meta.get("concept", ""),
        "primary_colors": meta.get("primary_colors", []),
        "emission_colors": meta.get("emission_colors", []),
        "bounding_box_m": bounds["size_m"],
        "bounding_box_tiles": bounds["size_tiles"],
        "triangles": tris,
        "file_size_kb": round(size_bytes / 1024.0, 2),
        "tactical_role": meta.get("tactical_role", ""),
    }
    _update_manifest(entry)
    print(f"[HQ] {school_id}: tris={tris}, size={entry['file_size_kb']}KB, bbox={entry['bounding_box_m']}")
    return entry


def _update_manifest(entry: dict):
    data = {}
    if MANIFEST_PATH.exists():
        try:
            data = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
        except Exception:
            data = {}
    schools = data.get("schools", data if isinstance(data, dict) else {})
    if not isinstance(schools, dict):
        schools = {}
    # Keep previous format: flat map + generated meta
    flat = data.get("schools")
    if isinstance(flat, dict):
        flat[entry["id"]] = entry
        data["schools"] = flat
    else:
        # migrate flat keys
        legacy = {k: v for k, v in data.items() if isinstance(v, dict) and "model" in v}
        legacy[entry["id"]] = entry
        data = {
            "tile_meters": TILE_METERS,
            "aesthetic": "Stylized Sci-Fi RTS Architecture, Chunky Low-Poly, Flat Shading",
            "polygon_budget": "1500-3500 triangles",
            "pivot": [0.0, 0.0, 0.0],
            "schools": legacy,
        }
    if "tile_meters" not in data:
        data["tile_meters"] = TILE_METERS
    data["updated_at"] = __import__("datetime").datetime.utcnow().isoformat() + "Z"
    MANIFEST_PATH.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def finalize_and_export(school_id: str, objects, meta: dict) -> dict:
    root = parent_to_root(objects, root_name=f"{school_id.upper()}_Root")
    for obj in objects:
        cleanup_mesh(obj)
    return export_glb(school_id, meta)


def run_school_builder(build_fn, school_id: str, meta: dict):
    clear_scene()
    collection = ensure_collection(f"{school_id.upper()}_HQ_Collection")
    objects = build_fn(collection)
    if not isinstance(objects, (list, tuple)):
        objects = [objects]
    return finalize_and_export(school_id, list(objects), meta)
