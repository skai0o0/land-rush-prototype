"""
Script dựng mô hình 3D Isometric Low-Poly Tòa nhà chính Trường Đại học Quốc tế ĐHQG-HCM (HCMIU - International University)
Tuân thủ chuẩn bản đặc tả hình học & style game asset diorama:
- Camera: Orthographic 3/4 Isometric (54.736°, 0°, 45°)
- Shading: Flat Shading toàn bộ mesh
- Background: Nền xám than đơn sắc (#2B2D31)
- Đế tiểu cảnh: Khối lục giác mỏng màu xanh đen thẫm (#0F172A) giật cấp với viền LED màu vàng hổ phách (#F59E0B)
- 3 Cụm cấu trúc chính:
  1. Khối trung tâm kẻ ô cờ đỏ (Central Crimson Grid): Khối hộp chữ nhật 8 tầng màu Đỏ Booc-đô (#991B1B), mặt tiền chia 4 nhịp ô cờ đều đặn với gờ trắng nổi bật, các ô cửa sổ kính màu vàng hổ phách (#F59E0B) phát sáng ấm
  2. Hai tháp đứng kẹp hai bên (Two Red Vertical Pylon Towers): Hai tháp đứng màu đỏ kẹp sát hai bên khối trung tâm, có dải kính thang máy đứng, góc trên tháp trái có logo tròn IU màu xanh dương phát sáng (#0284C7)
  3. Các khối cánh giật cấp màu trắng (Stepped White Wings): Khối nhà học màu trắng tinh (#F8FAFC) giật cấp thấp dần (8 tầng -> 5 tầng -> 3 tầng) với dải cửa sổ ngang đỏ sẫm chia ô nhịp nhàng
  4. Tầng mái viễn thông (Rooftop Telecom Assets): Khung viền pergola đỏ, cột ăng-ten phát sóng và các chảo đĩa vi ba viễn thông (#94A3B8)
  5. Sảnh đón tầng trệt & Cây cọ cảnh low-poly (Palm Trees): Mái sảnh vươn ra trước có biển hiệu HCMIU cùng hàng cọ cảnh low-poly đặc trưng
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

    # 1. Khởi tạo bảng vật liệu chuẩn HCMIU
    mat_crimson_red  = create_mat("Mat_Crimson_Red",  "#991B1B", roughness=0.45, metallic=0.05)
    mat_crimson_dark = create_mat("Mat_Crimson_Dark", "#7F1D1D", roughness=0.45, metallic=0.05)
    mat_white_wall   = create_mat("Mat_White_Wall",   "#F8FAFC", roughness=0.40, metallic=0.02)
    mat_amber_glass  = create_mat("Mat_Amber_Glass",  "#F59E0B", roughness=0.15, metallic=0.15, emission_hex="#F59E0B", emission_strength=1.6)
    mat_amber_soft   = create_mat("Mat_Amber_Soft",   "#D97706", roughness=0.20, metallic=0.10, emission_hex="#F59E0B", emission_strength=0.9)
    mat_cyan_glass   = create_mat("Mat_Cyan_Glass",   "#38BDF8", roughness=0.15, metallic=0.15, emission_hex="#38BDF8", emission_strength=1.8)
    mat_iu_logo_blue = create_mat("Mat_IU_Logo_Blue", "#0284C7", roughness=0.20, emission_hex="#0284C7", emission_strength=2.6)
    mat_metal_silver = create_mat("Mat_Metal_Silver", "#CBD5E1", roughness=0.25, metallic=0.50)
    mat_metal_dark   = create_mat("Mat_Metal_Dark",   "#1E293B", roughness=0.40, metallic=0.40)
    mat_roof_slate   = create_mat("Mat_Roof_Slate",   "#334155", roughness=0.65, metallic=0.08)
    mat_steps_gray   = create_mat("Mat_Steps_Gray",   "#475569", roughness=0.60, metallic=0.05)
    mat_base_dark    = create_mat("Mat_Base_Dark",    "#0F172A", roughness=0.85, metallic=0.05)
    mat_base_plaza   = create_mat("Mat_Base_Plaza",   "#1E293B", roughness=0.80, metallic=0.05)
    mat_glow_accent  = create_mat("Mat_Glow_Accent",  "#F59E0B", roughness=0.20, emission_hex="#F59E0B", emission_strength=2.8)
    mat_palm_trunk   = create_mat("Mat_Palm_Trunk",   "#78716C", roughness=0.70, metallic=0.0)
    mat_palm_leaf    = create_mat("Mat_Palm_Leaf",    "#16A34A", roughness=0.45, metallic=0.0)
    mat_grass_green  = create_mat("Mat_Grass_Green",  "#15803D", roughness=0.65, metallic=0.0)

    # 2. Đế tiểu cảnh lục giác (Hexagonal Diorama Base)
    z_base = 0.30
    base_center = (0.7, 0.2)

    bpy.ops.mesh.primitive_cylinder_add(
        vertices=6,
        radius=9.5,
        depth=0.50,
        location=(base_center[0], base_center[1], -0.25)
    )
    base_plinth = bpy.context.active_object
    base_plinth.rotation_euler = (0, 0, math.radians(30.0))
    base_plinth.data.materials.append(mat_base_dark)
    set_flat_shading(base_plinth)

    bpy.ops.mesh.primitive_cylinder_add(
        vertices=6,
        radius=8.9,
        depth=0.25,
        location=(base_center[0], base_center[1], 0.125)
    )
    base_podium = bpy.context.active_object
    base_podium.rotation_euler = (0, 0, math.radians(30.0))
    base_podium.data.materials.append(mat_base_plaza)
    set_flat_shading(base_podium)

    # Viền LED trang trí màu vàng hổ phách ấm quanh bệ
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=6,
        radius=8.5,
        depth=0.03,
        location=(base_center[0], base_center[1], 0.26)
    )
    base_ring = bpy.context.active_object
    base_ring.rotation_euler = (0, 0, math.radians(30.0))
    base_ring.data.materials.append(mat_glow_accent)
    set_flat_shading(base_ring)

    # Mặt sân trên cùng (Island deck)
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=6,
        radius=8.3,
        depth=0.05,
        location=(base_center[0], base_center[1], 0.28)
    )
    base_island = bpy.context.active_object
    base_island.rotation_euler = (0, 0, math.radians(30.0))
    base_island.data.materials.append(mat_base_dark)
    set_flat_shading(base_island)

    # 3. Khối trung tâm kẻ ô cờ đỏ (Central Crimson Grid Tower - 8 tầng)
    # Tọa độ: X từ -2.4 đến +2.4 (rộng 4.8m), Y từ -1.0 đến +1.2 (sâu 2.2m)
    # Chiều cao: 8 tầng, mỗi tầng 1.0m -> Z từ z_base đến z_base + 8.0m
    center_w = 4.80
    center_d = 2.20
    center_h = 8.00
    cx = 0.0
    cy = 0.10
    cz = z_base + center_h / 2.0

    bpy.ops.mesh.primitive_cube_add(
        size=1.0,
        location=(cx, cy, cz)
    )
    core_crimson = bpy.context.active_object
    core_crimson.name = "IU_Central_Crimson_Core"
    core_crimson.scale = (center_w, center_d, center_h)
    core_crimson.data.materials.append(mat_crimson_red)
    set_flat_shading(core_crimson)

    # Lưới ô cờ mặt tiền (Front Facade Grid):
    # Dải phân tầng ngang màu trắng nổi bật (Spandrel beams) tại các tầng (1 đến 8)
    for fl in range(1, 9):
        fz = z_base + fl * 1.0
        bpy.ops.mesh.primitive_cube_add(
            size=1.0,
            location=(cx, cy - center_d/2.0 - 0.03, fz)
        )
        grid_h = bpy.context.active_object
        grid_h.scale = (center_w + 0.02, 0.08, 0.14)
        grid_h.data.materials.append(mat_white_wall)
        set_flat_shading(grid_h)

    # Các nan cột đứng màu trắng chia mặt tiền thành 4 nhịp ô cờ đều đặn (mỗi nhịp rộng 1.2m)
    # Cột biên và cột giữa tại X = -2.4, -1.2, 0.0, 1.2, 2.4
    grid_cols_x = [-1.2, 0.0, 1.2]
    for col_x in grid_cols_x:
        bpy.ops.mesh.primitive_cube_add(
            size=1.0,
            location=(col_x, cy - center_d/2.0 - 0.03, z_base + center_h / 2.0)
        )
        grid_v = bpy.context.active_object
        grid_v.scale = (0.14, 0.08, center_h)
        grid_v.data.materials.append(mat_white_wall)
        set_flat_shading(grid_v)

    # Các ô cửa sổ kính màu vàng hổ phách (Amber Windows) bên trong lưới 4 nhịp đều đặn:
    # Tâm 4 nhịp: X = -1.8, -0.6, 0.6, 1.8
    # 7 tầng cửa sổ phía trên (tầng 2 đến 8)
    window_cells_x = [-1.8, -0.6, 0.6, 1.8]
    for fl in range(1, 8):
        fz = z_base + fl * 1.0 + 0.50
        for wx in window_cells_x:
            # Viền lõm phân mảng
            bpy.ops.mesh.primitive_cube_add(
                size=1.0,
                location=(wx, cy - center_d/2.0 - 0.015, fz)
            )
            w_rim = bpy.context.active_object
            w_rim.scale = (0.96, 0.04, 0.76)
            w_rim.data.materials.append(mat_crimson_dark)
            set_flat_shading(w_rim)

            # Mặt kính hổ phách phát sáng
            bpy.ops.mesh.primitive_cube_add(
                size=1.0,
                location=(wx, cy - center_d/2.0 - 0.025, fz)
            )
            win = bpy.context.active_object
            win.scale = (0.84, 0.03, 0.64)
            win.data.materials.append(mat_amber_glass)
            set_flat_shading(win)

    # 4. Hai tháp đứng kẹp hai bên (Two Red Vertical Pylon Towers)
    pylon_w = 0.90
    pylon_d = 2.36
    pylon_h = 8.35
    pylon_z = z_base + pylon_h / 2.0

    # Tháp trái
    bpy.ops.mesh.primitive_cube_add(
        size=1.0,
        location=(-2.85, cy, pylon_z)
    )
    pylon_left = bpy.context.active_object
    pylon_left.name = "IU_Pylon_Tower_Left"
    pylon_left.scale = (pylon_w, pylon_d, pylon_h)
    pylon_left.data.materials.append(mat_crimson_red)
    set_flat_shading(pylon_left)

    # Dải kính thang máy đứng mặt trước tháp trái
    bpy.ops.mesh.primitive_cube_add(
        size=1.0,
        location=(-2.85, cy - pylon_d/2.0 - 0.02, z_base + 4.10)
    )
    shaft_left = bpy.context.active_object
    shaft_left.scale = (0.38, 0.04, 6.4)
    shaft_left.data.materials.append(mat_cyan_glass)
    set_flat_shading(shaft_left)

    # Vành viền trắng bao quanh logo IU ở đỉnh tháp trái
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=16,
        radius=0.42,
        depth=0.06,
        location=(-2.85, cy - pylon_d/2.0 - 0.04, z_base + 7.60)
    )
    logo_rim = bpy.context.active_object
    logo_rim.rotation_euler = (math.radians(90.0), 0, 0)
    logo_rim.data.materials.append(mat_white_wall)
    set_flat_shading(logo_rim)

    # Đĩa logo tròn IU màu xanh dương phát sáng
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=16,
        radius=0.36,
        depth=0.08,
        location=(-2.85, cy - pylon_d/2.0 - 0.06, z_base + 7.60)
    )
    iu_logo = bpy.context.active_object
    iu_logo.name = "IU_Logo_Emblem"
    iu_logo.rotation_euler = (math.radians(90.0), 0, 0)
    iu_logo.data.materials.append(mat_iu_logo_blue)
    set_flat_shading(iu_logo)

    # Họa tiết chữ cách điệu "IU" trên logo
    bpy.ops.mesh.primitive_cube_add(
        size=1.0,
        location=(-2.85, cy - pylon_d/2.0 - 0.11, z_base + 7.60)
    )
    iu_core = bpy.context.active_object
    iu_core.scale = (0.22, 0.03, 0.22)
    iu_core.data.materials.append(mat_white_wall)
    set_flat_shading(iu_core)

    # Tháp phải
    bpy.ops.mesh.primitive_cube_add(
        size=1.0,
        location=(2.85, cy, pylon_z)
    )
    pylon_right = bpy.context.active_object
    pylon_right.name = "IU_Pylon_Tower_Right"
    pylon_right.scale = (pylon_w, pylon_d, pylon_h)
    pylon_right.data.materials.append(mat_crimson_red)
    set_flat_shading(pylon_right)

    # Dải kính thang máy đứng mặt trước tháp phải
    bpy.ops.mesh.primitive_cube_add(
        size=1.0,
        location=(2.85, cy - pylon_d/2.0 - 0.02, z_base + 4.10)
    )
    shaft_right = bpy.context.active_object
    shaft_right.scale = (0.38, 0.04, 6.4)
    shaft_right.data.materials.append(mat_cyan_glass)
    set_flat_shading(shaft_right)

    # 5. Các khối cánh giật cấp màu trắng (Stepped White Wings)
    # Khối cánh 5 tầng bên phải (X từ +3.3 đến +6.7, Y từ -0.8 đến +2.4, Z từ z_base đến z_base + 5.1m)
    w5_w = 3.40
    w5_d = 3.20
    w5_h = 5.10
    w5_x = 3.30 + w5_w / 2.0   # 5.00
    w5_y = 0.80
    w5_z = z_base + w5_h / 2.0

    bpy.ops.mesh.primitive_cube_add(
        size=1.0,
        location=(w5_x, w5_y, w5_z)
    )
    wing_5fl = bpy.context.active_object
    wing_5fl.name = "IU_Wing_5_Floors"
    wing_5fl.scale = (w5_w, w5_d, w5_h)
    wing_5fl.data.materials.append(mat_white_wall)
    set_flat_shading(wing_5fl)

    # Dải cửa sổ băng ngang màu đỏ đô + ô kính hổ phách trên khối 5 tầng
    for fl in range(1, 5):
        fz = z_base + fl * 1.0 + 0.35
        # Dải viền đỏ ôm ngang mặt trước
        bpy.ops.mesh.primitive_cube_add(
            size=1.0,
            location=(w5_x, w5_y - w5_d/2.0 - 0.015, fz)
        )
        band_red = bpy.context.active_object
        band_red.scale = (w5_w + 0.02, 0.04, 0.50)
        band_red.data.materials.append(mat_crimson_dark)
        set_flat_shading(band_red)

        # Các ô kính con chia nhịp
        for wx in [w5_x - 1.0, w5_x, w5_x + 1.0]:
            bpy.ops.mesh.primitive_cube_add(
                size=1.0,
                location=(wx, w5_y - w5_d/2.0 - 0.03, fz)
            )
            w5_glass = bpy.context.active_object
            w5_glass.scale = (0.75, 0.03, 0.36)
            w5_glass.data.materials.append(mat_amber_soft)
            set_flat_shading(w5_glass)

    # Khối cánh 3 tầng tiếp tục giật cấp thấp dần sang phải (X từ +6.7 đến +9.5, Y từ -0.5 đến +2.4, Z từ z_base đến z_base + 3.1m)
    w3_w = 2.80
    w3_d = 2.90
    w3_h = 3.10
    w3_x = 6.70 + w3_w / 2.0   # 8.10
    w3_y = 0.95
    w3_z = z_base + w3_h / 2.0

    bpy.ops.mesh.primitive_cube_add(
        size=1.0,
        location=(w3_x, w3_y, w3_z)
    )
    wing_3fl = bpy.context.active_object
    wing_3fl.name = "IU_Wing_3_Floors"
    wing_3fl.scale = (w3_w, w3_d, w3_h)
    wing_3fl.data.materials.append(mat_white_wall)
    set_flat_shading(wing_3fl)

    # Dải cửa sổ trên khối 3 tầng
    for fl in range(1, 3):
        fz = z_base + fl * 1.0 + 0.35
        bpy.ops.mesh.primitive_cube_add(
            size=1.0,
            location=(w3_x, w3_y - w3_d/2.0 - 0.015, fz)
        )
        band_red3 = bpy.context.active_object
        band_red3.scale = (w3_w + 0.02, 0.04, 0.50)
        band_red3.data.materials.append(mat_crimson_dark)
        set_flat_shading(band_red3)

        for wx in [w3_x - 0.7, w3_x + 0.7]:
            bpy.ops.mesh.primitive_cube_add(
                size=1.0,
                location=(wx, w3_y - w3_d/2.0 - 0.03, fz)
            )
            w3_glass = bpy.context.active_object
            w3_glass.scale = (0.90, 0.03, 0.36)
            w3_glass.data.materials.append(mat_amber_soft)
            set_flat_shading(w3_glass)

    # Khối cánh nhà học phía sau trung tâm (+Y)
    wr_w = 4.20
    wr_d = 2.00
    wr_h = 6.20
    wr_x = 0.0
    wr_y = cy + center_d/2.0 + wr_d/2.0
    wr_z = z_base + wr_h / 2.0

    bpy.ops.mesh.primitive_cube_add(
        size=1.0,
        location=(wr_x, wr_y, wr_z)
    )
    wing_rear = bpy.context.active_object
    wing_rear.name = "IU_Wing_Rear"
    wing_rear.scale = (wr_w, wr_d, wr_h)
    wing_rear.data.materials.append(mat_white_wall)
    set_flat_shading(wing_rear)

    # Khối cánh bên trái (X từ -5.5 đến -3.3, rộng 2.2m, cao 4 tầng)
    wl_w = 2.20
    wl_d = 2.60
    wl_h = 4.20
    wl_x = -3.30 - wl_w / 2.0   # -4.40
    wl_y = 0.60
    wl_z = z_base + wl_h / 2.0

    bpy.ops.mesh.primitive_cube_add(
        size=1.0,
        location=(wl_x, wl_y, wl_z)
    )
    wing_left = bpy.context.active_object
    wing_left.name = "IU_Wing_Left"
    wing_left.scale = (wl_w, wl_d, wl_h)
    wing_left.data.materials.append(mat_white_wall)
    set_flat_shading(wing_left)

    for fl in range(1, 4):
        fz = z_base + fl * 1.0 + 0.35
        bpy.ops.mesh.primitive_cube_add(
            size=1.0,
            location=(wl_x, wl_y - wl_d/2.0 - 0.015, fz)
        )
        band_redl = bpy.context.active_object
        band_redl.scale = (wl_w + 0.02, 0.04, 0.50)
        band_redl.data.materials.append(mat_crimson_dark)
        set_flat_shading(band_redl)

    # 6. Tầng mái kỹ thuật & Viễn thông (Rooftop Telecom Assets)
    z_roof = z_base + center_h

    # Khung viền mái che hở màu đỏ (Red open pergola frame) trên nóc tháp trung tâm
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(cx, cy - center_d/2.0 + 0.1, z_roof + 0.45))
    rf_front = bpy.context.active_object
    rf_front.scale = (center_w, 0.12, 0.20)
    rf_front.data.materials.append(mat_crimson_red)
    set_flat_shading(rf_front)

    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(cx, cy + center_d/2.0 - 0.1, z_roof + 0.45))
    rf_back = bpy.context.active_object
    rf_back.scale = (center_w, 0.12, 0.20)
    rf_back.data.materials.append(mat_crimson_red)
    set_flat_shading(rf_back)

    for rx in [-2.2, -1.1, 0.0, 1.1, 2.2]:
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(rx, cy, z_roof + 0.52))
        rf_beam = bpy.context.active_object
        rf_beam.scale = (0.12, center_d, 0.14)
        rf_beam.data.materials.append(mat_crimson_red)
        set_flat_shading(rf_beam)

    # Cột ăng-ten viễn thông cao vút (Telecom Antenna Mast)
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=6,
        radius=0.05,
        depth=2.4,
        location=(0.0, cy + 0.2, z_roof + 1.6)
    )
    antenna_main = bpy.context.active_object
    antenna_main.data.materials.append(mat_metal_silver)
    set_flat_shading(antenna_main)

    # Đèn tín hiệu đỉnh ăng-ten (Red beacon light)
    bpy.ops.mesh.primitive_ico_sphere_add(
        subdivisions=1,
        radius=0.10,
        location=(0.0, cy + 0.2, z_roof + 2.85)
    )
    beacon = bpy.context.active_object
    beacon.data.materials.append(mat_crimson_red)
    set_flat_shading(beacon)

    # 2 Đĩa chảo vi ba viễn thông (Microwave Satellite Dishes)
    dish_data = [
        (-1.2, cy + 0.4, z_roof + 0.65, 30.0, -40.0, 0.42),
        (1.4, cy + 0.3, z_roof + 0.70, 35.0, 25.0, 0.36),
    ]
    for dx, dy, dz, rx, rz, rad in dish_data:
        bpy.ops.mesh.primitive_cylinder_add(
            vertices=6,
            radius=0.04,
            depth=0.5,
            location=(dx, dy, dz - 0.15)
        )
        dp = bpy.context.active_object
        dp.data.materials.append(mat_metal_silver)
        set_flat_shading(dp)

        bpy.ops.mesh.primitive_cylinder_add(
            vertices=8,
            radius=rad,
            depth=0.08,
            location=(dx, dy, dz)
        )
        dish = bpy.context.active_object
        dish.rotation_euler = (math.radians(rx), 0, math.radians(rz))
        dish.data.materials.append(mat_metal_silver)
        set_flat_shading(dish)

    # Hộp điều hòa HVAC trên nóc
    hvac_locs = [(-1.5, cy - 0.4, z_roof + 0.25), (0.8, cy - 0.4, z_roof + 0.25), (w5_x, w5_y, z_base + w5_h + 0.25)]
    for hx, hy, hz in hvac_locs:
        bpy.ops.mesh.primitive_cube_add(
            size=1.0,
            location=(hx, hy, hz)
        )
        hvac = bpy.context.active_object
        hvac.scale = (0.75, 0.65, 0.45)
        hvac.data.materials.append(mat_metal_silver)
        set_flat_shading(hvac)

    # 7. Sảnh đón tầng trệt (Grand Podium Entrance)
    z_canopy = z_base + 1.15
    bpy.ops.mesh.primitive_cube_add(
        size=1.0,
        location=(cx, cy - center_d/2.0 - 0.60, z_canopy)
    )
    canopy = bpy.context.active_object
    canopy.name = "IU_Entrance_Canopy"
    canopy.scale = (3.8, 1.25, 0.14)
    canopy.data.materials.append(mat_white_wall)
    set_flat_shading(canopy)

    # Viền đỏ Booc-đô ở mép trước mái sảnh
    bpy.ops.mesh.primitive_cube_add(
        size=1.0,
        location=(cx, cy - center_d/2.0 - 1.22, z_canopy)
    )
    canopy_edge = bpy.context.active_object
    canopy_edge.scale = (3.84, 0.05, 0.16)
    canopy_edge.data.materials.append(mat_crimson_red)
    set_flat_shading(canopy_edge)

    # Bảng tên trường "INTERNATIONAL UNIVERSITY" / "HCMIU" trên trán sảnh
    bpy.ops.mesh.primitive_cube_add(
        size=1.0,
        location=(cx, cy - center_d/2.0 - 1.25, z_canopy + 0.22)
    )
    sign_iu = bpy.context.active_object
    sign_iu.scale = (2.6, 0.04, 0.26)
    sign_iu.data.materials.append(mat_iu_logo_blue)
    set_flat_shading(sign_iu)

    # 4 Cột đỡ sảnh đón màu trắng
    for col_x in [-1.6, -0.5, 0.5, 1.6]:
        bpy.ops.mesh.primitive_cylinder_add(
            vertices=8,
            radius=0.08,
            depth=1.15,
            location=(col_x, cy - center_d/2.0 - 1.12, z_base + 0.575)
        )
        col = bpy.context.active_object
        col.data.materials.append(mat_white_wall)
        set_flat_shading(col)

    # Vách kính đại sảnh tầng trệt
    bpy.ops.mesh.primitive_cube_add(
        size=1.0,
        location=(cx, cy - center_d/2.0 - 0.20, z_base + 0.55)
    )
    ent_glass = bpy.context.active_object
    ent_glass.scale = (3.4, 0.60, 1.0)
    ent_glass.data.materials.append(mat_amber_glass)
    set_flat_shading(ent_glass)

    # Tam cấp tối giản dẫn vào sảnh
    steps_data = [
        (4.4, 0.6, z_base + 0.05, cy - center_d/2.0 - 1.45),
        (4.8, 0.6, z_base - 0.05, cy - center_d/2.0 - 1.70),
        (5.2, 0.6, z_base - 0.15, cy - center_d/2.0 - 1.95),
    ]
    for w, d, z, y in steps_data:
        bpy.ops.mesh.primitive_cube_add(
            size=1.0,
            location=(cx, y, z)
        )
        st = bpy.context.active_object
        st.scale = (w, d, 0.10)
        st.data.materials.append(mat_steps_gray)
        set_flat_shading(st)

    # 8. Cây cọ cảnh low-poly đặc trưng (Stylized Palm Trees)
    palm_locations = [
        (-3.4, -3.2, 1.0),
        (-2.0, -4.2, 1.15),
        (2.8, -3.8, 1.10),
        (4.8, -2.8, 0.95),
    ]

    def create_palm_tree(loc_x, loc_y, height_scale=1.0):
        # Bồn cây nhỏ lục giác
        bpy.ops.mesh.primitive_cylinder_add(
            vertices=6,
            radius=0.42 * height_scale,
            depth=0.14,
            location=(loc_x, loc_y, z_base + 0.07)
        )
        pb = bpy.context.active_object
        pb.data.materials.append(mat_metal_dark)
        set_flat_shading(pb)

        # Thân cọ phân đoạn
        trunk_h = 1.65 * height_scale
        bpy.ops.mesh.primitive_cylinder_add(
            vertices=6,
            radius=0.10,
            depth=trunk_h,
            location=(loc_x, loc_y, z_base + trunk_h / 2.0)
        )
        trunk = bpy.context.active_object
        trunk.rotation_euler = (math.radians(3.0), math.radians(-3.0), 0)
        trunk.data.materials.append(mat_palm_trunk)
        set_flat_shading(trunk)

        # 6 Tàu lá cọ đa giác xòe rộng
        top_z = z_base + trunk_h - 0.02
        for i in range(6):
            leaf_ang = (i / 6.0) * math.pi * 2.0
            leaf_dist = 0.58 * height_scale
            lx = loc_x + leaf_dist * math.cos(leaf_ang)
            ly = loc_y + leaf_dist * math.sin(leaf_ang)
            lz = top_z - 0.10

            bpy.ops.mesh.primitive_cube_add(
                size=1.0,
                location=(lx, ly, lz)
            )
            leaf = bpy.context.active_object
            leaf.scale = (0.58 * height_scale, 0.22 * height_scale, 0.04)
            leaf.rotation_euler = (
                math.radians(16.0 * math.cos(leaf_ang)),
                math.radians(16.0 * math.sin(leaf_ang)),
                leaf_ang
            )
            leaf.data.materials.append(mat_palm_leaf)
            set_flat_shading(leaf)

    for px, py, sc in palm_locations:
        create_palm_tree(px, py, height_scale=sc)

    # 9. Thiết lập Camera Orthographic 3/4 Isometric chuẩn
    cam_data = bpy.data.cameras.new("Isometric_Camera_IU")
    cam_data.type = 'ORTHO'
    cam_data.ortho_scale = 20.5
    cam_obj = bpy.data.objects.new("Isometric_Camera_IU", cam_data)
    bpy.context.collection.objects.link(cam_obj)
    bpy.context.scene.camera = cam_obj

    # Điểm nhìn trung tâm (Target) cân đối cả tháp đỏ và các cánh giật cấp
    target = Vector((1.0, -0.1, z_base + 3.9))
    dist = 28.0
    elev = math.radians(35.264)
    azim = math.radians(45.0)

    cam_x = target.x + dist * math.cos(azim) * math.cos(elev)
    cam_y = target.y - dist * math.sin(azim) * math.cos(elev)
    cam_z = target.z + dist * math.sin(elev)

    cam_obj.location = (cam_x, cam_y, cam_z)
    cam_obj.rotation_euler = (math.radians(54.73561), 0.0, math.radians(45.0))

    # Đưa không gian 3D Viewport sang Camera view
    for area in bpy.context.screen.areas:
        if area.type == 'VIEW_3D':
            for space in area.spaces:
                if space.type == 'VIEW_3D':
                    space.region_3d.view_perspective = 'CAMERA'

    # 10. Hệ thống chiếu sáng High-Contrast Low-Poly
    # Đèn chính (Key Sun) từ góc trước bên trái tạo bóng đổ sắc nét
    sun_key_data = bpy.data.lights.new(name="Sun_Key", type='SUN')
    sun_key_data.energy = 4.8
    sun_key_data.color = (1.0, 0.98, 0.94)
    sun_key_data.angle = 0.0
    sun_key_obj = bpy.data.objects.new("Sun_Key", sun_key_data)
    bpy.context.collection.objects.link(sun_key_obj)
    sun_key_obj.location = (-15, -15, 25)
    dir_key = Vector((0.55, 0.65, -0.75)).normalized()
    sun_key_obj.rotation_euler = dir_key.to_track_quat('-Z', 'Y').to_euler()

    # Đèn phụ (Fill Sun) ánh sáng xanh ngọc pastel nhẹ
    sun_fill_data = bpy.data.lights.new(name="Sun_Fill", type='SUN')
    sun_fill_data.energy = 1.40
    sun_fill_data.color = (0.82, 0.92, 1.0)
    sun_fill_data.angle = 0.0
    sun_fill_obj = bpy.data.objects.new("Sun_Fill", sun_fill_data)
    bpy.context.collection.objects.link(sun_fill_obj)
    sun_fill_obj.location = (18, 14, 18)
    dir_fill = Vector((-0.65, -0.40, -0.65)).normalized()
    sun_fill_obj.rotation_euler = dir_fill.to_track_quat('-Z', 'Y').to_euler()

    # Đèn ven (Rim Sun) tạo viền sáng trên nền tối
    sun_rim_data = bpy.data.lights.new(name="Sun_Rim", type='SUN')
    sun_rim_data.energy = 0.70
    sun_rim_data.color = (0.95, 0.98, 1.0)
    sun_rim_data.angle = 0.0
    sun_rim_obj = bpy.data.objects.new("Sun_Rim", sun_rim_data)
    bpy.context.collection.objects.link(sun_rim_obj)
    dir_rim = Vector((-0.15, 0.75, -0.85)).normalized()
    sun_rim_obj.rotation_euler = dir_rim.to_track_quat('-Z', 'Y').to_euler()

    # 11. Đảm bảo toàn bộ polygon đều tắt Smooth Shading (Flat Shading)
    for obj in bpy.context.scene.objects:
        if obj.type == 'MESH':
            for poly in obj.data.polygons:
                poly.use_smooth = False
            obj.data.update()

    print("HCMIU refined scene built successfully!")

if __name__ == "__main__":
    build_scene()
