"""
Script dựng mô hình 3D Isometric Low-Poly Tòa nhà A1 – Trụ sở chính Trường Đại học Kinh tế – Luật ĐHQG-HCM (UEL A1 Building)
Tuân thủ chuẩn bản đặc tả hình học & style game asset diorama:
- Camera: Orthographic 3/4 Isometric (54.736°, 0°, 45°)
- Shading: Flat Shading toàn bộ mesh
- Background: Nền xám than đơn sắc (#2B2D31)
- Đế tiểu cảnh: Khối lục giác mỏng màu xám đen (#0F172A) giật cấp với viền LED màu xanh dương UEL (#0284C7)
- Cấu trúc hình khối (Tỷ lệ Dài : Rộng : Cao tổng thể = 12 : 3 : 6):
  1. Khối thân chính & Hai cánh đối xứng (Main Body & Symmetrical Wings): Khối nhà dài màu trắng sáng (#F8FAFC), hai đầu hồi bo tròn đa giác (low-poly bevel cylinder), cửa sổ chữ nhật màu xanh cyan nhạt (#7DD3FC) chia nhịp đều đặn
  2. Khối kính cong trung tâm (Center Curved Glass Atrium): Khối bán nguyệt đa giác nhô hẳn ra phía trước, kính màu xanh ngọc lục bảo (Emerald Green #059669 / #10B981) phát sáng nhẹ với các nan kim loại sọc đứng
  3. Biển hiệu & Khối chắn đỉnh (Crown Signage Box): Khối chắn hộp màu trắng trên nóc atrium với dải màu xanh và chữ nổi 3D "UEL"
  4. Đường viền mái (Roof Fascia & Curved Eaves): Dải viền màu xanh dương đậm (#0284C7) chạy suốt mép mái, hai đầu hồi mép cong có mái che hình cánh cung mỏng vươn ra (curved eaves)
  5. Sảnh đón tầng trệt (Podium Entrance): Mái canopy phẳng vươn ra trước với 4 cột chống và bậc tam cấp rộng đón vào sảnh
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

def build_scene():
    # 0. Dọn sạch scene cũ
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

    # 1. Khởi tạo bảng vật liệu chuẩn UEL
    mat_white_facade = create_mat("Mat_White_Facade", "#F8FAFC", roughness=0.45, metallic=0.02)
    mat_emerald_glass = create_mat("Mat_Emerald_Glass", "#059669", roughness=0.15, metallic=0.10, emission_hex="#10B981", emission_strength=1.8)
    mat_window_cyan  = create_mat("Mat_Window_Cyan",  "#7DD3FC", roughness=0.20, metallic=0.15, emission_hex="#38BDF8", emission_strength=0.45)
    mat_window_frame = create_mat("Mat_Window_Frame", "#64748B", roughness=0.35, metallic=0.20)
    mat_blue_uel     = create_mat("Mat_Blue_UEL",     "#0284C7", roughness=0.30, metallic=0.10, emission_hex="#0284C7", emission_strength=0.8)
    mat_metal_silver = create_mat("Mat_Metal_Silver", "#CBD5E1", roughness=0.25, metallic=0.45)
    mat_mullion_dark = create_mat("Mat_Mullion_Dark", "#1E293B", roughness=0.35, metallic=0.30)
    mat_roof_slate   = create_mat("Mat_Roof_Slate",   "#334155", roughness=0.65, metallic=0.08)
    mat_hvac_gray    = create_mat("Mat_HVAC_Gray",    "#64748B", roughness=0.40, metallic=0.35)
    mat_steps_gray   = create_mat("Mat_Steps_Gray",   "#475569", roughness=0.60, metallic=0.05)
    mat_base_dark    = create_mat("Mat_Base_Dark",    "#0F172A", roughness=0.85, metallic=0.05)
    mat_base_plaza   = create_mat("Mat_Base_Plaza",   "#1E293B", roughness=0.80, metallic=0.05)
    mat_blue_glow    = create_mat("Mat_Blue_Glow",    "#0284C7", roughness=0.20, emission_hex="#38BDF8", emission_strength=3.0)
    mat_tree_green   = create_mat("Mat_Tree_Green",   "#10B981", roughness=0.55, metallic=0.0)

    # 2. Đế tiểu cảnh lục giác (Hexagonal Diorama Base)
    # Tòa nhà ngang 13m -> Đĩa lục giác bán kính R = 8.6m bao trọn toàn bộ công trình
    z_base = 0.30
    base_center = (0.0, -0.25)

    bpy.ops.mesh.primitive_cylinder_add(
        vertices=6,
        radius=8.8,
        depth=0.50,
        location=(base_center[0], base_center[1], -0.25)
    )
    base_plinth = bpy.context.active_object
    base_plinth.rotation_euler = (0, 0, math.radians(30.0))
    base_plinth.data.materials.append(mat_base_dark)
    set_flat_shading(base_plinth)

    bpy.ops.mesh.primitive_cylinder_add(
        vertices=6,
        radius=8.2,
        depth=0.25,
        location=(base_center[0], base_center[1], 0.125)
    )
    base_podium = bpy.context.active_object
    base_podium.rotation_euler = (0, 0, math.radians(30.0))
    base_podium.data.materials.append(mat_base_plaza)
    set_flat_shading(base_podium)

    # Viền LED trang trí màu xanh UEL quanh bệ
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=6,
        radius=7.8,
        depth=0.03,
        location=(base_center[0], base_center[1], 0.26)
    )
    base_ring = bpy.context.active_object
    base_ring.rotation_euler = (0, 0, math.radians(30.0))
    base_ring.data.materials.append(mat_blue_glow)
    set_flat_shading(base_ring)

    # Mặt sân trên cùng (Island deck)
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=6,
        radius=7.6,
        depth=0.05,
        location=(base_center[0], base_center[1], 0.28)
    )
    base_island = bpy.context.active_object
    base_island.rotation_euler = (0, 0, math.radians(30.0))
    base_island.data.materials.append(mat_base_dark)
    set_flat_shading(base_island)

    # Lối đi lát đá dẫn vào sảnh trước (Entrance Walkway Plaza)
    bpy.ops.mesh.primitive_cube_add(
        size=1.0,
        location=(0.0, -4.5, z_base + 0.01)
    )
    walkway = bpy.context.active_object
    walkway.scale = (4.8, 2.2, 0.02)
    walkway.data.materials.append(mat_base_plaza)
    set_flat_shading(walkway)

    # 3. Khối thân chính & Hai cánh đối xứng (Tỷ lệ Dài : Rộng : Cao = 13.0 : 3.0 : 6.0)
    # Tòa nhà đối xứng qua trục Y: Chiều rộng X từ -6.5 đến +6.5; Chiều sâu Y từ -1.3 đến +1.7; Chiều cao Z từ z_base đến z_base + 6.0
    # Hai đầu hồi ở mép ngoài (X = -6.5 và X = +6.5) được bo tròn cong bán nguyệt đa giác (low-poly bevel cylinder)
    
    bm = bmesh.new()
    profile_pts = []
    # Đoạn tường sau (X từ -5.2 đến +5.2, Y = 1.7)
    profile_pts.append((-5.2, 1.7))
    profile_pts.append((5.2, 1.7))
    
    # Đầu hồi phải cong bán nguyệt đa giác (R=1.5, tâm=(5.2, 0.2))
    num_segs = 6
    for i in range(1, num_segs):
        ang = math.pi / 2.0 - (i / num_segs) * math.pi
        px = 5.2 + 1.5 * math.cos(ang)
        py = 0.2 + 1.5 * math.sin(ang)
        profile_pts.append((px, py))
    profile_pts.append((5.2, -1.3))
    
    # Đoạn tường trước (X từ +5.2 về -5.2, Y = -1.3)
    profile_pts.append((-5.2, -1.3))
    
    # Đầu hồi trái cong bán nguyệt đa giác (R=1.5, tâm=(-5.2, 0.2))
    for i in range(1, num_segs):
        ang = -math.pi / 2.0 - (i / num_segs) * math.pi
        px = -5.2 + 1.5 * math.cos(ang)
        py = 0.2 + 1.5 * math.sin(ang)
        profile_pts.append((px, py))

    # Tạo các vertex đáy trong BMesh
    bottom_verts = [bm.verts.new(Vector((p[0], p[1], z_base))) for p in profile_pts]
    bm.verts.ensure_lookup_table()
    bottom_face = bm.faces.new(bottom_verts)

    # Extrude lên Z = 6.0m
    geom = bmesh.ops.extrude_face_region(bm, geom=[bottom_face])
    ext_verts = [ele for ele in geom['geom'] if isinstance(ele, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, vec=Vector((0, 0, 6.0)), verts=ext_verts)
    bm.normal_update()

    mesh_body = bpy.data.meshes.new("UEL_Main_Body")
    bm.to_mesh(mesh_body)
    bm.free()

    obj_body = bpy.data.objects.new("UEL_Main_Body", mesh_body)
    bpy.context.collection.objects.link(obj_body)
    obj_body.data.materials.append(mat_white_facade)
    set_flat_shading(obj_body)

    # 4. Cửa sổ hai cánh đối xứng (Symmetrical Window Arrays)
    # Hai cánh: Cánh trái X từ -5.0 đến -2.2; Cánh phải X từ +2.2 đến +5.0
    # 5 tầng cửa sổ (Z = z_base + [1.2, 2.2, 3.2, 4.2, 5.2])
    wing_x_offsets = [
        # Cánh trái
        -5.0, -4.3, -3.6, -2.9, -2.2,
        # Cánh phải
        2.2, 2.9, 3.6, 4.3, 5.0
    ]
    window_floors_z = [z_base + 1.20, z_base + 2.20, z_base + 3.20, z_base + 4.20, z_base + 5.20]
    win_w = 0.46
    win_h = 0.62
    win_d = 0.06

    for z in window_floors_z:
        for x in wing_x_offsets:
            # Khung viền cửa sổ mặt trước
            bpy.ops.mesh.primitive_cube_add(
                size=1.0,
                location=(x, -1.31, z)
            )
            w_frame = bpy.context.active_object
            w_frame.scale = (win_w + 0.08, win_d + 0.02, win_h + 0.08)
            w_frame.data.materials.append(mat_window_frame)
            set_flat_shading(w_frame)

            # Mặt kính cửa sổ mặt trước
            bpy.ops.mesh.primitive_cube_add(
                size=1.0,
                location=(x, -1.33, z)
            )
            win = bpy.context.active_object
            win.scale = (win_w, win_d, win_h)
            win.data.materials.append(mat_window_cyan)
            set_flat_shading(win)

            # Mặt sau (Y = 1.7)
            bpy.ops.mesh.primitive_cube_add(
                size=1.0,
                location=(x, 1.72, z)
            )
            win_back = bpy.context.active_object
            win_back.scale = (win_w, win_d, win_h)
            win_back.data.materials.append(mat_window_cyan)
            set_flat_shading(win_back)

    # Các dải phân vị ngang (Spandrel Trims) giữa các tầng cánh nhà
    for z in [z_base + 1.70, z_base + 2.70, z_base + 3.70, z_base + 4.70]:
        for wing_x, wing_len in [(-3.6, 3.4), (3.6, 3.4)]:
            bpy.ops.mesh.primitive_cube_add(
                size=1.0,
                location=(wing_x, -1.33, z)
            )
            band = bpy.context.active_object
            band.scale = (wing_len, 0.04, 0.08)
            band.data.materials.append(mat_metal_silver)
            set_flat_shading(band)

    # 5. Khối kính cong bán nguyệt trung tâm (Central Curved Emerald Glass Atrium)
    # Điểm nhấn chính diện: bán nguyệt nhô hẳn ra phía trước từ Y = -1.3 ra tới Y = -3.2 (bán kính R = 2.10m, tâm tại (0.0, -1.15))
    # Chiều cao Z từ z_base đến z_base + 6.25m
    atrium_segments = 12
    atrium_r = 2.12
    atrium_cx = 0.0
    atrium_cy = -1.15
    atrium_z_min = z_base
    atrium_z_max = z_base + 6.25

    bm_atrium = bmesh.new()
    curve_pts = []
    for i in range(atrium_segments + 1):
        theta = (i / atrium_segments) * math.pi
        px = atrium_cx - atrium_r * math.cos(theta)
        py = atrium_cy - atrium_r * math.sin(theta)
        curve_pts.append((px, py))

    center_bottom = bm_atrium.verts.new(Vector((atrium_cx, atrium_cy, atrium_z_min)))
    center_top = bm_atrium.verts.new(Vector((atrium_cx, atrium_cy, atrium_z_max)))
    
    verts_bottom = [bm_atrium.verts.new(Vector((p[0], p[1], atrium_z_min))) for p in curve_pts]
    verts_top = [bm_atrium.verts.new(Vector((p[0], p[1], atrium_z_max))) for p in curve_pts]

    for i in range(atrium_segments):
        v1 = verts_bottom[i]
        v2 = verts_bottom[i+1]
        v3 = verts_top[i+1]
        v4 = verts_top[i]
        bm_atrium.faces.new([v1, v2, v3, v4])

    for i in range(atrium_segments):
        bm_atrium.faces.new([center_bottom, verts_bottom[i+1], verts_bottom[i]])
        bm_atrium.faces.new([center_top, verts_top[i], verts_top[i+1]])

    mesh_atrium = bpy.data.meshes.new("UEL_Central_Atrium_Glass")
    bm_atrium.to_mesh(mesh_atrium)
    bm_atrium.free()

    obj_atrium = bpy.data.objects.new("UEL_Central_Atrium_Glass", mesh_atrium)
    bpy.context.collection.objects.link(obj_atrium)
    obj_atrium.data.materials.append(mat_emerald_glass)
    set_flat_shading(obj_atrium)

    # Nan kim loại sọc đứng (Vertical Mullions) dọc theo các góc facet của khối cong
    for p in curve_pts:
        bpy.ops.mesh.primitive_cube_add(
            size=1.0,
            location=(p[0], p[1] - 0.02, (atrium_z_min + atrium_z_max) / 2.0)
        )
        mul = bpy.context.active_object
        mul.scale = (0.06, 0.06, atrium_z_max - atrium_z_min)
        mul.data.materials.append(mat_mullion_dark)
        set_flat_shading(mul)

    # Các nan ngang (Horizontal Transoms) phân tầng trên khối kính cong
    for floor_idx in range(1, 6):
        fz = z_base + floor_idx * 1.05
        bm_ring = bmesh.new()
        r_inner = atrium_r - 0.02
        r_outer = atrium_r + 0.05
        for i in range(atrium_segments):
            t1 = (i / atrium_segments) * math.pi
            t2 = ((i + 1) / atrium_segments) * math.pi
            
            p1_out = Vector((atrium_cx - r_outer * math.cos(t1), atrium_cy - r_outer * math.sin(t1), fz - 0.035))
            p2_out = Vector((atrium_cx - r_outer * math.cos(t2), atrium_cy - r_outer * math.sin(t2), fz - 0.035))
            
            v_a = bm_ring.verts.new(p1_out)
            v_b = bm_ring.verts.new(p2_out)
            v_c = bm_ring.verts.new(p2_out + Vector((0, 0, 0.08)))
            v_d = bm_ring.verts.new(p1_out + Vector((0, 0, 0.08)))
            bm_ring.faces.new([v_a, v_b, v_c, v_d])
        mesh_ring = bpy.data.meshes.new(f"UEL_Transom_{floor_idx}")
        bm_ring.to_mesh(mesh_ring)
        bm_ring.free()
        obj_ring = bpy.data.objects.new(f"UEL_Transom_{floor_idx}", mesh_ring)
        bpy.context.collection.objects.link(obj_ring)
        obj_ring.data.materials.append(mat_metal_silver)
        set_flat_shading(obj_ring)

    # 6. Khối chắn hộp đỉnh & Biển tên trường UEL (Crown Signage Box)
    # Tọa lạc trên đỉnh khối kính bán nguyệt: Z từ z_base + 6.25m lên z_base + 7.20m
    z_crown = z_base + 6.725
    bpy.ops.mesh.primitive_cube_add(
        size=1.0,
        location=(0.0, -2.15, z_crown)
    )
    crown_box = bpy.context.active_object
    crown_box.name = "UEL_Crown_Box"
    crown_box.scale = (4.4, 2.1, 0.95)
    crown_box.data.materials.append(mat_white_facade)
    set_flat_shading(crown_box)

    # Dải pano biển hiệu màu xanh dương đậm (#0284C7) ở mặt trước hộp chắn
    bpy.ops.mesh.primitive_cube_add(
        size=1.0,
        location=(0.0, -3.22, z_crown)
    )
    sign_panel = bpy.context.active_object
    sign_panel.name = "UEL_Signage_Panel"
    sign_panel.scale = (3.8, 0.05, 0.65)
    sign_panel.data.materials.append(mat_blue_uel)
    set_flat_shading(sign_panel)

    # Chữ nổi 3D "U E L" màu trắng sáng trên nền xanh (#F8FAFC, Emission nhẹ)
    mat_letter_glow = create_mat("Mat_Letter_Glow", "#FFFFFF", roughness=0.20, emission_hex="#FFFFFF", emission_strength=1.5)

    # Chữ U
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(-1.05, -3.28, z_crown))
    u_l = bpy.context.active_object
    u_l.scale = (0.13, 0.07, 0.46)
    u_l.data.materials.append(mat_letter_glow)
    set_flat_shading(u_l)

    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(-0.55, -3.28, z_crown))
    u_r = bpy.context.active_object
    u_r.scale = (0.13, 0.07, 0.46)
    u_r.data.materials.append(mat_letter_glow)
    set_flat_shading(u_r)

    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(-0.80, -3.28, z_crown - 0.18))
    u_b = bpy.context.active_object
    u_b.scale = (0.60, 0.07, 0.12)
    u_b.data.materials.append(mat_letter_glow)
    set_flat_shading(u_b)

    # Chữ E
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(-0.16, -3.28, z_crown))
    e_c = bpy.context.active_object
    e_c.scale = (0.13, 0.07, 0.46)
    e_c.data.materials.append(mat_letter_glow)
    set_flat_shading(e_c)

    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.08, -3.28, z_crown + 0.17))
    e_t = bpy.context.active_object
    e_t.scale = (0.38, 0.07, 0.12)
    e_t.data.materials.append(mat_letter_glow)
    set_flat_shading(e_t)

    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.04, -3.28, z_crown))
    e_m = bpy.context.active_object
    e_m.scale = (0.30, 0.07, 0.10)
    e_m.data.materials.append(mat_letter_glow)
    set_flat_shading(e_m)

    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.08, -3.28, z_crown - 0.18))
    e_b = bpy.context.active_object
    e_b.scale = (0.38, 0.07, 0.12)
    e_b.data.materials.append(mat_letter_glow)
    set_flat_shading(e_b)

    # Chữ L
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.60, -3.28, z_crown))
    l_c = bpy.context.active_object
    l_c.scale = (0.13, 0.07, 0.46)
    l_c.data.materials.append(mat_letter_glow)
    set_flat_shading(l_c)

    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.80, -3.28, z_crown - 0.18))
    l_b = bpy.context.active_object
    l_b.scale = (0.42, 0.07, 0.12)
    l_b.data.materials.append(mat_letter_glow)
    set_flat_shading(l_b)

    # 7. Đường viền mái & Mái che vòm cánh cung hai đầu hồi (Roof Fascia & Curved Eaves)
    # Dải viền màu Xanh dương đậm (#0284C7) chạy suốt mép mái ở Z = z_base + 6.0m đến 6.24m
    z_fascia = z_base + 6.12
    for wing_x, w_size in [(-3.6, 3.4), (3.6, 3.4)]:
        bpy.ops.mesh.primitive_cube_add(
            size=1.0,
            location=(wing_x, -1.34, z_fascia)
        )
        fascia_front = bpy.context.active_object
        fascia_front.scale = (w_size, 0.08, 0.24)
        fascia_front.data.materials.append(mat_blue_uel)
        set_flat_shading(fascia_front)

    # Đường viền mặt sau suốt chiều dài
    bpy.ops.mesh.primitive_cube_add(
        size=1.0,
        location=(0.0, 1.74, z_fascia)
    )
    fascia_back = bpy.context.active_object
    fascia_back.scale = (10.6, 0.08, 0.24)
    fascia_back.data.materials.append(mat_blue_uel)
    set_flat_shading(fascia_back)

    # Mái che hình cánh cung mỏng vươn ra ở 2 đầu hồi bo cong (Curved Eaves at Outer Corners)
    for side_x, angle_offset in [(5.2, 0), (-5.2, math.pi)]:
        bm_eave = bmesh.new()
        r_eave_in = 1.45
        r_eave_out = 1.90
        z_eave = z_base + 6.12
        eave_h = 0.16
        for i in range(num_segs):
            a1 = math.pi / 2.0 - (i / num_segs) * math.pi + angle_offset
            a2 = math.pi / 2.0 - ((i + 1) / num_segs) * math.pi + angle_offset
            
            p1_in = Vector((side_x + r_eave_in * math.cos(a1), 0.2 + r_eave_in * math.sin(a1), z_eave))
            p2_in = Vector((side_x + r_eave_in * math.cos(a2), 0.2 + r_eave_in * math.sin(a2), z_eave))
            p1_out = Vector((side_x + r_eave_out * math.cos(a1), 0.2 + r_eave_out * math.sin(a1), z_eave))
            p2_out = Vector((side_x + r_eave_out * math.cos(a2), 0.2 + r_eave_out * math.sin(a2), z_eave))
            
            v1 = bm_eave.verts.new(p1_out)
            v2 = bm_eave.verts.new(p2_out)
            v3 = bm_eave.verts.new(p2_out + Vector((0, 0, eave_h)))
            v4 = bm_eave.verts.new(p1_out + Vector((0, 0, eave_h)))
            bm_eave.faces.new([v1, v2, v3, v4])
            # Mặt trên
            v_in_top1 = bm_eave.verts.new(p1_in + Vector((0, 0, eave_h)))
            v_in_top2 = bm_eave.verts.new(p2_in + Vector((0, 0, eave_h)))
            bm_eave.faces.new([v4, v3, v_in_top2, v_in_top1])

        mesh_eave = bpy.data.meshes.new(f"UEL_Curved_Eave_{side_x}")
        bm_eave.to_mesh(mesh_eave)
        bm_eave.free()
        obj_eave = bpy.data.objects.new(f"UEL_Curved_Eave_{side_x}", mesh_eave)
        bpy.context.collection.objects.link(obj_eave)
        obj_eave.data.materials.append(mat_blue_uel)
        set_flat_shading(obj_eave)

    # 8. Tầng mái kỹ thuật (Rooftop Technical Penthouse & HVAC)
    bpy.ops.mesh.primitive_cube_add(
        size=1.0,
        location=(0.0, 0.2, z_base + 6.04)
    )
    roof_deck = bpy.context.active_object
    roof_deck.scale = (10.4, 2.9, 0.08)
    roof_deck.data.materials.append(mat_roof_slate)
    set_flat_shading(roof_deck)

    # 2 khối tum thang đối xứng (Stairwell Penthouses)
    for px in [-3.5, 3.5]:
        bpy.ops.mesh.primitive_cube_add(
            size=1.0,
            location=(px, 0.3, z_base + 6.50)
        )
        pent = bpy.context.active_object
        pent.scale = (1.4, 1.2, 0.90)
        pent.data.materials.append(mat_white_facade)
        set_flat_shading(pent)

    # 4 cụm máy điều hòa / làm mát HVAC low-poly
    hvac_coords = [(-4.6, 0.3), (-2.0, 0.3), (2.0, 0.3), (4.6, 0.3)]
    for hx, hy in hvac_coords:
        bpy.ops.mesh.primitive_cube_add(
            size=1.0,
            location=(hx, hy, z_base + 6.32)
        )
        hvac = bpy.context.active_object
        hvac.scale = (0.75, 0.65, 0.45)
        hvac.data.materials.append(mat_hvac_gray)
        set_flat_shading(hvac)

    # Cột ăng-ten kỹ thuật trên nóc tum thang
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=6,
        radius=0.04,
        depth=1.1,
        location=(-3.5, 0.3, z_base + 7.45)
    )
    antenna = bpy.context.active_object
    antenna.data.materials.append(mat_metal_silver)
    set_flat_shading(antenna)

    # 9. Sảnh đón tầng trệt (Podium Entrance)
    # Mái canopy phẳng vươn ra che trên bậc thềm: X từ -2.4 đến +2.4, Y từ -1.5 đến -3.85, Z = z_base + 1.35m
    z_canopy = z_base + 1.35
    bpy.ops.mesh.primitive_cube_add(
        size=1.0,
        location=(0.0, -2.65, z_canopy)
    )
    canopy = bpy.context.active_object
    canopy.name = "UEL_Entrance_Canopy"
    canopy.scale = (4.8, 2.4, 0.14)
    canopy.data.materials.append(mat_white_facade)
    set_flat_shading(canopy)

    # Viền xanh dương ở mép trước mái sảnh
    bpy.ops.mesh.primitive_cube_add(
        size=1.0,
        location=(0.0, -3.86, z_canopy)
    )
    canopy_edge = bpy.context.active_object
    canopy_edge.scale = (4.84, 0.06, 0.16)
    canopy_edge.data.materials.append(mat_blue_uel)
    set_flat_shading(canopy_edge)

    # 4 cột đỡ sảnh đón màu kim loại bạc
    col_x = [-2.1, -0.7, 0.7, 2.1]
    for cx in col_x:
        bpy.ops.mesh.primitive_cylinder_add(
            vertices=8,
            radius=0.10,
            depth=1.35,
            location=(cx, -3.65, z_base + 0.675)
        )
        col = bpy.context.active_object
        col.data.materials.append(mat_metal_silver)
        set_flat_shading(col)

    # Vách kính đại sảnh tầng trệt
    bpy.ops.mesh.primitive_cube_add(
        size=1.0,
        location=(0.0, -2.60, z_base + 0.62)
    )
    ent_glass = bpy.context.active_object
    ent_glass.scale = (4.4, 1.9, 1.15)
    ent_glass.data.materials.append(mat_emerald_glass)
    set_flat_shading(ent_glass)

    # 10. Tam cấp tối giản dẫn vào sảnh (Entrance Grand Steps)
    step_data = [
        # (width, depth, z_center, y_center)
        (5.2, 0.8, z_base + 0.05, -4.05),
        (5.6, 0.8, z_base - 0.05, -4.30),
        (6.0, 0.8, z_base - 0.15, -4.55),
    ]
    for w, d, z, y in step_data:
        bpy.ops.mesh.primitive_cube_add(
            size=1.0,
            location=(0.0, y, z)
        )
        st = bpy.context.active_object
        st.scale = (w, d, 0.10)
        st.data.materials.append(mat_steps_gray)
        set_flat_shading(st)

    # Cột cờ trung tâm trước sân sảnh
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=6,
        radius=0.25,
        depth=0.12,
        location=(0.0, -5.5, z_base + 0.06)
    )
    flag_base = bpy.context.active_object
    flag_base.data.materials.append(mat_steps_gray)
    set_flat_shading(flag_base)

    bpy.ops.mesh.primitive_cylinder_add(
        vertices=6,
        radius=0.035,
        depth=2.2,
        location=(0.0, -5.5, z_base + 1.18)
    )
    flag_pole = bpy.context.active_object
    flag_pole.data.materials.append(mat_metal_silver)
    set_flat_shading(flag_pole)

    # Lá cờ đỏ sao vàng / biểu trưng cách điệu low-poly
    mat_flag_red = create_mat("Mat_Flag_Red", "#DC2626", roughness=0.40, emission_hex="#EF4444", emission_strength=0.8)
    bpy.ops.mesh.primitive_cube_add(
        size=1.0,
        location=(0.28, -5.5, z_base + 1.95)
    )
    flag = bpy.context.active_object
    flag.scale = (0.50, 0.03, 0.32)
    flag.data.materials.append(mat_flag_red)
    set_flat_shading(flag)

    # 11. Tiểu cảnh cây xanh low-poly đối xứng 2 bên sảnh (Landscaping)
    planter_coords = [(-4.6, -3.6), (4.6, -3.6), (-5.6, -2.5), (5.6, -2.5)]
    for px, py in planter_coords:
        bpy.ops.mesh.primitive_cylinder_add(
            vertices=6,
            radius=0.65,
            depth=0.22,
            location=(px, py, z_base + 0.11)
        )
        pb = bpy.context.active_object
        pb.data.materials.append(mat_mullion_dark)
        set_flat_shading(pb)

        bpy.ops.mesh.primitive_ico_sphere_add(
            subdivisions=1,
            radius=0.55,
            location=(px, py, z_base + 0.58)
        )
        tr = bpy.context.active_object
        tr.data.materials.append(mat_tree_green)
        set_flat_shading(tr)

    # 12. Thiết lập Camera Orthographic 3/4 Isometric chuẩn
    cam_data = bpy.data.cameras.new("Isometric_Camera_UEL")
    cam_data.type = 'ORTHO'
    cam_data.ortho_scale = 22.5
    cam_obj = bpy.data.objects.new("Isometric_Camera_UEL", cam_data)
    bpy.context.collection.objects.link(cam_obj)
    bpy.context.scene.camera = cam_obj

    # Điểm nhìn trung tâm (Target)
    target = Vector((0.0, -0.6, z_base + 3.0))
    dist = 26.0
    elev = math.radians(35.264)
    azim = math.radians(45.0)

    cam_x = target.x + dist * math.cos(azim) * math.cos(elev)
    cam_y = target.y - dist * math.sin(azim) * math.cos(elev)
    cam_z = target.z + dist * math.sin(elev)

    cam_obj.location = (cam_x, cam_y, cam_z)
    cam_obj.rotation_euler = (math.radians(54.73561), 0.0, math.radians(45.0))

    # Đưa không gian 3D Viewport sang Camera view để chụp screenshot chuẩn góc
    for area in bpy.context.screen.areas:
        if area.type == 'VIEW_3D':
            for space in area.spaces:
                if space.type == 'VIEW_3D':
                    space.region_3d.view_perspective = 'CAMERA'

    # 13. Hệ thống chiếu sáng High-Contrast Low-Poly
    # Đèn chính (Key Sun) tạo bóng đổ rõ nét, góc chiếu mềm hơn để cả 2 cánh đều sáng rõ
    sun_key_data = bpy.data.lights.new(name="Sun_Key", type='SUN')
    sun_key_data.energy = 4.8
    sun_key_data.color = (1.0, 0.98, 0.94)
    sun_key_data.angle = 0.0
    sun_key_obj = bpy.data.objects.new("Sun_Key", sun_key_data)
    bpy.context.collection.objects.link(sun_key_obj)
    sun_key_obj.location = (-15, -15, 25)
    dir_key = Vector((0.45, 0.70, -0.75)).normalized()
    sun_key_obj.rotation_euler = dir_key.to_track_quat('-Z', 'Y').to_euler()

    # Đèn phụ (Fill Sun) dịu nhẹ màu xanh ngọc pastel
    sun_fill_data = bpy.data.lights.new(name="Sun_Fill", type='SUN')
    sun_fill_data.energy = 1.45
    sun_fill_data.color = (0.80, 0.92, 1.0)
    sun_fill_data.angle = 0.0
    sun_fill_obj = bpy.data.objects.new("Sun_Fill", sun_fill_data)
    bpy.context.collection.objects.link(sun_fill_obj)
    sun_fill_obj.location = (18, 14, 18)
    dir_fill = Vector((-0.65, -0.40, -0.65)).normalized()
    sun_fill_obj.rotation_euler = dir_fill.to_track_quat('-Z', 'Y').to_euler()

    # Đèn ven (Rim Sun) tôn đường viền khối trên nền tối
    sun_rim_data = bpy.data.lights.new(name="Sun_Rim", type='SUN')
    sun_rim_data.energy = 0.75
    sun_rim_data.color = (0.95, 0.98, 1.0)
    sun_rim_data.angle = 0.0
    sun_rim_obj = bpy.data.objects.new("Sun_Rim", sun_rim_data)
    bpy.context.collection.objects.link(sun_rim_obj)
    dir_rim = Vector((-0.15, 0.75, -0.85)).normalized()
    sun_rim_obj.rotation_euler = dir_rim.to_track_quat('-Z', 'Y').to_euler()

    # 14. Đảm bảo toàn bộ polygon đều tắt Smooth Shading (Flat Shading)
    for obj in bpy.context.scene.objects:
        if obj.type == 'MESH':
            for poly in obj.data.polygons:
                poly.use_smooth = False
            obj.data.update()

    print("UEL Building A1 refined scene built successfully!")

if __name__ == "__main__":
    build_scene()
