"""Render isometric preview stills for all HQ GLB assets."""
from __future__ import annotations

import math
from pathlib import Path

import bpy

ROOT = Path(r"C:\Users\AMTECH\Desktop\Land-Rush-Prototype")
MODEL_DIR = ROOT / "public" / "models" / "hqs"
PREVIEW_DIR = ROOT / "public" / "models" / "hqs" / "previews"
PREVIEW_DIR.mkdir(parents=True, exist_ok=True)

SCHOOLS = [
    "hcmut", "hcmus", "hcmussh", "uit", "uel",
    "iu", "uhs", "ubb", "uflis", "ulpa",
]


def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def setup_camera_light():
    cam_data = bpy.data.cameras.new("PreviewCam")
    cam = bpy.data.objects.new("PreviewCam", cam_data)
    bpy.context.scene.collection.objects.link(cam)
    # Frame full HQ: aim mid-height, pull camera back for tall silhouettes
    dist = 130.0
    elev = math.radians(32.0)
    azim = math.radians(42.0)
    target = (0.0, 0.0, 20.0)
    cam.location = (
        target[0] + dist * math.cos(elev) * math.cos(azim),
        target[1] + dist * math.cos(elev) * math.sin(azim),
        target[2] + dist * math.sin(elev),
    )
    direction = (
        target[0] - cam.location[0],
        target[1] - cam.location[1],
        target[2] - cam.location[2],
    )
    length = math.sqrt(sum(v * v for v in direction)) or 1.0
    direction = tuple(v / length for v in direction)
    # track -Z toward target
    import mathutils
    rot_quat = mathutils.Vector(direction).to_track_quat("-Z", "Y")
    cam.rotation_euler = rot_quat.to_euler()
    cam_data.lens = 42
    bpy.context.scene.camera = cam

    sun_data = bpy.data.lights.new("PreviewSun", type="SUN")
    sun_data.energy = 4.2
    sun = bpy.data.objects.new("PreviewSun", sun_data)
    sun.rotation_euler = (math.radians(48), math.radians(8), math.radians(35))
    bpy.context.scene.collection.objects.link(sun)

    fill_data = bpy.data.lights.new("PreviewFill", type="SUN")
    fill_data.energy = 1.4
    fill = bpy.data.objects.new("PreviewFill", fill_data)
    fill.rotation_euler = (math.radians(70), math.radians(-20), math.radians(-120))
    bpy.context.scene.collection.objects.link(fill)

    world = bpy.data.worlds.new("PreviewWorld")
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs[0].default_value = (0.07, 0.08, 0.11, 1.0)
        bg.inputs[1].default_value = 0.75
    bpy.context.scene.world = world


def render_school(school: str):
    clear()
    glb = MODEL_DIR / f"{school}_hq.glb"
    if not glb.exists():
        print(f"MISSING {glb}")
        return
    bpy.ops.import_scene.gltf(filepath=str(glb))
    setup_camera_light()

    scene = bpy.context.scene
    try:
        scene.render.engine = "BLENDER_EEVEE"
    except Exception:
        scene.render.engine = "BLENDER_WORKBENCH"
    scene.render.resolution_x = 800
    scene.render.resolution_y = 800
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    out = PREVIEW_DIR / f"{school}_preview.png"
    scene.render.filepath = str(out)
    bpy.ops.render.render(write_still=True)
    print(f"RENDERED {out}")


def main():
    for school in SCHOOLS:
        try:
            render_school(school)
        except Exception as exc:
            print(f"FAIL {school}: {exc}")


if __name__ == "__main__":
    main()
