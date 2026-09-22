"""
Script dựng mô hình 3D Isometric Low-Poly Tòa nhà E Trường Đại học Công nghệ Thông tin ĐHQG-HCM (UIT Building E)
Tuân thủ chuẩn bản đặc tả hình học & style game asset diorama:
- Camera: Orthographic 3/4 Isometric (54.736°, 0°, 45°)
- Shading: Flat Shading toàn bộ mesh
- Background: Nền xám than đơn sắc (#2B2D31)
- Đế tiểu cảnh: Khối lục giác mỏng màu xanh đen thẫm (#0F172A) với viền phát sáng cyan (#38BDF8)
- 3 Khối cấu trúc chính (Tỷ lệ Dài : Rộng : Cao tổng thể = 6 : 4 : 10):
  1. Khối kính trung tâm (Main Glass Monolith): Khối hộp chữ nhật cao tầng bọc kính màu xanh ngọc / xanh cyan (#059669 kết hợp #0EA5E9), chia lưới ô chữ nhật (curtain wall grid) và phát sáng nhẹ
  2. Khối tháp bo cong bên trái (Curved Utility Tower): Nửa khối trụ đa giác ốp tấm nhôm xám bạc (#94A3B8), nhô cao hơn khối kính và NHÔ HẲN RA PHÍA TRƯỚC mặt tiền 0.65m tạo gờ khối giật cấp 3D sắc nét
  3. Tháp thang xoắn ốc bên phải (Right Spiral Staircase): Cột trụ thẳng đứng màu trắng với dải đa giác xoắn ốc (low-poly helix) màu trắng tinh (#F8FAFC) chạy từ chân lên nóc, đỉnh có ban công vòm bán nguyệt nhô ra mép sân thượng
- Tầng thượng & Biển hiệu: Mái bằng có các khối kỹ thuật HVAC, mép trước có dải LED phát sáng màu xanh dương đậm (#1D4ED8) đại diện cho bảng tên trường UIT
- Sảnh đón tầng trệt: Mái sảnh kim loại xám với cột đỡ, cửa kính đại sảnh và bậc cấp tối giản
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

    # 1. Materials PBR High-Tech UIT
    mat_glass_teal   = create_mat("Mat_Glass_Teal", "#059669", roughness=0.15, metallic=0.10, emission_hex="#0D9488", emission_strength=1.5)
    mat_glass_cyan   = create_mat("Mat_Glass_Cyan", "#0EA5E9", roughness=0.15, metallic=0.15, emission_hex="#38BDF8", emission_strength=2.2)
    mat_grid_frame   = create_mat("Mat_Grid_Frame", "#1E293B", roughness=0.30, metallic=0.40)
    mat_curved_alu   = create_mat("Mat_Curved_Alu", "#94A3B8", roughness=0.40, metallic=0.45)
    mat_white_stairs = create_mat("Mat_White_Stairs", "#F8FAFC", roughness=0.25, metallic=0.05)
    mat_signage_blue = create_mat("Mat_Signage_Blue", "#1D4ED8", roughness=0.20, emission_hex="#2563EB", emission_strength=2.8)
    mat_roof_dark    = create_mat("Mat_Roof_Dark", "#334155", roughness=0.55, metallic=0.10)
    mat_portal_gray  = create_mat("Mat_Portal_Gray", "#64748B", roughness=0.35, metallic=0.30)
    mat_base         = create_mat("Mat_Base", "#0F172A", roughness=0.85, metallic=0.05)
    mat_base_top     = create_mat("Mat_Base_Top", "#1E293B", roughness=0.80, metallic=0.05)
    mat_cyan_glow    = create_mat("Mat_Cyan_Glow", "#38BDF8", roughness=0.20, emission_hex="#38BDF8", emission_strength=3.0)
    mat_steps        = create_mat("Mat_Steps", "#475569", roughness=0.50, metallic=0.0)
    mat_tree_green   = create_mat("Mat_Tree_Green", "#10B981", roughness=0.50, metallic=0.0)

    # 2. Hexagonal Base Pedestal (#0F172A)
    bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=9.0, depth=0.50, location=(0, -0.20, -0.25))
    base_plinth = bpy.context.active_object
    base_plinth.data.materials.append(mat_base)
    set_flat_shading(base_plinth)

    bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=8.3, depth=0.25, location=(0, -0.20, 0.125))
    base_podium = bpy.context.active_object
    base_podium.data.materials.append(mat_base_top)
    set_flat_shading(base_podium)

    bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=7.9, depth=0.03, location=(0, -0.20, 0.26))
    base_ring = bpy.context.active_object
    base_ring.data.materials.append(mat_cyan_glow)
    set_flat_shading(base_ring)

    bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=7.7, depth=0.05, location=(0, -0.20, 0.28))
    base_island = bpy.context.active_object
    base_island.data.materials.append(mat_base)
    set_flat_shading(base_island)

    # 3. Main Glass Monolith (Khối kính trung tâm)
    z_base = 0.30
    core_x_center = 1.50
    core_y_center = 0.20
    core_w = 5.60
    core_d = 3.80
    core_h = 9.10
    z_roof = z_base + core_h

    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(core_x_center, core_y_center, z_base + core_h/2.0), scale=(core_w, core_d, core_h))
    glass_core = bpy.context.active_object
    glass_core.name = "UIT_Glass_Core"
    glass_core.data.materials.append(mat_glass_teal)
    set_flat_shading(glass_core)

    num_floors = 10
    floor_h = core_h / float(num_floors)

    # Horizontal Mullions
    for fl in range(1, num_floors + 1):
        fz = z_base + fl * floor_h
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(core_x_center, core_y_center, fz), scale=(core_w + 0.08, core_d + 0.08, 0.08))
        mullion_h = bpy.context.active_object
        mullion_h.data.materials.append(mat_grid_frame)
        set_flat_shading(mullion_h)

    # Vertical Mullions
    front_y = core_y_center - core_d/2.0 # -1.70
    num_vertical_divs = 8
    div_xs = [(core_x_center - core_w/2.0 + 0.35) + i * ((core_w - 0.70) / (num_vertical_divs - 1)) for i in range(num_vertical_divs)]

    for dx in div_xs:
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(dx, front_y - 0.02, z_base + core_h/2.0), scale=(0.08, 0.06, core_h))
        mul_v = bpy.context.active_object
        mul_v.data.materials.append(mat_grid_frame)
        set_flat_shading(mul_v)

    # Highlight Cyan Panes
    highlight_coords = [
        (div_xs[1] + 0.35, front_y - 0.01, z_base + 2.5 * floor_h),
        (div_xs[3] + 0.35, front_y - 0.01, z_base + 5.5 * floor_h),
        (div_xs[5] + 0.35, front_y - 0.01, z_base + 3.5 * floor_h),
        (div_xs[2] + 0.35, front_y - 0.01, z_base + 7.5 * floor_h),
        (div_xs[4] + 0.35, front_y - 0.01, z_base + 8.5 * floor_h),
        (div_xs[6] + 0.35, front_y - 0.01, z_base + 1.5 * floor_h)
    ]
    for hx, hy, hz in highlight_coords:
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(hx, hy, hz), scale=(0.58, 0.03, floor_h - 0.12))
        hl_pane = bpy.context.active_object
        hl_pane.data.materials.append(mat_glass_cyan)
        set_flat_shading(hl_pane)

    # 4. KHỐI THÁP BO CONG BÊN TRÁI - NHÔ RA PHÍA TRƯỚC MẶT TIỀN (Projecting Forward 0.65m)
    tower_join_x = core_x_center - core_w/2.0 # -1.30
    y_front_tower = front_y - 0.65            # -2.35
    y_back_tower  = core_y_center + core_d/2.0 - 0.10 # +2.00
    tower_cy = (y_front_tower + y_back_tower) / 2.0  # -0.175
    tower_ry = (y_back_tower - y_front_tower) / 2.0  # 2.175
    tower_rx = 2.40
    tower_h = core_h + 0.50 # Nhô cao 9.60m

    bm_tower = bmesh.new()
    num_arc_segs = 10
    arc_pts = []

    for i in range(num_arc_segs + 1):
        ang = math.pi * 0.5 + math.pi * (i / float(num_arc_segs))
        px = tower_join_x + tower_rx * math.cos(ang)
        py = tower_cy + tower_ry * math.sin(ang)
        arc_pts.append((px, py))

    v_arc_base = [bm_tower.verts.new((px, py, z_base)) for px, py in arc_pts]
    v_arc_top  = [bm_tower.verts.new((px, py, z_base + tower_h)) for px, py in arc_pts]

    v_close_front_b = bm_tower.verts.new((tower_join_x, y_front_tower, z_base))
    v_close_front_t = bm_tower.verts.new((tower_join_x, y_front_tower, z_base + tower_h))
    v_close_back_b  = bm_tower.verts.new((tower_join_x, y_back_tower, z_base))
    v_close_back_t  = bm_tower.verts.new((tower_join_x, y_back_tower, z_base + tower_h))

    for i in range(num_arc_segs):
        bm_tower.faces.new([v_arc_base[i], v_arc_base[i+1], v_arc_top[i+1], v_arc_top[i]])

    bm_tower.faces.new([v_arc_base[0], v_close_back_b, v_close_back_t, v_arc_top[0]])
    bm_tower.faces.new([v_close_front_b, v_arc_base[num_arc_segs], v_arc_top[num_arc_segs], v_close_front_t])
    bm_tower.faces.new([v_close_back_b, v_close_front_b, v_close_front_t, v_close_back_t])

    pts_bottom = v_arc_base + [v_close_front_b, v_close_back_b]
    bm_tower.faces.new(pts_bottom)
    pts_top = [v_close_back_t, v_close_front_t] + list(reversed(v_arc_top))
    bm_tower.faces.new(pts_top)

    mesh_tower = bpy.data.meshes.new("Mesh_Curved_Tower")
    bm_tower.to_mesh(mesh_tower)
    bm_tower.free()

    tower_obj = bpy.data.objects.new("UIT_Curved_Tower", mesh_tower)
    bpy.context.collection.objects.link(tower_obj)
    tower_obj.data.materials.append(mat_curved_alu)
    set_flat_shading(tower_obj)

    # Nắp đỉnh tháp bo cong
    bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=2.45, depth=0.15, location=(tower_join_x, tower_cy, z_base + tower_h + 0.075))
    tower_cap = bpy.context.active_object
    tower_cap.scale = (1.0, tower_ry/tower_rx, 1.0)
    tower_cap.data.materials.append(mat_grid_frame)
    set_flat_shading(tower_cap)

    # Rãnh cửa sổ thông gió dọc trên thân tháp cong
    for ang_deg in [105, 135, 165, 195, 225, 255]:
        ang = math.radians(ang_deg)
        sx = tower_join_x + (tower_rx + 0.02) * math.cos(ang)
        sy = tower_cy + (tower_ry + 0.02) * math.sin(ang)
        for fl_slot in [2, 4, 6, 8]:
            sz = z_base + fl_slot * floor_h
            bpy.ops.mesh.primitive_cube_add(size=1.0, location=(sx, sy, sz), scale=(0.14, 0.14, 0.55), rotation=(0, 0, ang - math.pi/2))
            slot_obj = bpy.context.active_object
            slot_obj.data.materials.append(mat_grid_frame)
            set_flat_shading(slot_obj)

    # 5. KHỐI THÁP THANG XOẮN ỐC BÊN PHẢI (Right Spiral Staircase)
    stairs_x = core_x_center + core_w/2.0 + 0.95
    stairs_y = core_y_center - 0.40
    col_radius = 0.32
    outer_radius = 1.35
    stairs_z_top = z_roof

    col_h = tower_h + 0.10
    bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=col_radius, depth=col_h, location=(stairs_x, stairs_y, z_base + col_h/2.0))
    central_col = bpy.context.active_object
    central_col.name = "Stair_Central_Column"
    central_col.data.materials.append(mat_white_stairs)
    set_flat_shading(central_col)

    total_turns = 4.25
    num_steps = 52
    dz = (stairs_z_top - z_base) / float(num_steps)
    d_ang = (total_turns * 2.0 * math.pi) / float(num_steps)

    bm_helix = bmesh.new()
    outer_ribbon_pts_bot = []
    outer_ribbon_pts_top = []

    for s_idx in range(num_steps):
        a = s_idx * d_ang
        z_cur = z_base + s_idx * dz
        ca, sa = math.cos(a), math.sin(a)
        ca_next, sa_next = math.cos(a + d_ang * 1.05), math.sin(a + d_ang * 1.05)

        v0 = bm_helix.verts.new((stairs_x + col_radius * ca,      stairs_y + col_radius * sa,      z_cur))
        v1 = bm_helix.verts.new((stairs_x + outer_radius * ca,    stairs_y + outer_radius * sa,    z_cur))
        v2 = bm_helix.verts.new((stairs_x + outer_radius * ca_next, stairs_y + outer_radius * sa_next, z_cur + dz * 0.4))
        v3 = bm_helix.verts.new((stairs_x + col_radius * ca_next,   stairs_y + col_radius * sa_next,   z_cur + dz * 0.4))

        bm_helix.faces.new([v0, v1, v2, v3])

        v1_up = bm_helix.verts.new((stairs_x + outer_radius * ca, stairs_y + outer_radius * sa, z_cur - dz * 0.6))
        v0_up = bm_helix.verts.new((stairs_x + col_radius * ca,   stairs_y + col_radius * sa,   z_cur - dz * 0.6))
        bm_helix.faces.new([v0_up, v1_up, v1, v0])

        outer_ribbon_pts_bot.append(bm_helix.verts.new((stairs_x + outer_radius * ca, stairs_y + outer_radius * sa, z_cur - 0.05)))
        outer_ribbon_pts_top.append(bm_helix.verts.new((stairs_x + outer_radius * ca, stairs_y + outer_radius * sa, z_cur + 0.35)))

    for i in range(num_steps - 1):
        bm_helix.faces.new([outer_ribbon_pts_bot[i], outer_ribbon_pts_bot[i+1], outer_ribbon_pts_top[i+1], outer_ribbon_pts_top[i]])

    mesh_helix = bpy.data.meshes.new("Mesh_Helix_Stairs")
    bm_helix.to_mesh(mesh_helix)
    bm_helix.free()

    helix_obj = bpy.data.objects.new("UIT_Spiral_Staircase", mesh_helix)
    bpy.context.collection.objects.link(helix_obj)
    helix_obj.data.materials.append(mat_white_stairs)
    set_flat_shading(helix_obj)

    # Skywalk Bridges
    bridge_width = 0.85
    bridge_x_start = core_x_center + core_w/2.0
    bridge_x_len = stairs_x - col_radius - bridge_x_start + 0.10

    for b_floor in [3, 6, 9]:
        bz = z_base + b_floor * floor_h
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(bridge_x_start + bridge_x_len/2.0, stairs_y, bz), scale=(bridge_x_len, bridge_width, 0.14))
        bridge = bpy.context.active_object
        bridge.data.materials.append(mat_white_stairs)
        set_flat_shading(bridge)

        for s in [-1, 1]:
            bpy.ops.mesh.primitive_cube_add(size=1.0, location=(bridge_x_start + bridge_x_len/2.0, stairs_y + s * (bridge_width/2.0), bz + 0.22),
                                            scale=(bridge_x_len, 0.05, 0.32))
            b_rail = bpy.context.active_object
            b_rail.data.materials.append(mat_white_stairs)
            set_flat_shading(b_rail)

    canopy_z = z_roof + 0.35
    bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=1.55, depth=0.18, location=(stairs_x, stairs_y, canopy_z))
    stair_canopy = bpy.context.active_object
    stair_canopy.name = "Stairs_Crown_Canopy"
    stair_canopy.data.materials.append(mat_white_stairs)
    set_flat_shading(stair_canopy)

    # 6. Rooftop & UIT Signage Bar
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(core_x_center, core_y_center, z_roof + 0.15), scale=(core_w + 0.08, core_d + 0.08, 0.30))
    parapet = bpy.context.active_object
    parapet.data.materials.append(mat_grid_frame)
    set_flat_shading(parapet)

    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(core_x_center, front_y - 0.06, z_roof + 0.28), scale=(core_w - 0.80, 0.08, 0.42))
    sign_bar = bpy.context.active_object
    sign_bar.name = "UIT_Signage_Bar"
    sign_bar.data.materials.append(mat_signage_blue)
    set_flat_shading(sign_bar)

    hvac_coords = [
        (core_x_center - 1.2, core_y_center + 0.6, z_roof + 0.50, 1.4, 1.1, 0.75),
        (core_x_center + 1.2, core_y_center + 0.6, z_roof + 0.40, 1.2, 0.9, 0.60),
        (core_x_center + 0.0, core_y_center - 0.3, z_roof + 0.30, 0.9, 0.9, 0.45)
    ]
    for hx, hy, hz, sx, sy, sz in hvac_coords:
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(hx, hy, hz), scale=(sx, sy, sz))
        hvac = bpy.context.active_object
        hvac.data.materials.append(mat_roof_dark)
        set_flat_shading(hvac)

    # 7. Entrance Portal
    portal_w = 3.2
    portal_d = 1.40
    portal_h = 0.15
    portal_z = z_base + 1.15
    portal_y = front_y - portal_d/2.0

    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(core_x_center, portal_y, portal_z), scale=(portal_w, portal_d, portal_h))
    portal_slab = bpy.context.active_object
    portal_slab.name = "Entrance_Portal_Slab"
    portal_slab.data.materials.append(mat_portal_gray)
    set_flat_shading(portal_slab)

    for s in [-1, 1]:
        bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=0.09, depth=portal_z - z_base,
                                            location=(core_x_center + s * (portal_w/2.0 - 0.20), portal_y - portal_d/2.0 + 0.15, z_base + (portal_z - z_base)/2.0))
        p_col = bpy.context.active_object
        p_col.data.materials.append(mat_curved_alu)
        set_flat_shading(p_col)

    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(core_x_center, front_y - 0.04, z_base + 0.45), scale=(2.2, 0.08, 0.75))
    p_door = bpy.context.active_object
    p_door.data.materials.append(mat_glass_cyan)
    set_flat_shading(p_door)

    for step_idx in range(3):
        step_z_top = z_base + (3 - step_idx) * 0.07
        sw = portal_w + 0.40 + step_idx * 0.35
        sd = 0.40 + step_idx * 0.20
        sy = portal_y - portal_d/2.0 - step_idx * 0.20
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(core_x_center, sy, (z_base + step_z_top)/2.0), scale=(sw, sd, step_z_top - z_base + 0.04))
        step_obj = bpy.context.active_object
        step_obj.data.materials.append(mat_steps)
        set_flat_shading(step_obj)

    for px, py in [(-2.8, -2.2), (core_x_center - 2.6, -2.6), (core_x_center + 3.2, -2.6)]:
        bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=0.42, depth=0.16, location=(px, py, z_base + 0.08))
        pb = bpy.context.active_object
        pb.data.materials.append(mat_grid_frame)
        set_flat_shading(pb)

        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.40, location=(px, py, z_base + 0.42))
        tr = bpy.context.active_object
        tr.data.materials.append(mat_tree_green)
        set_flat_shading(tr)

    # 8. Camera 3/4 Isometric Perspective (54.7°, 0°, 45°)
    cam_data = bpy.data.cameras.new("Isometric_Camera_UIT")
    cam_data.type = 'ORTHO'
    cam_data.ortho_scale = 18.0
    cam_obj = bpy.data.objects.new("Isometric_Camera_UIT", cam_data)
    bpy.context.collection.objects.link(cam_obj)
    bpy.context.scene.camera = cam_obj

    target = Vector((1.35, 0.05, 4.75))
    dist = 26.0
    elev = math.radians(35.264)
    azim = math.radians(45.0)

    cam_x = target.x + dist * math.cos(azim) * math.cos(elev)
    cam_y = target.y - dist * math.sin(azim) * math.cos(elev)
    cam_z = target.z + dist * math.sin(elev)

    cam_obj.location = (cam_x, cam_y, cam_z)
    cam_obj.rotation_euler = (math.radians(54.73561), 0.0, math.radians(45.0))

    # Set active camera view
    for area in bpy.context.screen.areas:
        if area.type == 'VIEW_3D':
            for space in area.spaces:
                if space.type == 'VIEW_3D':
                    space.region_3d.view_perspective = 'CAMERA'

    # 9. Lighting
    sun_key_data = bpy.data.lights.new(name="Sun_Key", type='SUN')
    sun_key_data.energy = 4.6
    sun_key_data.color = (1.0, 0.98, 0.95)
    sun_key_data.angle = 0.0
    sun_key_obj = bpy.data.objects.new("Sun_Key", sun_key_data)
    bpy.context.collection.objects.link(sun_key_obj)
    sun_key_obj.location = (-12, -14, 22)
    dir_key = Vector((0.65, 0.55, -0.90)).normalized()
    sun_key_obj.rotation_euler = dir_key.to_track_quat('-Z', 'Y').to_euler()

    sun_fill_data = bpy.data.lights.new(name="Sun_Fill", type='SUN')
    sun_fill_data.energy = 1.15
    sun_fill_data.color = (0.75, 0.88, 1.0)
    sun_fill_data.angle = 0.0
    sun_fill_obj = bpy.data.objects.new("Sun_Fill", sun_fill_data)
    bpy.context.collection.objects.link(sun_fill_obj)
    sun_fill_obj.location = (16, 12, 16)
    dir_fill = Vector((-0.70, -0.45, -0.60)).normalized()
    sun_fill_obj.rotation_euler = dir_fill.to_track_quat('-Z', 'Y').to_euler()

    sun_rim_data = bpy.data.lights.new(name="Sun_Rim", type='SUN')
    sun_rim_data.energy = 0.55
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
