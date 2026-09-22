"""
Script dựng mô hình 3D Isometric Low-Poly Tòa nhà Trụ sở Đại học (Lấy cảm hứng từ tòa H1 ĐHBK TP.HCM - HCMUT)
Tuân thủ chuẩn bản đặc tả hình học & style game asset diorama:
- Camera: Orthographic Isometric (35.264°, 45°)
- Shading: Flat Shading (không Smooth Shading)
- Nền: Studio tối (#2B2D31)
- Đế: Hexagonal Prism (#1E293B) với viền phát sáng cyan (#38BDF8)
- Tháp trung tâm: Bán trụ đa giác 6 mặt, đỉnh vát chóp cụt, cổng vòm phát sáng, xanh Bách Khoa (#0055A5)
- Bậc thang sảnh trước: Kim tự tháp cụt (stepped wedges)
- Hai cánh đối xứng: Các tầng rãnh ngang trắng kem (#F8FAFC) xen kẽ kính xanh đậm và cửa sổ phát sáng (Cyan & Vàng ấm)
- Ánh sáng: Nguồn sáng chính chếch 45 độ từ phía trên bên trái, bóng đổ sắc nét (hard shadows)
"""

import bpy
from mathutils import Vector
import math
import bmesh

def hex_to_linear(hex_str, alpha=1.0):
    hex_str = hex_str.lstrip('#')
    def srgb_to_linear(c):
        c = c / 255.0
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    r = srgb_to_linear(int(hex_str[0:2], 16))
    g = srgb_to_linear(int(hex_str[2:4], 16))
    b = srgb_to_linear(int(hex_str[4:6], 16))
    return (r, g, b, alpha)

def set_flat_shading(obj):
    if obj.type == 'MESH':
        for poly in obj.data.polygons:
            poly.use_smooth = False
        obj.data.update()

def create_mat(name, color_hex, roughness=0.45, metallic=0.0, emission_hex=None, emission_strength=0.0):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = hex_to_linear(color_hex)
        bsdf.inputs["Roughness"].default_value = roughness
        bsdf.inputs["Metallic"].default_value = metallic
        if emission_hex and emission_strength > 0:
            bsdf.inputs["Emission Color"].default_value = hex_to_linear(emission_hex)
            bsdf.inputs["Emission Strength"].default_value = emission_strength
        else:
            bsdf.inputs["Emission Color"].default_value = (0, 0, 0, 1)
            bsdf.inputs["Emission Strength"].default_value = 0.0
    return mat

