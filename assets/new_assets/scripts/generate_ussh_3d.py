"""
Script dựng mô hình 3D Isometric Low-Poly Tòa nhà Trường Đại học Khoa học Xã hội và Nhân văn ĐHQG-HCM (USSH Cơ sở Đinh Tiên Hoàng, Quận 1)
Tuân thủ chuẩn bản đặc tả hình học & style game asset diorama:
- Camera: Orthographic 3/4 Isometric (54.736°, 0°, 45°)
- Shading: Flat Shading toàn bộ mesh
- Background: Nền xám than đơn sắc (#2B2D31)
- Đế tiểu cảnh: Khối lục giác đen xám (#111827) với viền phát sáng xanh ngọc (#10B981)
- Khối thân chính (Main Monolith): Khối hộp chữ nhật liền mạch (tỷ lệ Dài : Rộng : Cao = 8 : 3.4 : 6)
  + Nửa dưới (Tầng 1-4): Màu xám than đậm (#374151 - Charcoal Slate) với các khe rãnh cửa sổ đứng hẹp xanh ngọc
  + Nửa trên (Tầng 5-8): Màu vàng kem ấm (#FDF6B2 - Pale Cream) với các ô cửa sổ đục lỗ vuông vức đều nhau
- Trục kính trung tâm (Central Emerald Glass Spine): Dải kính xanh ngọc lục bảo (#10B981) chạy dọc chính giữa mặt tiền từ tầng 1 lên sát mái, phát sáng nhẹ
- Hệ mái ngói phân tầng (Multi-tier Terracotta Hipped Roof):
  + Mái dốc 4 phía kiểu bánh ú (hipped roof) màu Cam gạch nung (#C2410C)
  + Tum tháp giật cấp ở giữa nóc lợp mái ngói cam cùng kiểu, có kim thu lôi trung tâm
- Sảnh đón & Cửa chính: Khối sảnh đón vát cạnh xám trung tính (#4B5563) với bậc cấp tối giản và cây xanh low-poly
"""

import bpy
from mathutils import Vector
import math
import bmesh
import os

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
    if obj and obj.type == 'MESH':
        for poly in obj.data.polygons:
            poly.use_smooth = False
        obj.data.update()

def create_mat(name, color_hex, roughness=0.45, metallic=0.0, emission_hex=None, emission_strength=0.0):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    bsdf = next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if bsdf:
        if "Base Color" in bsdf.inputs:
            bsdf.inputs["Base Color"].default_value = hex_to_linear(color_hex)
        if "Roughness" in bsdf.inputs:
            bsdf.inputs["Roughness"].default_value = roughness
        if "Metallic" in bsdf.inputs:
            bsdf.inputs["Metallic"].default_value = metallic
        
        em_color_socket = bsdf.inputs.get("Emission Color") or bsdf.inputs.get("Emission")
        if em_color_socket:
            if emission_hex and emission_strength > 0:
                em_color_socket.default_value = hex_to_linear(emission_hex)
            else:
                em_color_socket.default_value = (0, 0, 0, 1)
                
        em_strength_socket = bsdf.inputs.get("Emission Strength")
        if em_strength_socket:
            em_strength_socket.default_value = emission_strength if emission_hex else 0.0
    return mat

def create_hipped_roof(name, location, base_w, base_d, height, mat, ridge_ratio=0.55):
    bm = bmesh.new()
    hw_b, hd_b = base_w / 2.0, base_d / 2.0
    ridge_len = max(0.4, base_w * ridge_ratio)
    hw_r = ridge_len / 2.0
    
    v0 = bm.verts.new((-hw_b, -hd_b, 0.0))
    v1 = bm.verts.new(( hw_b, -hd_b, 0.0))
    v2 = bm.verts.new(( hw_b,  hd_b, 0.0))
    v3 = bm.verts.new((-hw_b,  hd_b, 0.0))
    
    vr_left  = bm.verts.new((-hw_r, 0.0, height))
    vr_right = bm.verts.new(( hw_r, 0.0, height))
    
    bm.faces.new([v3, v2, v1, v0])
    bm.faces.new([v0, v1, vr_right, vr_left])
    bm.faces.new([v2, v3, vr_left, vr_right])
    bm.faces.new([v3, v0, vr_left])
    bm.faces.new([v1, v2, vr_right])
    
    mesh = bpy.data.meshes.new(f"Mesh_{name}")
    bm.to_mesh(mesh)
    bm.free()
    
    obj = bpy.data.objects.new(name, mesh)
    obj.location = location
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    set_flat_shading(obj)
    return obj

