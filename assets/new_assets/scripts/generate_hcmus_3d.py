"""
Script dựng mô hình 3D Isometric Low-Poly Nhà Điều hành – Giảng đường Trường Đại học Khoa học Tự nhiên ĐHQG-HCM (HCMUS Linh Trung)
Phong cách thiết kế chuẩn hóa:
- Góc nhìn: 3/4 Isometric perspective (Camera Ortho, góc nhìn xéo 45 độ từ trên cao nhìn xuống)
- Tòa nhà liền khối (Single cohesive modern institutional building):
  + Tỷ lệ dài x rộng x cao khoảng 10.2 x 4.2 x 4.8
  + Thân nhà màu trắng sáng ngà (#F8FAFC) & gờ phân tầng (#E2E8F0)
  + Dải cửa sổ kính chạy ngang màu xanh cyan pastel (#BAE6FD) chia bởi các cột nan bê tông trắng thanh mảnh
- 4 Góc mái (Corner Roof Caps):
  + Liền khối với thân nhà, nhô nhẹ 0.45m ở mép mái
  + 4 Khối chóp cụt 4 mặt thấp (Low-profile pyramid roof caps) màu xanh slate (#334155)
- Mái vòm trung tâm (Center Geodesic Dome):
  + Áp phẳng trên sân thượng (Flat-sitting faceted dome)
  + Kính màu cyan thanh lịch (#38BDF8) và khung thép xám (#475569), có cột kim thu lôi tinh tế
  + Tuyệt đối không có vòng xoay lơ lửng
- Mái đón sảnh khổng lồ (Cantilever Canopy) & Hàng cột (Colonnade):
  + Tấm mái chữ nhật lớn màu trắng sáng vươn dài ra phía trước, viền đèn LED vàng ấm (#FBBF24)
  + Đỡ bên dưới là hàng cột trụ tròn kim loại màu xám bạc (#94A3B8)
- Bậc thang sảnh: Hệ thống bậc thang uốn vòng cung hình cánh quạt (Fan-shaped staircase) tỏa rộng ra trước sân
- Bệ tiểu cảnh: Bệ lục giác nổi màu xám than (#1E293B) với viền phát sáng cyan (#38BDF8)
- Shading: Bắt buộc Flat Shading toàn bộ mesh
- Nền: Studio than chì đơn sắc (#2B2D31)
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

def create_mat(name, color_hex, roughness=0.35, metallic=0.0, emission_hex=None, emission_strength=0.0):
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

def create_truncated_pyramid_roof(name, location, base_w, base_d, top_w, top_d, height, mat):
    bm = bmesh.new()
    hw_b, hd_b = base_w / 2.0, base_d / 2.0
    hw_t, hd_t = top_w / 2.0, top_d / 2.0
    
    v0 = bm.verts.new((-hw_b, -hd_b, 0.0))
    v1 = bm.verts.new(( hw_b, -hd_b, 0.0))
    v2 = bm.verts.new(( hw_b,  hd_b, 0.0))
    v3 = bm.verts.new((-hw_b,  hd_b, 0.0))
    
    v4 = bm.verts.new((-hw_t, -hd_t, height))
    v5 = bm.verts.new(( hw_t, -hd_t, height))
    v6 = bm.verts.new(( hw_t,  hd_t, height))
    v7 = bm.verts.new((-hw_t,  hd_t, height))
    
    bm.faces.new([v3, v2, v1, v0])
    bm.faces.new([v4, v5, v6, v7])
    bm.faces.new([v0, v1, v5, v4])
    bm.faces.new([v1, v2, v6, v5])
    bm.faces.new([v2, v3, v7, v6])
    bm.faces.new([v3, v0, v4, v7])
    
    mesh = bpy.data.meshes.new(f"Mesh_{name}")
    bm.to_mesh(mesh)
    bm.free()
    
    obj = bpy.data.objects.new(name, mesh)
    obj.location = location
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    set_flat_shading(obj)
    return obj

def create_curved_fan_step(name, center_xy, r_in, r_out, z_bot, z_top, num_segs, mat):
    bm = bmesh.new()
    a_start = math.radians(205)
    a_end   = math.radians(335)
    
    v_b_in, v_b_out, v_t_in, v_t_out = [], [], [], []
    for i in range(num_segs + 1):
        ang = a_start + (a_end - a_start) * (i / float(num_segs))
        ca, sa = math.cos(ang), math.sin(ang)
        xi, yi = center_xy[0] + r_in * ca, center_xy[1] + r_in * sa
        xo, yo = center_xy[0] + r_out * ca, center_xy[1] + r_out * sa
        v_b_in.append(bm.verts.new((xi, yi, z_bot)))
        v_b_out.append(bm.verts.new((xo, yo, z_bot)))
        v_t_in.append(bm.verts.new((xi, yi, z_top)))
        v_t_out.append(bm.verts.new((xo, yo, z_top)))
        
    for i in range(num_segs):
        bm.faces.new([v_t_in[i], v_t_out[i], v_t_out[i+1], v_t_in[i+1]])
        bm.faces.new([v_b_out[i], v_b_out[i+1], v_t_out[i+1], v_t_out[i]])
        if i == 0:
            bm.faces.new([v_b_in[0], v_b_out[0], v_t_out[0], v_t_in[0]])
        if i == num_segs - 1:
            bm.faces.new([v_b_out[i+1], v_b_in[i+1], v_t_in[i+1], v_t_out[i+1]])
        
    mesh = bpy.data.meshes.new(f"Mesh_{name}")
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
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
    mat_white         = create_mat("Mat_White", "#F8FAFC", roughness=0.30, metallic=0.0)
    mat_light_gray    = create_mat("Mat_Light_Gray", "#E2E8F0", roughness=0.40, metallic=0.0)
    mat_slate_roof    = create_mat("Mat_Slate_Roof", "#334155", roughness=0.45, metallic=0.05)
    mat_slate_dark    = create_mat("Mat_Slate_Dark", "#1E293B", roughness=0.50, metallic=0.05)
    mat_glass_cyan    = create_mat("Mat_Glass_Cyan", "#BAE6FD", roughness=0.15, metallic=0.10)
    mat_glass_glow    = create_mat("Mat_Glass_Glow", "#7DD3FC", roughness=0.20, emission_hex="#7DD3FC", emission_strength=1.8)
    mat_dome_glass    = create_mat("Mat_Dome_Glass", "#38BDF8", roughness=0.20, emission_hex="#38BDF8", emission_strength=1.6)
    mat_dome_frame    = create_mat("Mat_Dome_Frame", "#475569", roughness=0.35, metallic=0.50)
    mat_colonnade     = create_mat("Mat_Colonnade", "#94A3B8", roughness=0.35, metallic=0.50)
    mat_canopy_trim   = create_mat("Mat_Canopy_Trim", "#FBBF24", roughness=0.20, emission_hex="#FBBF24", emission_strength=1.5)
    mat_steps         = create_mat("Mat_Steps", "#E2E8F0", roughness=0.55, metallic=0.0)
    mat_steps_sub     = create_mat("Mat_Steps_Sub", "#CBD5E1", roughness=0.60, metallic=0.0)
    mat_accent_green  = create_mat("Mat_Accent_Green", "#10B981", roughness=0.50, metallic=0.0)
    mat_base          = create_mat("Mat_Base", "#1E293B", roughness=0.85, metallic=0.05)
    mat_base_top      = create_mat("Mat_Base_Top", "#141C28", roughness=0.80, metallic=0.05)
    mat_cyan_glow     = create_mat("Mat_Cyan_Glow", "#38BDF8", roughness=0.20, emission_hex="#38BDF8", emission_strength=3.0)

    # 2. Hexagonal Pedestal
    bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=9.4, depth=0.50, location=(0, -0.20, -0.25))
    base_plinth = bpy.context.active_object
    base_plinth.data.materials.append(mat_base)
    set_flat_shading(base_plinth)

    bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=8.7, depth=0.25, location=(0, -0.20, 0.125))
    base_podium = bpy.context.active_object
    base_podium.data.materials.append(mat_base_top)
    set_flat_shading(base_podium)

    bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=8.2, depth=0.03, location=(0, -0.20, 0.26))
    base_ring = bpy.context.active_object
    base_ring.data.materials.append(mat_cyan_glow)
    set_flat_shading(base_ring)

    bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=8.0, depth=0.05, location=(0, -0.20, 0.28))
    base_island = bpy.context.active_object
    base_island.data.materials.append(mat_base)
    set_flat_shading(base_island)

    # 3. Single Cohesive Main Building Body
    b_width = 10.2
    b_depth = 4.2
    b_height = 4.8
    z_base = 0.30
    z_roof = z_base + b_height # 5.10
    center_y = 0.20

    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, center_y, z_base + b_height/2.0), scale=(b_width, b_depth, b_height))
    main_body = bpy.context.active_object
    main_body.name = "Building_Main_Body"
    main_body.data.materials.append(mat_white)
    set_flat_shading(main_body)

    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, center_y, z_base + 0.20), scale=(b_width + 0.10, b_depth + 0.10, 0.40))
    plinth = bpy.context.active_object
    plinth.data.materials.append(mat_slate_dark)
    set_flat_shading(plinth)

    # 4. Floors & Horizontal Cyan Glass Bands
    floor_height = b_height / 6.0
    num_floors = 6

    for f in range(1, num_floors + 1):
        fz = z_base + f * floor_height
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, center_y, fz), scale=(b_width + 0.15, b_depth + 0.15, 0.10))
        slab = bpy.context.active_object
        slab.data.materials.append(mat_light_gray)
        set_flat_shading(slab)

    front_y = center_y - b_depth/2.0 - 0.01
    back_y = center_y + b_depth/2.0 + 0.01

    for f in range(num_floors):
        fz_center = z_base + f * floor_height + floor_height/2.0
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, front_y - 0.01, fz_center), scale=(b_width - 0.40, 0.04, floor_height - 0.18))
        glass_front = bpy.context.active_object
        glass_front.data.materials.append(mat_glass_cyan)
        set_flat_shading(glass_front)

        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, back_y + 0.01, fz_center), scale=(b_width - 0.40, 0.04, floor_height - 0.18))
        glass_back = bpy.context.active_object
        glass_back.data.materials.append(mat_glass_cyan)
        set_flat_shading(glass_back)

    # Vertical Concrete Pillars / Fins
    num_cols = 15
    col_xs = [(-b_width/2.0 + 0.40) + i * ((b_width - 0.80) / (num_cols - 1)) for i in range(num_cols)]
    for idx, cx in enumerate(col_xs):
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(cx, front_y - 0.03, z_base + b_height/2.0), scale=(0.10, 0.10, b_height))
        col_fin = bpy.context.active_object
        col_fin.data.materials.append(mat_white)
        set_flat_shading(col_fin)

        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(cx, back_y + 0.03, z_base + b_height/2.0), scale=(0.10, 0.10, b_height))
        col_fin_b = bpy.context.active_object
        col_fin_b.data.materials.append(mat_white)
        set_flat_shading(col_fin_b)

    # Accent glow windows
    glow_windows = [
        (-3.6, front_y - 0.02, z_base + 1.5 * floor_height),
        (-1.5, front_y - 0.02, z_base + 2.5 * floor_height),
        ( 1.5, front_y - 0.02, z_base + 3.5 * floor_height),
        ( 3.6, front_y - 0.02, z_base + 4.5 * floor_height),
        (-2.2, front_y - 0.02, z_base + 4.5 * floor_height),
        ( 2.2, front_y - 0.02, z_base + 1.5 * floor_height)
    ]
    for idx, (gx, gy, gz) in enumerate(glow_windows):
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(gx, gy, gz), scale=(0.50, 0.05, floor_height - 0.22))
        gw = bpy.context.active_object
        gw.data.materials.append(mat_glass_glow)
        set_flat_shading(gw)

    # Side facades
    for side_x in [-b_width/2.0 - 0.01, b_width/2.0 + 0.01]:
        for f in range(num_floors):
            fz_center = z_base + f * floor_height + floor_height/2.0
            bpy.ops.mesh.primitive_cube_add(size=1.0, location=(side_x, center_y, fz_center), scale=(0.04, b_depth - 1.2, floor_height - 0.22))
            side_glass = bpy.context.active_object
            side_glass.data.materials.append(mat_glass_cyan)
            set_flat_shading(side_glass)

    # 5. 4 Low-profile Corner Roof Caps
    corner_w = 1.90
    corner_d = 1.60
    cx_offset = b_width/2.0 - corner_w/2.0
    cy_offset = b_depth/2.0 - corner_d/2.0
    corner_h = 0.45

    corners = [
        ("Corner_FL", -cx_offset, center_y - cy_offset),
        ("Corner_FR",  cx_offset, center_y - cy_offset),
        ("Corner_BL", -cx_offset, center_y + cy_offset),
        ("Corner_BR",  cx_offset, center_y + cy_offset)
    ]
    for c_name, c_x, c_y in corners:
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(c_x, c_y, z_roof + corner_h/2.0), scale=(corner_w, corner_d, corner_h))
        attic = bpy.context.active_object
        attic.data.materials.append(mat_white)
        set_flat_shading(attic)

        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(c_x, c_y, z_roof + corner_h + 0.04), scale=(corner_w + 0.15, corner_d + 0.15, 0.08))
        c_rim = bpy.context.active_object
        c_rim.data.materials.append(mat_light_gray)
        set_flat_shading(c_rim)

        create_truncated_pyramid_roof(
            f"{c_name}_Roof",
            (c_x, c_y, z_roof + corner_h + 0.08),
            base_w=corner_w + 0.15,
            base_d=corner_d + 0.15,
            top_w=0.40,
            top_d=0.35,
            height=0.65,
            mat=mat_slate_roof
        )

    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, center_y, z_roof + 0.15), scale=(b_width + 0.05, b_depth + 0.05, 0.30))
    parapet = bpy.context.active_object
    parapet.data.materials.append(mat_white)
    set_flat_shading(parapet)

    # 6. Flat-sitting Geodesic Rooftop Dome
    dome_base_z = z_roof + 0.05
    bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=1.75, depth=0.18, location=(0, center_y, dome_base_z + 0.09))
    dome_pad = bpy.context.active_object
    dome_pad.data.materials.append(mat_slate_roof)
    set_flat_shading(dome_pad)

    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=1.40, location=(0, center_y, dome_base_z + 0.18))
    dome_obj = bpy.context.active_object
    bm_d = bmesh.new()
    bm_d.from_mesh(dome_obj.data)
    verts_del = [v for v in bm_d.verts if v.co.z < -0.02]
    bmesh.ops.delete(bm_d, geom=verts_del, context='VERTS')
    bm_d.to_mesh(dome_obj.data)
    bm_d.free()
    dome_obj.data.materials.append(mat_dome_glass)
    set_flat_shading(dome_obj)

    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=1.42, location=(0, center_y, dome_base_z + 0.18))
    dome_wire = bpy.context.active_object
    wire_mod = dome_wire.modifiers.new(name="Wire", type='WIREFRAME')
    wire_mod.thickness = 0.04
    wire_mod.use_replace = True
    dome_wire.data.materials.append(mat_dome_frame)
    set_flat_shading(dome_wire)
    bm_dw = bmesh.new()
    bm_dw.from_mesh(dome_wire.data)
    verts_del_w = [v for v in bm_dw.verts if v.co.z < -0.02]
    bmesh.ops.delete(bm_dw, geom=verts_del_w, context='VERTS')
    bm_dw.to_mesh(dome_wire.data)
    bm_dw.free()

    bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=0.08, depth=0.50, location=(0, center_y, dome_base_z + 1.65))
    finial_post = bpy.context.active_object
    finial_post.data.materials.append(mat_colonnade)
    set_flat_shading(finial_post)

    # 7. Grand Cantilever Canopy & Colonnade
    canopy_w = 6.0
    canopy_d = 2.6
    canopy_y_start = center_y - b_depth/2.0 # -1.90
    canopy_y_center = canopy_y_start - canopy_d/2.0 # -3.20
    canopy_z = z_base + 1.85
    canopy_thick = 0.20

    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, canopy_y_center, canopy_z), scale=(canopy_w, canopy_d, canopy_thick))
    canopy = bpy.context.active_object
    canopy.data.materials.append(mat_white)
    set_flat_shading(canopy)

    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, canopy_y_center, canopy_z + canopy_thick/2.0 + 0.03), scale=(canopy_w + 0.12, canopy_d + 0.12, 0.06))
    canopy_rim = bpy.context.active_object
    canopy_rim.data.materials.append(mat_light_gray)
    set_flat_shading(canopy_rim)

    # LED Trim
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, canopy_y_center - canopy_d/2.0 - 0.02, canopy_z), scale=(canopy_w + 0.08, 0.05, 0.12))
    led_f = bpy.context.active_object
    led_f.data.materials.append(mat_canopy_trim)
    set_flat_shading(led_f)

    for s in [-1, 1]:
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(s * (canopy_w/2.0 + 0.02), canopy_y_center, canopy_z), scale=(0.05, canopy_d, 0.12))
        led_s = bpy.context.active_object
        led_s.data.materials.append(mat_canopy_trim)
        set_flat_shading(led_s)

    # Metallic Colonnade Pillars
    pillar_y = canopy_y_center - canopy_d/2.0 + 0.25 # -4.25
    pillar_h = canopy_z - canopy_thick/2.0 - z_base
    pillar_xs = [-2.4, -1.44, -0.48, 0.48, 1.44, 2.4]

    for idx, px in enumerate(pillar_xs):
        bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=0.11, depth=pillar_h, location=(px, pillar_y, z_base + pillar_h/2.0))
        p_obj = bpy.context.active_object
        p_obj.data.materials.append(mat_colonnade)
        set_flat_shading(p_obj)

        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(px, pillar_y, z_base + 0.05), scale=(0.30, 0.30, 0.10))
        p_base = bpy.context.active_object
        p_base.data.materials.append(mat_slate_dark)
        set_flat_shading(p_base)

    for s in [-1, 1]:
        bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=0.11, depth=pillar_h, location=(s * 2.4, canopy_y_start - 0.40, z_base + pillar_h/2.0))
        p_rear = bpy.context.active_object
        p_rear.data.materials.append(mat_colonnade)
        set_flat_shading(p_rear)

    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, canopy_y_center, z_base + 0.125), scale=(canopy_w + 0.40, canopy_d + 0.40, 0.25))
    deck = bpy.context.active_object
    deck.data.materials.append(mat_steps)
    set_flat_shading(deck)

    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, canopy_y_start - 0.02, z_base + 0.85), scale=(3.2, 0.08, 1.30))
    portal = bpy.context.active_object
    portal.data.materials.append(mat_glass_glow)
    set_flat_shading(portal)

    # 8. Fan-shaped Curved Steps
    step_center = (0.0, -2.40)
    step_levels = [
        (2.1, 2.7, 0.40, 0.52),
        (2.7, 3.3, 0.32, 0.40),
        (3.3, 3.9, 0.24, 0.32),
        (3.9, 4.5, 0.16, 0.24),
        (4.5, 5.0, 0.08, 0.16)
    ]
    for idx, (ri, ro, zb, zt) in enumerate(step_levels):
        s_mat = mat_steps if idx % 2 == 0 else mat_steps_sub
        create_curved_fan_step(f"Fan_Step_{idx}", step_center, ri, ro, zb, zt, num_segs=12, mat=s_mat)

    # Landscaping
    for idx, (px, py) in enumerate([(-3.8, -4.6), (3.8, -4.6), (-4.8, -3.2), (4.8, -3.2)]):
        bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=0.55, depth=0.20, location=(px, py, 0.35))
        pl = bpy.context.active_object
        pl.data.materials.append(mat_slate_dark)
        set_flat_shading(pl)

        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.48, location=(px, py, 0.65))
        sh = bpy.context.active_object
        sh.data.materials.append(mat_accent_green)
        set_flat_shading(sh)

    # 9. Camera Setup (3/4 Isometric Perspective)
    cam_data = bpy.data.cameras.new("Isometric_Camera_3_4")
    cam_data.type = 'ORTHO'
    cam_data.ortho_scale = 16.0
    cam_obj = bpy.data.objects.new("Isometric_Camera_3_4", cam_data)
    bpy.context.collection.objects.link(cam_obj)
    bpy.context.scene.camera = cam_obj

    target = Vector((0.0, -0.4, 2.5))
    dist = 24.0
    elev = math.radians(35.264)
    azim = math.radians(45.0)

    cam_x = target.x + dist * math.cos(azim) * math.cos(elev)
    cam_y = target.y - dist * math.sin(azim) * math.cos(elev)
    cam_z = target.z + dist * math.sin(elev)

    cam_obj.location = (cam_x, cam_y, cam_z)
    cam_obj.rotation_euler = (math.radians(54.73561), 0.0, math.radians(45.0))

    # 10. Lighting (Hard Directional Geometric Shadows)
    sun_key_data = bpy.data.lights.new(name="Sun_Key", type='SUN')
    sun_key_data.energy = 4.6
    sun_key_data.color = (1.0, 0.98, 0.95)
    sun_key_data.angle = 0.0
    sun_key_obj = bpy.data.objects.new("Sun_Key", sun_key_data)
    bpy.context.collection.objects.link(sun_key_obj)
    sun_key_obj.location = (-10, -14, 18)
    dir_key = Vector((0.65, 0.55, -0.90)).normalized()
    sun_key_obj.rotation_euler = dir_key.to_track_quat('-Z', 'Y').to_euler()

    sun_fill_data = bpy.data.lights.new(name="Sun_Fill", type='SUN')
    sun_fill_data.energy = 1.2
    sun_fill_data.color = (0.80, 0.88, 1.0)
    sun_fill_data.angle = 0.0
    sun_fill_obj = bpy.data.objects.new("Sun_Fill", sun_fill_data)
    bpy.context.collection.objects.link(sun_fill_obj)
    sun_fill_obj.location = (14, 10, 12)
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

    # 11. Enforce Flat Shading
    for obj in bpy.context.scene.objects:
        if obj.type == 'MESH':
            for poly in obj.data.polygons:
                poly.use_smooth = False
            obj.data.update()

if __name__ == "__main__":
    build_scene()