def build_scene():
    # 0. Cleanup
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for m in list(bpy.data.materials):
        bpy.data.materials.remove(m)
    for m in list(bpy.data.meshes):
        bpy.data.meshes.remove(m)
    for c in list(bpy.data.cameras):
        bpy.data.cameras.remove(c)
    for l in list(bpy.data.lights):
        bpy.data.lights.remove(l)

    # World Background (#2B2D31)
    if not bpy.context.scene.world:
        bpy.context.scene.world = bpy.data.worlds.new("World")
    world = bpy.context.scene.world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs["Color"].default_value = hex_to_linear("#2B2D31")
        bg.inputs["Strength"].default_value = 0.90

    # Materials
    mat_base         = create_mat("Mat_Base", "#1E293B", roughness=0.85, metallic=0.05)
    mat_base_top     = create_mat("Mat_Base_Top", "#141C28", roughness=0.80, metallic=0.05)
    mat_blue_primary = create_mat("Mat_Blue_Primary", "#0055A5", roughness=0.35, metallic=0.08)
    mat_blue_dark    = create_mat("Mat_Blue_Dark", "#061A30", roughness=0.20, metallic=0.20)
    mat_white        = create_mat("Mat_White", "#F8FAFC", roughness=0.30, metallic=0.0)
    mat_cyan_glow    = create_mat("Mat_Cyan_Glow", "#38BDF8", roughness=0.20, emission_hex="#38BDF8", emission_strength=3.2)
    mat_warm_glow    = create_mat("Mat_Warm_Glow", "#FBBF24", roughness=0.20, emission_hex="#FBBF24", emission_strength=3.2)
    mat_steps        = create_mat("Mat_Steps", "#E2E8F0", roughness=0.55, metallic=0.0)
    mat_steps_dark   = create_mat("Mat_Steps_Dark", "#94A3B8", roughness=0.60, metallic=0.0)
    mat_trim         = create_mat("Mat_Trim", "#0284C7", roughness=0.35, metallic=0.10)
    mat_accent_green = create_mat("Mat_Accent_Green", "#10B981", roughness=0.50, metallic=0.0)

    # 1. Base Pedestal (Hexagonal Prism)
    bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=8.2, depth=0.50, location=(0, 0, -0.25))
    base_plinth = bpy.context.active_object
    base_plinth.data.materials.append(mat_base)
    set_flat_shading(base_plinth)

    bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=7.5, depth=0.25, location=(0, 0, 0.125))
    base_podium = bpy.context.active_object
    base_podium.data.materials.append(mat_base_top)
    set_flat_shading(base_podium)

    bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=7.1, depth=0.03, location=(0, 0, 0.26))
    base_ring = bpy.context.active_object
    base_ring.data.materials.append(mat_cyan_glow)
    set_flat_shading(base_ring)

    bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=6.9, depth=0.05, location=(0, 0, 0.28))
    base_island = bpy.context.active_object
    base_island.data.materials.append(mat_base)
    set_flat_shading(base_island)

    # 2. Center Core Tower (6-faceted curved tower)
    bm = bmesh.new()
    num_facets = 6
    rx, ry, y_back = 2.15, 1.95, 1.05
    profile_pts = []
    for i in range(num_facets + 1):
        ang = math.pi * (1.0 - i / float(num_facets))
        profile_pts.append((rx * math.cos(ang), -ry * math.sin(ang)))
    profile_pts.append((rx, y_back))
    profile_pts.append((-rx, y_back))

    z_base, z_shoulder, z_top = 0.30, 6.90, 8.10
    v_base = [bm.verts.new((x, y, z_base)) for (x, y) in profile_pts]
    v_shoulder = [bm.verts.new((x, y, z_shoulder)) for (x, y) in profile_pts]

    taper, y_shift = 0.68, 0.35
    v_top = [bm.verts.new((x * taper, (y - y_shift) * taper, z_top)) for (x, y) in profile_pts]

    bm.faces.new(reversed(v_base))
    N = len(profile_pts)
    for i in range(N):
        i_next = (i + 1) % N
        bm.faces.new([v_base[i], v_base[i_next], v_shoulder[i_next], v_shoulder[i]])
        bm.faces.new([v_shoulder[i], v_shoulder[i_next], v_top[i_next], v_top[i]])
    bm.faces.new(v_top)

    mesh_core = bpy.data.meshes.new("Mesh_Center_Core")
    bm.to_mesh(mesh_core)
    bm.free()

    core_obj = bpy.data.objects.new("Center_Core_Tower", mesh_core)
    bpy.context.collection.objects.link(core_obj)
    core_obj.data.materials.append(mat_blue_primary)
    set_flat_shading(core_obj)

    # Center Belt Lines
    for idx, bz in enumerate([1.38, 2.46, 3.54, 4.62, 5.70, 6.80]):
        bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=2.22, depth=0.14, location=(0, -0.65, bz))
        belt = bpy.context.active_object
        belt.scale = (1.0, 0.62, 1.0)
        belt.data.materials.append(mat_white)
        set_flat_shading(belt)

    # Top Crown Crest & Emissive Logo
    bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=1.10, depth=0.20, location=(0, -y_shift * taper, z_top + 0.10))
    crest_base = bpy.context.active_object
    crest_base.data.materials.append(mat_white)
    set_flat_shading(crest_base)

    bpy.ops.mesh.primitive_torus_add(major_radius=0.78, minor_radius=0.14, major_segments=6, minor_segments=4,
                                     location=(0, -y_shift * taper, z_top + 0.95), rotation=(math.radians(90), 0, 0))
    crest_arch = bpy.context.active_object
    crest_arch.data.materials.append(mat_cyan_glow)
    set_flat_shading(crest_arch)

    bpy.ops.mesh.primitive_cylinder_add(vertices=4, radius=0.38, depth=0.14, location=(0, -y_shift * taper, z_top + 0.95),
                                        rotation=(0, math.radians(45), 0))
    crest_core = bpy.context.active_object
    crest_core.data.materials.append(mat_warm_glow)
    set_flat_shading(crest_core)

    bpy.ops.mesh.primitive_cone_add(vertices=6, radius1=0.18, depth=0.85, location=(0, -y_shift * taper, z_top + 1.90))
    crest_spire = bpy.context.active_object
    crest_spire.data.materials.append(mat_cyan_glow)
    set_flat_shading(crest_spire)

    # Grand Portal
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, -2.02, 1.20), scale=(2.0, 0.45, 1.80))
    portal_frame = bpy.context.active_object
    portal_frame.data.materials.append(mat_white)
    set_flat_shading(portal_frame)

    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, -2.06, 1.10), scale=(1.40, 0.40, 1.45))
    portal_interior = bpy.context.active_object
    portal_interior.data.materials.append(mat_warm_glow)
    set_flat_shading(portal_interior)

    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, -2.10, 1.05), scale=(0.14, 0.45, 1.45))
    portal_mullion = bpy.context.active_object
    portal_mullion.data.materials.append(mat_blue_dark)
    set_flat_shading(portal_mullion)

    # Vertical Spine Facade
    for idx, sz in enumerate([2.46, 3.20, 3.94, 4.68, 5.42, 6.16]):
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, -1.98, sz), scale=(1.10, 0.12, 0.62))
        s_bg = bpy.context.active_object
        s_bg.data.materials.append(mat_blue_dark)
        set_flat_shading(s_bg)

        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, -2.02, sz), scale=(0.96, 0.08, 0.54))
        pane = bpy.context.active_object
        pane.data.materials.append(mat_cyan_glow if idx % 2 == 0 else mat_warm_glow)
        set_flat_shading(pane)

        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, -2.04, sz - 0.31), scale=(1.25, 0.18, 0.10))
        div = bpy.context.active_object
        div.data.materials.append(mat_white)
        set_flat_shading(div)

    # 3. Grand Stairs
    stair_data = [
        (-2.45, -2.05, 2.60, 1.10),
        (-2.95, -2.45, 3.10, 0.94),
        (-3.45, -2.95, 3.60, 0.78),
        (-3.95, -3.45, 4.10, 0.62),
        (-4.45, -3.95, 4.60, 0.46),
        (-5.05, -4.45, 5.20, 0.34),
    ]
    for idx, (y0, y1, w, tz) in enumerate(stair_data):
        yc, dy = (y0 + y1) / 2.0, abs(y1 - y0)
        h = tz - z_base
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, yc, z_base + h / 2.0), scale=(w, dy, h))
        st = bpy.context.active_object
        st.data.materials.append(mat_steps)
        set_flat_shading(st)

        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, y0 + 0.04, tz + 0.005), scale=(w * 0.98, 0.08, 0.01))
        runner = bpy.context.active_object
        runner.data.materials.append(mat_steps_dark)
        set_flat_shading(runner)

    for sign in [-1, 1]:
        for idx, (y0, y1, w, tz) in enumerate(stair_data):
            yc, dy = (y0 + y1) / 2.0, abs(y1 - y0)
            wall_w = 0.35
            xc = sign * (w / 2.0 + wall_w / 2.0)
            wall_h = (tz - z_base) + 0.22
            bpy.ops.mesh.primitive_cube_add(size=1.0, location=(xc, yc, z_base + wall_h / 2.0), scale=(wall_w, dy, wall_h))
            w_obj = bpy.context.active_object
            w_obj.data.materials.append(mat_blue_primary)
            set_flat_shading(w_obj)

            bpy.ops.mesh.primitive_cube_add(size=1.0, location=(xc, yc, z_base + wall_h + 0.03), scale=(wall_w + 0.06, dy, 0.06))
            c_obj = bpy.context.active_object
            c_obj.data.materials.append(mat_white)
            set_flat_shading(c_obj)

        bx, by = sign * (5.20 / 2.0 + 0.35 / 2.0), -5.30
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(bx, by, z_base + 0.35), scale=(0.42, 0.42, 0.70))
        b_obj = bpy.context.active_object
        b_obj.data.materials.append(mat_blue_primary)
        set_flat_shading(b_obj)

        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(bx, by, z_base + 0.72), scale=(0.46, 0.46, 0.08))
        col = bpy.context.active_object
        col.data.materials.append(mat_white)
        set_flat_shading(col)

        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(bx, by, z_base + 0.84), scale=(0.30, 0.30, 0.16))
        l_obj = bpy.context.active_object
        l_obj.data.materials.append(mat_cyan_glow)
        set_flat_shading(l_obj)

        px, py = sign * (5.20 / 2.0 + 1.20), -4.60
        bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=0.55, depth=0.35, location=(px, py, z_base + 0.175))
        p_obj = bpy.context.active_object
        p_obj.data.materials.append(mat_white)
        set_flat_shading(p_obj)

        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.45, location=(px, py, z_base + 0.55))
        shrub = bpy.context.active_object
        shrub.scale = (1.0, 1.0, 0.8)
        shrub.data.materials.append(mat_accent_green)
        set_flat_shading(shrub)

    # 4. Flanking Wings
    floor_h, num_f_inner, num_f_outer = 1.08, 4, 3
    inner_w, outer_w = 3.10, 1.40
    inner_depth, outer_depth, wing_y = 2.20, 1.90, -0.15

    for sign in [-1, 1]:
        inner_xc = sign * (2.15 + inner_w / 2.0)
        outer_xc = sign * (2.15 + inner_w + outer_w / 2.0)

        inner_h = num_f_inner * floor_h
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(inner_xc, wing_y, z_base + inner_h / 2.0), scale=(inner_w, inner_depth, inner_h))
        inner_m = bpy.context.active_object
        inner_m.data.materials.append(mat_blue_primary)
        set_flat_shading(inner_m)

        outer_h = num_f_outer * floor_h
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(outer_xc, wing_y, z_base + outer_h / 2.0), scale=(outer_w, outer_depth, outer_h))
        outer_m = bpy.context.active_object
        outer_m.data.materials.append(mat_blue_primary)
        set_flat_shading(outer_m)

        # Slabs
        for f in range(1, num_f_inner + 1):
            bpy.ops.mesh.primitive_cube_add(size=1.0, location=(inner_xc, wing_y, z_base + f * floor_h), scale=(inner_w + 0.04, inner_depth + 0.36, 0.16))
            sl = bpy.context.active_object
            sl.data.materials.append(mat_white)
            set_flat_shading(sl)

        for f in range(1, num_f_outer + 1):
            bpy.ops.mesh.primitive_cube_add(size=1.0, location=(outer_xc, wing_y, z_base + f * floor_h), scale=(outer_w + 0.04, outer_depth + 0.36, 0.16))
            sl = bpy.context.active_object
            sl.data.materials.append(mat_white)
            set_flat_shading(sl)

        # Windows
        fy_in, fy_out = wing_y - inner_depth / 2.0, wing_y - outer_depth / 2.0
        b_in = 4
        bw_in = inner_w / float(b_in)
        for f in range(num_f_inner):
            wz, wh = z_base + f * floor_h + floor_h * 0.54, 0.56
            bpy.ops.mesh.primitive_cube_add(size=1.0, location=(inner_xc, fy_in - 0.02, wz), scale=(inner_w - 0.06, 0.08, wh))
            rib = bpy.context.active_object
            rib.data.materials.append(mat_blue_dark)
            set_flat_shading(rib)

            for b in range(b_in):
                bx = (inner_xc - sign * inner_w / 2.0) + sign * (b * bw_in + bw_in / 2.0)
                bpy.ops.mesh.primitive_cube_add(size=1.0, location=(bx, fy_in - 0.05, wz), scale=(bw_in * 0.70, 0.06, wh * 0.78))
                pane = bpy.context.active_object
                pat = (f * 2 + b + (1 if sign > 0 else 0)) % 5
                p_mat = mat_cyan_glow if pat in (0, 2) else (mat_warm_glow if pat == 1 else (mat_white if pat == 3 else mat_trim))
                pane.data.materials.append(p_mat)
                set_flat_shading(pane)

                if b < b_in - 1:
                    fin_x = bx + sign * (bw_in / 2.0)
                    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(fin_x, fy_in - 0.06, wz), scale=(0.10, 0.12, wh * 1.05))
                    fin = bpy.context.active_object
                    fin.data.materials.append(mat_white)
                    set_flat_shading(fin)

        b_out = 2
        bw_out = outer_w / float(b_out)
        for f in range(num_f_outer):
            wz, wh = z_base + f * floor_h + floor_h * 0.54, 0.56
            bpy.ops.mesh.primitive_cube_add(size=1.0, location=(outer_xc, fy_out - 0.02, wz), scale=(outer_w - 0.06, 0.08, wh))
            rib = bpy.context.active_object
            rib.data.materials.append(mat_blue_dark)
            set_flat_shading(rib)

            for b in range(b_out):
                bx = (outer_xc - sign * outer_w / 2.0) + sign * (b * bw_out + bw_out / 2.0)
                bpy.ops.mesh.primitive_cube_add(size=1.0, location=(bx, fy_out - 0.05, wz), scale=(bw_out * 0.70, 0.06, wh * 0.78))
                pane = bpy.context.active_object
                pat = (f + b + 1) % 3
                p_mat = mat_cyan_glow if pat == 0 else (mat_warm_glow if pat == 1 else mat_white)
                pane.data.materials.append(p_mat)
                set_flat_shading(pane)

        # Side Windows
        side_x = sign * (2.15 + inner_w + outer_w)
        for f in range(num_f_outer):
            wz, wh = z_base + f * floor_h + floor_h * 0.54, 0.54
            for sy_idx, sy in enumerate([wing_y - 0.40, wing_y + 0.40]):
                bpy.ops.mesh.primitive_cube_add(size=1.0, location=(side_x + sign * 0.03, sy, wz), scale=(0.06, 0.60, wh * 0.75))
                spane = bpy.context.active_object
                spane.data.materials.append(mat_cyan_glow if (f + sy_idx) % 2 == 0 else mat_warm_glow)
                set_flat_shading(spane)

        # Rooftop
        rz_inner = z_base + inner_h
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(inner_xc, wing_y, rz_inner + 0.14), scale=(inner_w, inner_depth, 0.28))
        pi = bpy.context.active_object
        pi.data.materials.append(mat_blue_primary)
        set_flat_shading(pi)

        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(inner_xc, wing_y, rz_inner + 0.30), scale=(inner_w + 0.08, inner_depth + 0.08, 0.06))
        pic = bpy.context.active_object
        pic.data.materials.append(mat_white)
        set_flat_shading(pic)

        hx = inner_xc - sign * 0.45
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(hx, wing_y + 0.25, rz_inner + 0.42), scale=(0.95, 0.75, 0.48))
        hvac = bpy.context.active_object
        hvac.data.materials.append(mat_white)
        set_flat_shading(hvac)

        bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=0.25, depth=0.08, location=(hx, wing_y + 0.25, rz_inner + 0.68))
        fan = bpy.context.active_object
        fan.data.materials.append(mat_blue_dark)
        set_flat_shading(fan)

        mx = inner_xc + sign * 0.90
        bpy.ops.mesh.primitive_cylinder_add(vertices=4, radius=0.06, depth=1.35, location=(mx, wing_y - 0.30, rz_inner + 0.80))
        mast = bpy.context.active_object
        mast.data.materials.append(mat_trim)
        set_flat_shading(mast)

        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(mx, wing_y - 0.30, rz_inner + 1.50), scale=(0.16, 0.16, 0.16))
        beacon = bpy.context.active_object
        beacon.data.materials.append(mat_cyan_glow)
        set_flat_shading(beacon)

        rz_outer = z_base + outer_h
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(outer_xc, wing_y, rz_outer + 0.14), scale=(outer_w, outer_depth, 0.28))
        po = bpy.context.active_object
        po.data.materials.append(mat_white)
        set_flat_shading(po)

        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(outer_xc, wing_y, rz_outer + 0.38), scale=(0.85, 0.95, 0.08), rotation=(0, sign * math.radians(18), 0))
        sol = bpy.context.active_object
        sol.data.materials.append(mat_blue_dark)
        set_flat_shading(sol)

    # 5. Camera (Orthographic Isometric 35.264°, 45°)
    cam_data = bpy.data.cameras.new("Isometric_Camera")
    cam_data.type = 'ORTHO'
    cam_data.ortho_scale = 16.6
    cam_obj = bpy.data.objects.new("Isometric_Camera", cam_data)
    bpy.context.collection.objects.link(cam_obj)
    bpy.context.scene.camera = cam_obj

    tx, ty, tz = 0.0, -0.60, 3.20
    dist = 26.0
    comp = dist / math.sqrt(3.0)
    cam_obj.location = (tx + comp, ty - comp, tz + comp)
    cam_obj.rotation_euler = (math.radians(54.73561), 0.0, math.radians(45.0))

    # 6. Lighting (Hard Directional Shadows 45° Top-Left)
    sun_key_data = bpy.data.lights.new(name="Sun_Key_TopLeft", type='SUN')
    sun_key_data.energy = 4.4
    sun_key_data.color = (1.0, 0.98, 0.94)
    sun_key_data.angle = 0.0
    sun_key_obj = bpy.data.objects.new("Sun_Key_TopLeft", sun_key_data)
    bpy.context.collection.objects.link(sun_key_obj)
    sun_key_obj.location = (-12, -12, 20)
    dir_key = Vector((0.70, 0.50, -0.95)).normalized()
    sun_key_obj.rotation_euler = dir_key.to_track_quat('-Z', 'Y').to_euler()

    sun_fill_data = bpy.data.lights.new(name="Sun_Fill_Cool", type='SUN')
    sun_fill_data.energy = 0.95
    sun_fill_data.color = (0.75, 0.85, 1.0)
    sun_fill_data.angle = 0.0
    sun_fill_obj = bpy.data.objects.new("Sun_Fill_Cool", sun_fill_data)
    bpy.context.collection.objects.link(sun_fill_obj)
    sun_fill_obj.location = (16, 12, 14)
    dir_fill = Vector((-0.70, -0.40, -0.65)).normalized()
    sun_fill_obj.rotation_euler = dir_fill.to_track_quat('-Z', 'Y').to_euler()

    sun_rim_data = bpy.data.lights.new(name="Sun_Rim_Top", type='SUN')
    sun_rim_data.energy = 0.45
    sun_rim_data.color = (0.92, 0.96, 1.0)
    sun_rim_data.angle = 0.0
    sun_rim_obj = bpy.data.objects.new("Sun_Rim_Top", sun_rim_data)
    bpy.context.collection.objects.link(sun_rim_obj)
    dir_rim = Vector((-0.15, 0.70, -0.95)).normalized()
    sun_rim_obj.rotation_euler = dir_rim.to_track_quat('-Z', 'Y').to_euler()

    # Enforce Flat Shading
    for obj in bpy.context.scene.objects:
        if obj.type == 'MESH':
            for poly in obj.data.polygons:
                poly.use_smooth = False
            obj.data.update()

if __name__ == "__main__":
    build_scene()