def build_scene():
    # 0. Cleanup old objects
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
        bg.inputs["Strength"].default_value = 0.95

    # 1. Materials
    mat_charcoal     = create_mat("Mat_Charcoal", "#374151", roughness=0.55, metallic=0.05)
    mat_charcoal_dk  = create_mat("Mat_Charcoal_Dark", "#1F2937", roughness=0.60, metallic=0.05)
    mat_pale_cream   = create_mat("Mat_Pale_Cream", "#FDF6B2", roughness=0.35, metallic=0.0)
    mat_cream_accent = create_mat("Mat_Cream_Accent", "#FEF08A", roughness=0.30, metallic=0.0)
    mat_terracotta   = create_mat("Mat_Terracotta", "#C2410C", roughness=0.50, metallic=0.02)
    mat_terracotta_lt= create_mat("Mat_Terracotta_Light", "#EA580C", roughness=0.45, metallic=0.02)
    mat_emerald_glow = create_mat("Mat_Emerald_Glow", "#10B981", roughness=0.20, emission_hex="#10B981", emission_strength=2.0)
    mat_emerald_dim  = create_mat("Mat_Emerald_Dim", "#059669", roughness=0.25, emission_hex="#059669", emission_strength=1.2)
    mat_portal_gray  = create_mat("Mat_Portal_Gray", "#4B5563", roughness=0.40, metallic=0.20)
    mat_window_dark  = create_mat("Mat_Window_Dark", "#111827", roughness=0.20, metallic=0.30)
    mat_window_warm  = create_mat("Mat_Window_Warm", "#FEF08A", roughness=0.20, emission_hex="#FEF08A", emission_strength=1.5)
    mat_base         = create_mat("Mat_Base", "#111827", roughness=0.85, metallic=0.05)
    mat_base_top     = create_mat("Mat_Base_Top", "#1F2937", roughness=0.80, metallic=0.05)
    mat_green_glow   = create_mat("Mat_Green_Glow", "#10B981", roughness=0.20, emission_hex="#10B981", emission_strength=3.0)
    mat_steps        = create_mat("Mat_Steps", "#9CA3AF", roughness=0.50, metallic=0.0)
    mat_accent_tree  = create_mat("Mat_Accent_Tree", "#059669", roughness=0.50, metallic=0.0)

    # 2. Hexagonal Pedestal Tile (#111827)
    bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=8.6, depth=0.50, location=(0, -0.20, -0.25))
    base_plinth = bpy.context.active_object
    base_plinth.data.materials.append(mat_base)
    set_flat_shading(base_plinth)

    bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=7.9, depth=0.25, location=(0, -0.20, 0.125))
    base_podium = bpy.context.active_object
    base_podium.data.materials.append(mat_base_top)
    set_flat_shading(base_podium)

    bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=7.5, depth=0.03, location=(0, -0.20, 0.26))
    base_ring = bpy.context.active_object
    base_ring.data.materials.append(mat_green_glow)
    set_flat_shading(base_ring)

    bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=7.3, depth=0.05, location=(0, -0.20, 0.28))
    base_island = bpy.context.active_object
    base_island.data.materials.append(mat_base)
    set_flat_shading(base_island)

    # 3. Khối thân chính (Main Monolith) - Tỷ lệ 8 : 3.4 : 6
    b_w = 8.2
    b_d = 3.4
    b_h = 6.0
    z_base = 0.30
    center_y = 0.30
    front_y = center_y - b_d/2.0
    back_y  = center_y + b_d/2.0

    h_lower = 3.0
    h_upper = 3.0
    z_split = z_base + h_lower
    z_roof  = z_split + h_upper

    # Nửa dưới: Xám than đậm #374151
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, center_y, z_base + h_lower/2.0), scale=(b_w, b_d, h_lower))
    lower_body = bpy.context.active_object
    lower_body.name = "Building_Lower_Charcoal"
    lower_body.data.materials.append(mat_charcoal)
    set_flat_shading(lower_body)

    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, center_y, z_base + 0.18), scale=(b_w + 0.08, b_d + 0.08, 0.36))
    plinth_bot = bpy.context.active_object
    plinth_bot.data.materials.append(mat_charcoal_dk)
    set_flat_shading(plinth_bot)

    # Khe rãnh cửa sổ đứng hẹp xanh ngọc (tầng 1-4)
    slit_xs = [-3.4, -2.8, -2.2, -1.6, 1.6, 2.2, 2.8, 3.4]
    for sx in slit_xs:
        for fl in range(4):
            slit_z = z_base + 0.40 + fl * 0.68 + 0.30
            bpy.ops.mesh.primitive_cube_add(size=1.0, location=(sx, front_y - 0.02, slit_z), scale=(0.14, 0.05, 0.48))
            slit = bpy.context.active_object
            slit.data.materials.append(mat_emerald_dim)
            set_flat_shading(slit)

    # Nửa trên: Vàng kem ấm #FDF6B2
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, center_y, z_split + h_upper/2.0), scale=(b_w, b_d, h_upper))
    upper_body = bpy.context.active_object
    upper_body.name = "Building_Upper_Cream"
    upper_body.data.materials.append(mat_pale_cream)
    set_flat_shading(upper_body)

    # Gờ phân cách ngang giữa 2 tầng màu
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, center_y, z_split), scale=(b_w + 0.16, b_d + 0.16, 0.14))
    belt_band = bpy.context.active_object
    belt_band.data.materials.append(mat_pale_cream)
    set_flat_shading(belt_band)

    # Cửa sổ vuông vức đục lỗ nửa trên (tầng 5-8)
    win_xs = [-3.4, -2.7, -2.0, -1.3, 1.3, 2.0, 2.7, 3.4]
    for wx in win_xs:
        for fu in range(4):
            w_z = z_split + 0.38 + fu * 0.68
            bpy.ops.mesh.primitive_cube_add(size=1.0, location=(wx, front_y - 0.02, w_z), scale=(0.42, 0.06, 0.46))
            w_obj = bpy.context.active_object
            w_mat = mat_window_warm if (wx in [-2.7, 2.0] and fu in [1, 3]) else mat_window_dark
            w_obj.data.materials.append(w_mat)
            set_flat_shading(w_obj)

            bpy.ops.mesh.primitive_cube_add(size=1.0, location=(wx, front_y - 0.04, w_z + 0.25), scale=(0.48, 0.08, 0.06))
            w_hood = bpy.context.active_object
            w_hood.data.materials.append(mat_cream_accent)
            set_flat_shading(w_hood)

    # Cửa sổ hai bên hông
    for side_sign in [-1, 1]:
        side_x = side_sign * (b_w / 2.0 + 0.01)
        for fu in range(4):
            w_z = z_split + 0.38 + fu * 0.68
            for sy_offset in [-0.8, 0.8]:
                bpy.ops.mesh.primitive_cube_add(size=1.0, location=(side_x, center_y + sy_offset, w_z), scale=(0.04, 0.45, 0.44))
                sw = bpy.context.active_object
                sw.data.materials.append(mat_window_dark)
                set_flat_shading(sw)

    # Gờ diềm mái
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, center_y, z_roof + 0.06), scale=(b_w + 0.22, b_d + 0.22, 0.12))
    cornice = bpy.context.active_object
    cornice.data.materials.append(mat_pale_cream)
    set_flat_shading(cornice)

    # 4. Trục kính xuyên suốt trung tâm (Central Emerald Glass Spine)
    spine_w = 1.35
    spine_depth = 0.28
    spine_h = b_h + 0.10
    spine_y = front_y - spine_depth/2.0 + 0.02
    spine_z = z_base + spine_h/2.0

    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, spine_y, spine_z), scale=(spine_w, spine_depth, spine_h))
    spine_glass = bpy.context.active_object
    spine_glass.name = "Central_Emerald_Spine"
    spine_glass.data.materials.append(mat_emerald_glow)
    set_flat_shading(spine_glass)

    for s in [-1, 1]:
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(s * (spine_w/2.0), spine_y - spine_depth/2.0, spine_z), scale=(0.06, 0.06, spine_h))
        mul_v = bpy.context.active_object
        mul_v.data.materials.append(mat_charcoal_dk)
        set_flat_shading(mul_v)

    for fl in range(1, 8):
        fz = z_base + fl * 0.75
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, spine_y - spine_depth/2.0, fz), scale=(spine_w, 0.06, 0.06))
        mul_h = bpy.context.active_object
        mul_h.data.materials.append(mat_charcoal_dk)
        set_flat_shading(mul_h)

    # 5. Sảnh đón & Cửa chính
    canopy_w = 3.6
    canopy_d = 1.60
    canopy_h = 0.20
    canopy_z = z_base + 1.25
    canopy_y = front_y - canopy_d/2.0

    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, canopy_y, canopy_z), scale=(canopy_w, canopy_d, canopy_h))
    canopy_obj = bpy.context.active_object
    canopy_obj.name = "Entrance_Canopy"
    canopy_obj.data.materials.append(mat_portal_gray)
    set_flat_shading(canopy_obj)

    for s in [-1, 1]:
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(s * (canopy_w/2.0 - 0.20), canopy_y - canopy_d/2.0 + 0.15, z_base + (canopy_z - z_base)/2.0),
                                        scale=(0.18, 0.18, canopy_z - z_base))
        col = bpy.context.active_object
        col.data.materials.append(mat_charcoal_dk)
        set_flat_shading(col)

    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, front_y - 0.04, z_base + 0.50), scale=(1.80, 0.08, 0.85))
    portal_door = bpy.context.active_object
    portal_door.data.materials.append(mat_emerald_glow)
    set_flat_shading(portal_door)

    for step_idx in range(3):
        step_z_top = z_base + (3 - step_idx) * 0.08
        sw = canopy_w + 0.40 + step_idx * 0.40
        sd = 0.45 + step_idx * 0.25
        sy = canopy_y - canopy_d/2.0 - step_idx * 0.25
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, sy, (z_base + step_z_top)/2.0), scale=(sw, sd, step_z_top - z_base + 0.05))
        step_obj = bpy.context.active_object
        step_obj.data.materials.append(mat_steps)
        set_flat_shading(step_obj)

    # 6. Multi-tier Terracotta Hipped Roof (Mái ngói cam 2 tầng)
    roof_base_w = b_w + 0.60
    roof_base_d = b_d + 0.60
    roof_h = 1.15

    create_hipped_roof(
        "Main_Terracotta_Roof",
        (0, center_y, z_roof + 0.12),
        base_w=roof_base_w,
        base_d=roof_base_d,
        height=roof_h,
        mat=mat_terracotta,
        ridge_ratio=0.55
    )

    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, center_y, z_roof + 0.12 + roof_h + 0.04), scale=(roof_base_w * 0.55, 0.12, 0.08))
    ridge_cap = bpy.context.active_object
    ridge_cap.data.materials.append(mat_terracotta_lt)
    set_flat_shading(ridge_cap)

    pavilion_w = 2.40
    pavilion_d = 1.70
    pavilion_h = 0.65
    pavilion_z = z_roof + 0.12 + 0.70

    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, center_y, pavilion_z + pavilion_h/2.0), scale=(pavilion_w, pavilion_d, pavilion_h))
    pavilion_body = bpy.context.active_object
    pavilion_body.name = "Roof_Pavilion_Body"
    pavilion_body.data.materials.append(mat_pale_cream)
    set_flat_shading(pavilion_body)

    for s in [-1, 1]:
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(s * 0.60, center_y - pavilion_d/2.0 - 0.02, pavilion_z + pavilion_h/2.0), scale=(0.35, 0.05, 0.35))
        pv_win = bpy.context.active_object
        pv_win.data.materials.append(mat_window_dark)
        set_flat_shading(pv_win)

    pavilion_roof_h = 0.55
    create_hipped_roof(
        "Pavilion_Roof",
        (0, center_y, pavilion_z + pavilion_h),
        base_w=pavilion_w + 0.30,
        base_d=pavilion_d + 0.30,
        height=pavilion_roof_h,
        mat=mat_terracotta,
        ridge_ratio=0.40
    )

    bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=0.04, depth=0.75, location=(0, center_y, pavilion_z + pavilion_h + pavilion_roof_h + 0.375))
    finial_ussh = bpy.context.active_object
    finial_ussh.data.materials.append(mat_portal_gray)
    set_flat_shading(finial_ussh)

    # 7. Landscaping
    tree_coords = [(-3.4, -2.6), (3.4, -2.6), (-4.2, -1.8), (4.2, -1.8)]
    for idx, (tx, ty) in enumerate(tree_coords):
        bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=0.40, depth=0.15, location=(tx, ty, z_base + 0.075))
        tb = bpy.context.active_object
        tb.data.materials.append(mat_charcoal_dk)
        set_flat_shading(tb)

        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.38, location=(tx, ty, z_base + 0.40))
        tc = bpy.context.active_object
        tc.data.materials.append(mat_accent_tree)
        set_flat_shading(tc)

    # 8. Camera 3/4 Isometric Perspective (54.7°, 0°, 45°)
    cam_data = bpy.data.cameras.new("Isometric_Camera_USSH")
    cam_data.type = 'ORTHO'
    cam_data.ortho_scale = 18.5
    cam_obj = bpy.data.objects.new("Isometric_Camera_USSH", cam_data)
    bpy.context.collection.objects.link(cam_obj)
    bpy.context.scene.camera = cam_obj

    target = Vector((0.0, -0.30, 3.20))
    dist = 26.0
    elev = math.radians(35.264)
    azim = math.radians(45.0)

    cam_x = target.x + dist * math.cos(azim) * math.cos(elev)
    cam_y = target.y - dist * math.sin(azim) * math.cos(elev)
    cam_z = target.z + dist * math.sin(elev)

    cam_obj.location = (cam_x, cam_y, cam_z)
    cam_obj.rotation_euler = (math.radians(54.73561), 0.0, math.radians(45.0))

    # 9. Lighting
    sun_key_data = bpy.data.lights.new(name="Sun_Key", type='SUN')
    sun_key_data.energy = 4.5
    sun_key_data.color = (1.0, 0.98, 0.95)
    sun_key_data.angle = 0.0
    sun_key_obj = bpy.data.objects.new("Sun_Key", sun_key_data)
    bpy.context.collection.objects.link(sun_key_obj)
    sun_key_obj.location = (-12, -14, 20)
    dir_key = Vector((0.65, 0.55, -0.90)).normalized()
    sun_key_obj.rotation_euler = dir_key.to_track_quat('-Z', 'Y').to_euler()

    sun_fill_data = bpy.data.lights.new(name="Sun_Fill", type='SUN')
    sun_fill_data.energy = 1.15
    sun_fill_data.color = (0.80, 0.88, 1.0)
    sun_fill_data.angle = 0.0
    sun_fill_obj = bpy.data.objects.new("Sun_Fill", sun_fill_data)
    bpy.context.collection.objects.link(sun_fill_obj)
    sun_fill_obj.location = (14, 10, 14)
    dir_fill = Vector((-0.70, -0.45, -0.60)).normalized()
    sun_fill_obj.rotation_euler = dir_fill.to_track_quat('-Z', 'Y').to_euler()

    sun_rim_data = bpy.data.lights.new(name="Sun_Rim", type='SUN')
    sun_rim_data.energy = 0.50
    sun_rim_data.color = (0.95, 0.98, 1.0)
    sun_rim_data.angle = 0.0
    sun_rim_obj = bpy.data.objects.new("Sun_Rim", sun_rim_data)
    bpy.context.collection.objects.link(sun_rim_obj)
    dir_rim = Vector((-0.20, 0.70, -0.90)).normalized()
    sun_rim_obj.rotation_euler = dir_rim.to_track_quat('-Z', 'Y').to_euler()

    # 10. Enforce Flat Shading
    for obj in bpy.context.scene.objects:
        if obj.type == 'MESH':
            for poly in obj.data.polygons:
                poly.use_smooth = False
            obj.data.update()

if __name__ == "__main__":
    build_scene()
