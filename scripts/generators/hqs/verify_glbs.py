"""Verify each HQ GLB: object names, tri count, and unique preview filename."""
from __future__ import annotations

import math
from pathlib import Path
import mathutils

ROOT = Path(r"C:\Users\AMTECH\Desktop\Land-Rush-Prototype")
MODEL_DIR = ROOT / "public" / "models" / "hqs"
PREVIEW_DIR = MODEL_DIR / "previews"
PREVIEW_DIR.mkdir(parents=True, exist_ok=True)

SCHOOLS = [
    "hcmut", "hcmus", "hcmussh", "uit", "uel",
    "iu", "uhs", "ubb", "uflis", "ulpa",
]


def clear():
    import bpy
    bpy.ops.wm.read_factory_settings(use_empty=True)


def main():
    import bpy
    report = []
    for school in SCHOOLS:
        clear()
        glb = MODEL_DIR / f"{school}_hq.glb"
        if not glb.exists():
            report.append(f"{school}: MISSING FILE")
            continue
        bpy.ops.import_scene.gltf(filepath=str(glb))
        names = sorted({o.name.split(".")[0] for o in bpy.context.scene.objects if o.type == "MESH"})
        prefixes = sorted({n.split("_")[0] for n in names})
        tris = 0
        for obj in bpy.context.scene.objects:
            if obj.type == "MESH":
                tris += sum(len(p.vertices) - 2 for p in obj.data.polygons)

        # camera + light
        cam_data = bpy.data.cameras.new("Cam")
        cam = bpy.data.objects.new("Cam", cam_data)
        bpy.context.scene.collection.objects.link(cam)
        dist = 140.0
        elev = math.radians(30.0)
        azim = math.radians(40.0)
        target = mathutils.Vector((0.0, 0.0, 18.0))
        cam.location = (
            target.x + dist * math.cos(elev) * math.cos(azim),
            target.y + dist * math.cos(elev) * math.sin(elev) * 0 + dist * math.cos(elev) * math.sin(azim),
            target.z + dist * math.sin(elev),
        )
        direction = target - cam.location
        cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
        cam_data.lens = 38
        bpy.context.scene.camera = cam

        sun_data = bpy.data.lights.new("Sun", type="SUN")
        sun_data.energy = 4.0
        sun = bpy.data.objects.new("Sun", sun_data)
        sun.rotation_euler = (math.radians(50), math.radians(15), math.radians(30))
        bpy.context.scene.collection.objects.link(sun)

        world = bpy.data.worlds.new("W")
        world.use_nodes = True
        bpy.context.scene.world = world

        scene = bpy.context.scene
        scene.render.engine = "BLENDER_EEVEE"
        scene.render.resolution_x = 700
        scene.render.resolution_y = 700
        scene.render.image_settings.file_format = "PNG"
        out = PREVIEW_DIR / f"verify_{school}.png"
        scene.render.filepath = str(out)
        bpy.ops.render.render(write_still=True)
        report.append(f"{school}: tris={tris} prefixes={prefixes} sample={names[:8]} -> {out.name}")
    print("\n".join(report))


if __name__ == "__main__":
    main()
