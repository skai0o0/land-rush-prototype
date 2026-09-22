"""
Script dựng mô hình 3D Isometric Low-Poly Trường Đại học Khoa học Sức khỏe ĐHQG-HCM (UHS - University of Health Sciences)
Mô phỏng chính xác theo ảnh phối cảnh thực tế của tòa nhà UHS / Khoa Y ĐHQG-HCM:
- Tỷ lệ: Pavilion y sinh nằm ngang trải dài (Horizontal Biotech Pavilion)
- Cấu trúc:
  1. Khối đầu hồi bên trái (Left Charcoal Louvered Pylon): Khối tường màu xám than trầm với các nan rãnh ngang, góc trên gắn logo tròn Khoa Y / UHS (vòng nguyệt quế xanh & chén thuốc Hygeia)
  2. Khung cổng & Mái vòm dốc màu trắng (Continuous Dynamic White Slanted Portal & Sweeping Roof Fascia): Dải ribbon trắng vát chéo ~65 độ ở cạnh trái, uốn liền mạch thành dải mái vươn dài mỏng nhẹ sắc nét che suốt mặt tiền sang cánh phải
  3. Mặt tiền 5 nhịp lưới hoa gió trắng (5-Bay Screen Facade):
     - 6 cột thép kết cấu màu xám đậm chia mặt tiền thành 5 nhịp đều đặn
     - Tầng 2 & 3: Hệ lam đục lỗ hoa gió màu trắng (Clinical White Brise-soleil lattice) bao phủ mặt ngoài, phía sau là vách kính y tế Medical Cyan
     - Tầng trệt: Kính mở rộng chạm sàn, sảnh chính thông tầng có cây cảnh bên trong
  4. Mái đón sảnh dài & Dây giằng chéo (Cantilever Canopy & Diagonal Tie-Rods): Mái hiên phẳng mỏng vươn dài suốt 5 nhịp với các thanh giằng chéo văng từ cột đỡ
  5. Khối cánh bên phải (Right Wing with Rooftop Terrace): Khối đá xám sáng bên dưới, bên trên là sân thượng mở (loggia) với hàng nan cột trắng và cây xanh
  6. Sân trước, bậc tam cấp & Xe cứu thương y tế low-poly (Medical Ambulance): Bậc cấp dài, vạch đi bộ, dải cỏ hoa xanh và xe cấp cứu trắng sọc đỏ đặc trưng
- Camera: Orthographic 3/4 Isometric chuẩn (54.736°, 0°, 45°)
- Shading: Flat Shading toàn bộ mesh
- Background: Nền xám than đơn sắc (#2B2D31)
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

    # 1. Bảng vật liệu chuẩn xác theo ảnh thực tế
    mat_pylon_charcoal = create_mat("Mat_Pylon_Charcoal", "#262626", roughness=0.70, metallic=0.05)
    mat_pylon_groove   = create_mat("Mat_Pylon_Groove",   "#171717", roughness=0.80, metallic=0.05)
    mat_white_origami  = create_mat("Mat_White_Origami",  "#F8FAFC", roughness=0.25, metallic=0.02)
    mat_steel_dark     = create_mat("Mat_Steel_Dark",     "#1E293B", roughness=0.40, metallic=0.50)
    mat_medical_glass  = create_mat("Mat_Medical_Glass",  "#0891B2", roughness=0.15, metallic=0.10, emission_hex="#06B6D4", emission_strength=1.8)
    mat_lattice_white  = create_mat("Mat_Lattice_White",  "#FFFFFF", roughness=0.30, metallic=0.02)
    mat_canopy_metal   = create_mat("Mat_Canopy_Metal",   "#334155", roughness=0.35, metallic=0.45)
    mat_silver_wire    = create_mat("Mat_Silver_Wire",    "#CBD5E1", roughness=0.20, metallic=0.70)
    mat_right_stone    = create_mat("Mat_Right_Stone",    "#E2E8F0", roughness=0.50, metallic=0.05)
    mat_roof_deck      = create_mat("Mat_Roof_Deck",      "#475569", roughness=0.75, metallic=0.08)
    mat_logo_green     = create_mat("Mat_Logo_Green",     "#16A34A", roughness=0.20, emission_hex="#22C55E", emission_strength=2.5)
    mat_logo_blue      = create_mat("Mat_Logo_Blue",      "#0284C7", roughness=0.20, emission_hex="#0284C7", emission_strength=2.5)
    mat_steps_gray     = create_mat("Mat_Steps_Gray",     "#475569", roughness=0.60, metallic=0.05)
    mat_base_dark      = create_mat("Mat_Base_Dark",      "#0F172A", roughness=0.85, metallic=0.05)
    mat_base_plaza     = create_mat("Mat_Base_Plaza",     "#1E293B", roughness=0.80, metallic=0.05)
    mat_glow_cyan      = create_mat("Mat_Glow_Cyan",      "#06B6D4", roughness=0.20, emission_hex="#22D3EE", emission_strength=3.0)
    mat_grass_green    = create_mat("Mat_Grass_Green",    "#15803D", roughness=0.70, metallic=0.0)
    mat_tree_foliage   = create_mat("Mat_Tree_Foliage",   "#16A34A", roughness=0.55, metallic=0.0)
    mat_amb_white      = create_mat("Mat_Amb_White",      "#F8FAFC", roughness=0.25, metallic=0.10)
    mat_amb_red        = create_mat("Mat_Amb_Red",        "#DC2626", roughness=0.30, emission_hex="#EF4444", emission_strength=1.8)
    mat_amb_blue       = create_mat("Mat_Amb_Blue",       "#2563EB", roughness=0.25, emission_hex="#3B82F6", emission_strength=1.8)

    # 2. Đế tiểu cảnh lục giác (Hexagonal Base Pedestal)
    z_base = 0.30
    base_center = (0.5, -0.1)

    bpy.ops.mesh.primitive_cylinder_add(
        vertices=6,
        radius=9.6,
        depth=0.50,
        location=(base_center[0], base_center[1], -0.25)
    )
    base_plinth = bpy.context.active_object
    base_plinth.rotation_euler = (0, 0, math.radians(30.0))
    base_plinth.data.materials.append(mat_base_dark)
    set_flat_shading(base_plinth)

    bpy.ops.mesh.primitive_cylinder_add(
        vertices=6,
        radius=9.0,
        depth=0.25,
        location=(base_center[0], base_center[1], 0.125)
    )
    base_podium = bpy.context.active_object
    base_podium.rotation_euler = (0, 0, math.radians(30.0))
    base_podium.data.materials.append(mat_base_plaza)
    set_flat_shading(base_podium)

    # Viền LED trang trí màu Medical Cyan quanh bệ
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=6,
        radius=8.6,
        depth=0.03,
        location=(base_center[0], base_center[1], 0.26)
    )
    base_ring = bpy.context.active_object
    base_ring.rotation_euler = (0, 0, math.radians(30.0))
    base_ring.data.materials.append(mat_glow_cyan)
    set_flat_shading(base_ring)

    # Mặt sân trên cùng (Island deck)
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=6,
        radius=8.4,
        depth=0.05,
        location=(base_center[0], base_center[1], 0.28)
    )
    base_island = bpy.context.active_object
    base_island.rotation_euler = (0, 0, math.radians(30.0))
    base_island.data.materials.append(mat_base_dark)
    set_flat_shading(base_island)

    # Dải đường dạo / làn xe đón khách (Drop-off Driveway)
    bpy.ops.mesh.primitive_cube_add(
        size=1.0,
        location=(0.5, -3.2, z_base + 0.02)
    )
    driveway = bpy.context.active_object
    driveway.scale = (12.8, 1.8, 0.03)
    driveway.data.materials.append(mat_base_plaza)
    set_flat_shading(driveway)

    # Vạch sang đường cho người đi bộ (Zebra Crosswalk)
    for cx in [-0.6, -0.2, 0.2, 0.6]:
        bpy.ops.mesh.primitive_cube_add(
            size=1.0,
            location=(cx, -3.2, z_base + 0.04)
        )
        stripe = bpy.context.active_object
        stripe.scale = (0.22, 1.4, 0.01)
        stripe.data.materials.append(mat_white_origami)
        set_flat_shading(stripe)

    # Dải bồn cỏ xanh phía trước sát mép lề đường (Front Greenery Strip)
    bpy.ops.mesh.primitive_cube_add(
        size=1.0,
        location=(0.5, -4.3, z_base + 0.05)
    )
    curb_grass = bpy.context.active_object
    curb_grass.scale = (11.8, 0.6, 0.08)
    curb_grass.data.materials.append(mat_grass_green)
    set_flat_shading(curb_grass)

    # 3. Khối đầu hồi bên trái (Left Charcoal Louvered Pylon)
    pylon_w = 2.40
    pylon_d = 3.20
    pylon_h = 4.05
    pylon_cx = -5.20
    pylon_cy = 0.80
    pylon_cz = z_base + pylon_h / 2.0

    bpy.ops.mesh.primitive_cube_add(
        size=1.0,
        location=(pylon_cx, pylon_cy, pylon_cz)
    )
    obj_pylon = bpy.context.active_object
    obj_pylon.name = "UHS_Left_Louvered_Pylon"
    obj_pylon.scale = (pylon_w, pylon_d, pylon_h)
    obj_pylon.data.materials.append(mat_pylon_charcoal)
    set_flat_shading(obj_pylon)

    # Các nan ngang / rãnh phân vị ngang đặc trưng trên mặt trước khối xám
    for f_idx in range(13):
        gz = z_base + 0.35 + f_idx * 0.28
        bpy.ops.mesh.primitive_cube_add(
            size=1.0,
            location=(pylon_cx, pylon_cy - pylon_d/2.0 - 0.015, gz)
        )
        louver_bar = bpy.context.active_object
        louver_bar.scale = (pylon_w + 0.02, 0.03, 0.07)
        louver_bar.data.materials.append(mat_pylon_groove)
        set_flat_shading(louver_bar)

    # Logo tròn Khoa Y / UHS ở góc trên bên trái mặt tiền
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=16,
        radius=0.55,
        depth=0.06,
        location=(pylon_cx - 0.35, pylon_cy - pylon_d/2.0 - 0.04, z_base + 3.00)
    )
    logo_outer = bpy.context.active_object
    logo_outer.rotation_euler = (math.radians(90.0), 0, 0)
    logo_outer.data.materials.append(mat_white_origami)
    set_flat_shading(logo_outer)

    bpy.ops.mesh.primitive_cylinder_add(
        vertices=16,
        radius=0.48,
        depth=0.08,
        location=(pylon_cx - 0.35, pylon_cy - pylon_d/2.0 - 0.06, z_base + 3.00)
    )
    logo_wreath = bpy.context.active_object
    logo_wreath.rotation_euler = (math.radians(90.0), 0, 0)
    logo_wreath.data.materials.append(mat_logo_green)
    set_flat_shading(logo_wreath)

    bpy.ops.mesh.primitive_cylinder_add(
        vertices=16,
        radius=0.38,
        depth=0.10,
        location=(pylon_cx - 0.35, pylon_cy - pylon_d/2.0 - 0.08, z_base + 3.00)
    )
    logo_core = bpy.context.active_object
    logo_core.rotation_euler = (math.radians(90.0), 0, 0)
    logo_core.data.materials.append(mat_logo_blue)
    set_flat_shading(logo_core)

    bpy.ops.mesh.primitive_cube_add(
        size=1.0,
        location=(pylon_cx - 0.35, pylon_cy - pylon_d/2.0 - 0.14, z_base + 3.00)
    )
    cross_w = bpy.context.active_object
    cross_w.scale = (0.10, 0.04, 0.46)
    cross_w.data.materials.append(mat_white_origami)
    set_flat_shading(cross_w)

    bpy.ops.mesh.primitive_cube_add(
        size=1.0,
        location=(pylon_cx - 0.35, pylon_cy - pylon_d/2.0 - 0.14, z_base + 3.00)
    )
    cross_h = bpy.context.active_object
    cross_h.scale = (0.36, 0.04, 0.10)
    cross_h.data.materials.append(mat_white_origami)
    set_flat_shading(cross_h)

    # Cây xanh nhiệt đới ở chân khối đầu hồi
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=6,
        radius=0.60,
        depth=0.20,
        location=(-5.2, -1.4, z_base + 0.10)
    )
    pb_tree = bpy.context.active_object
    pb_tree.data.materials.append(mat_steel_dark)
    set_flat_shading(pb_tree)

    bpy.ops.mesh.primitive_ico_sphere_add(
        subdivisions=1,
        radius=0.70,
        location=(-5.2, -1.4, z_base + 0.75)
    )
    tr_foliage = bpy.context.active_object
    tr_foliage.data.materials.append(mat_tree_foliage)
    set_flat_shading(tr_foliage)

    # 4. Thân nhà chính phía sau (Sàn mái bằng Z = z_base + 3.82m thấp hơn diềm mái vươn)
    bpy.ops.mesh.primitive_cube_add(
        size=1.0,
        location=(1.0, 1.20, z_base + 1.91)
    )
    main_core = bpy.context.active_object
    main_core.name = "UHS_Main_Core"
    main_core.scale = (7.6, 2.6, 3.82)
    main_core.data.materials.append(mat_roof_deck)
    set_flat_shading(main_core)

    # 5. Khung cổng bê tông vát chéo & Dải mái vươn dài màu trắng (Slanted Frame & Sweeping Roof Fascia)
    bm_roof = bmesh.new()
    roof_front_y = -1.15
    roof_back_y  = -0.15

    pts_xz = [
        # (x, z)
        (-4.00, z_base + 0.00),   # 0: Chân vát ngoài cùng
        (-4.00, z_base + 0.40),   # 1: Đệm chân
        (-2.70, z_base + 4.35),   # 2: Góc đỉnh trái trên
        (4.80,  z_base + 4.18),   # 3: Mép dầm giữa
        (7.40,  z_base + 4.40),   # 4: Góc đỉnh phải vểnh nhẹ
        (7.40,  z_base + 4.05),   # 5: Mép dưới đầu hồi phải
        (4.80,  z_base + 3.88),   # 6: Dưới dầm giữa
        (-2.45, z_base + 3.88),   # 7: Góc trong đỉnh trái
        (-3.45, z_base + 0.00),   # 8: Chân vát trong cùng
    ]

    v_front = [bm_roof.verts.new(Vector((p[0], roof_front_y, p[1]))) for p in pts_xz]
    v_back  = [bm_roof.verts.new(Vector((p[0], roof_back_y, p[1]))) for p in pts_xz]

    bm_roof.faces.new(v_front)
    bm_roof.faces.new(reversed(v_back))

    for i in range(len(pts_xz)):
        i_next = (i + 1) % len(pts_xz)
        bm_roof.faces.new([v_front[i], v_front[i_next], v_back[i_next], v_back[i]])

    mesh_roof = bpy.data.meshes.new("UHS_Dynamic_Sweeping_Roof")
    bm_roof.to_mesh(mesh_roof)
    bm_roof.free()

    obj_roof = bpy.data.objects.new("UHS_Dynamic_Sweeping_Roof", mesh_roof)
    bpy.context.collection.objects.link(obj_roof)
    obj_roof.data.materials.append(mat_white_origami)
    set_flat_shading(obj_roof)

    # 6. Mặt tiền 5 nhịp & 6 Cột thép kết cấu (5-Bay Screen Facade)
    col_x_positions = [-2.5, -1.1, 0.3, 1.7, 3.1, 4.5]
    for col_x in col_x_positions:
        bpy.ops.mesh.primitive_cube_add(
            size=1.0,
            location=(col_x, -0.92, z_base + 2.05)
        )
        steel_col = bpy.context.active_object
        steel_col.scale = (0.12, 0.16, 4.05)
        steel_col.data.materials.append(mat_steel_dark)
        set_flat_shading(steel_col)

    # Vách kính tầng trệt (Ground Floor Glass)
    bpy.ops.mesh.primitive_cube_add(
        size=1.0,
        location=(1.0, -0.65, z_base + 0.625)
    )
    gf_curtain = bpy.context.active_object
    gf_curtain.name = "UHS_GF_Curtain_Wall"
    gf_curtain.scale = (7.0, 0.30, 1.25)
    gf_curtain.data.materials.append(mat_medical_glass)
    set_flat_shading(gf_curtain)

    # Các nan khung cửa kính tầng trệt
    for fx in [-2.5 + 0.5 * k for k in range(15)]:
        bpy.ops.mesh.primitive_cube_add(
            size=1.0,
            location=(fx, -0.78, z_base + 0.625)
        )
        mull = bpy.context.active_object
        mull.scale = (0.04, 0.04, 1.25)
        mull.data.materials.append(mat_steel_dark)
        set_flat_shading(mull)

    # Tầng 2 & 3: Mặt kính phía sau hệ hoa gió (Z từ z_base + 1.25 đến z_base + 3.88)
    bpy.ops.mesh.primitive_cube_add(
        size=1.0,
        location=(1.0, -0.70, z_base + 2.58)
    )
    upper_glass = bpy.context.active_object
    upper_glass.scale = (7.0, 0.20, 2.60)
    upper_glass.data.materials.append(mat_medical_glass)
    set_flat_shading(upper_glass)

    # Hệ lam hoa gió đục lỗ màu trắng (Perforated Screen Panels) trong 5 nhịp
    # Tinh chỉnh lưới đục lỗ dày đặc và tinh tế hơn (5 hàng x 4 cột lỗ thoáng/nhịp)
    for bay_idx in range(5):
        bay_start = col_x_positions[bay_idx]
        bay_end   = col_x_positions[bay_idx + 1]
        bay_cx    = (bay_start + bay_end) / 2.0
        bay_w     = bay_end - bay_start - 0.12

        # Tấm panel nền hoa gió màu trắng
        bpy.ops.mesh.primitive_cube_add(
            size=1.0,
            location=(bay_cx, -0.90, z_base + 2.58)
        )
        panel = bpy.context.active_object
        panel.scale = (bay_w, 0.04, 2.55)
        panel.data.materials.append(mat_lattice_white)
        set_flat_shading(panel)

        # Lỗ khoét hoa gió / rãnh khe sáng hình học (5 hàng x 4 cột)
        for row in range(5):
            slit_z = z_base + 1.50 + row * 0.50
            for col_i in [-0.42, -0.14, 0.14, 0.42]:
                bpy.ops.mesh.primitive_cube_add(
                    size=1.0,
                    location=(bay_cx + col_i, -0.91, slit_z)
                )
                slit = bpy.context.active_object
                slit.scale = (0.18, 0.06, 0.32)
                slit.data.materials.append(mat_medical_glass)
                set_flat_shading(slit)

    # 7. Mái đón sảnh dài & Hệ thanh giằng chéo (Cantilever Canopy & Diagonal Tie-Rods)
    canopy_w = 8.00
    canopy_d = 1.35
    canopy_cx = 0.80
    canopy_cy = -1.48
    canopy_cz = z_base + 1.26

    bpy.ops.mesh.primitive_cube_add(
        size=1.0,
        location=(canopy_cx, canopy_cy, canopy_cz)
    )
    canopy = bpy.context.active_object
    canopy.name = "UHS_Front_Cantilever_Canopy"
    canopy.scale = (canopy_w, canopy_d, 0.08)
    canopy.data.materials.append(mat_canopy_metal)
    set_flat_shading(canopy)

    # Dải viền mép trước mái sảnh màu trắng
    bpy.ops.mesh.primitive_cube_add(
        size=1.0,
        location=(canopy_cx, canopy_cy - canopy_d/2.0 - 0.015, canopy_cz)
    )
    canopy_edge = bpy.context.active_object
    canopy_edge.scale = (canopy_w + 0.04, 0.04, 0.09)
    canopy_edge.data.materials.append(mat_white_origami)
    set_flat_shading(canopy_edge)

    # Hệ thanh giằng chéo (Diagonal Tie-Rods)
    for col_x in col_x_positions:
        p_top = Vector((col_x, -0.92, z_base + 1.95))
        p_bot = Vector((col_x, -2.10, z_base + 1.28))
        
        rod_vec = p_bot - p_top
        rod_len = rod_vec.length
        rod_mid = (p_top + p_bot) / 2.0
        
        bpy.ops.mesh.primitive_cylinder_add(
            vertices=6,
            radius=0.02,
            depth=rod_len,
            location=rod_mid
        )
        rod = bpy.context.active_object
        rod.data.materials.append(mat_silver_wire)
        rod.rotation_euler = rod_vec.to_track_quat('Z', 'Y').to_euler()
        set_flat_shading(rod)

    # 8. Khối cánh bên phải & Sân thượng mở (Right Wing with Rooftop Terrace)
    right_w = 2.80
    right_d = 3.20
    right_cx = 5.90
    right_cy = 0.80

    # Khối tường đá sáng màu tầng 1-2
    bpy.ops.mesh.primitive_cube_add(
        size=1.0,
        location=(right_cx, right_cy, z_base + 1.20)
    )
    right_base_block = bpy.context.active_object
    right_base_block.name = "UHS_Right_Stone_Podium"
    right_base_block.scale = (right_w, right_d, 2.40)
    right_base_block.data.materials.append(mat_right_stone)
    set_flat_shading(right_base_block)

    # Đường rãnh chỉ trang trí trên mặt khối đá phải
    for rz in [z_base + 0.8, z_base + 1.6]:
        bpy.ops.mesh.primitive_cube_add(
            size=1.0,
            location=(right_cx, right_cy - right_d/2.0 - 0.015, rz)
        )
        r_groove = bpy.context.active_object
        r_groove.scale = (right_w + 0.02, 0.03, 0.06)
        r_groove.data.materials.append(mat_steel_dark)
        set_flat_shading(r_groove)

    # Tầng 3 sân thượng mở (Open Loggia / Rooftop Terrace)
    bpy.ops.mesh.primitive_cube_add(
        size=1.0,
        location=(right_cx, right_cy, z_base + 2.44)
    )
    terrace_slab = bpy.context.active_object
    terrace_slab.scale = (right_w, right_d, 0.08)
    terrace_slab.data.materials.append(mat_pylon_charcoal)
    set_flat_shading(terrace_slab)

    # Hàng nan cột trắng thông thoáng (Terrace Colonnade)
    for px in [4.8, 5.3, 5.8, 6.3, 6.8]:
        bpy.ops.mesh.primitive_cube_add(
            size=1.0,
            location=(px, -0.85, z_base + 3.15)
        )
        t_col = bpy.context.active_object
        t_col.scale = (0.12, 0.12, 1.45)
        t_col.data.materials.append(mat_white_origami)
        set_flat_shading(t_col)

    # Lan can kính / hoa viên trên sân thượng
    bpy.ops.mesh.primitive_cube_add(
        size=1.0,
        location=(right_cx, -0.88, z_base + 2.80)
    )
    t_rail = bpy.context.active_object
    t_rail.scale = (right_w - 0.2, 0.04, 0.70)
    t_rail.data.materials.append(mat_steel_dark)
    set_flat_shading(t_rail)

    # Cây xanh chậu cảnh trên sân thượng
    for tx in [5.1, 6.5]:
        bpy.ops.mesh.primitive_ico_sphere_add(
            subdivisions=1,
            radius=0.28,
            location=(tx, 0.2, z_base + 2.85)
        )
        t_plant = bpy.context.active_object
        t_plant.data.materials.append(mat_tree_foliage)
        set_flat_shading(t_plant)

    # 9. Bậc tam cấp sảnh chính (Grand Entrance Steps)
    steps_data = [
        (4.4, 0.7, z_base + 0.05, -2.15),
        (4.8, 0.7, z_base - 0.05, -2.40),
        (5.2, 0.7, z_base - 0.15, -2.65),
    ]
    for w, d, z, y in steps_data:
        bpy.ops.mesh.primitive_cube_add(
            size=1.0,
            location=(0.9, y, z)
        )
        st = bpy.context.active_object
        st.scale = (w, d, 0.10)
        st.data.materials.append(mat_steps_gray)
        set_flat_shading(st)

    # Cây cảnh bonsai trong sảnh kính chính giữa
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=6,
        radius=0.25,
        depth=0.18,
        location=(0.3, -0.1, z_base + 0.10)
    )
    pot = bpy.context.active_object
    pot.data.materials.append(mat_steel_dark)
    set_flat_shading(pot)

    bpy.ops.mesh.primitive_ico_sphere_add(
        subdivisions=1,
        radius=0.36,
        location=(0.3, -0.1, z_base + 0.52)
    )
    bonsai = bpy.context.active_object
    bonsai.data.materials.append(mat_tree_foliage)
    set_flat_shading(bonsai)

    # 10. Xe cứu thương y tế Low-Poly đặc trưng (Medical Ambulance)
    amb_x = 4.6
    amb_y = -3.2
    amb_z = z_base + 0.42

    bpy.ops.mesh.primitive_cube_add(
        size=1.0,
        location=(amb_x, amb_y, amb_z)
    )
    amb_body = bpy.context.active_object
    amb_body.name = "UHS_Ambulance"
    amb_body.scale = (1.65, 0.75, 0.65)
    amb_body.data.materials.append(mat_amb_white)
    set_flat_shading(amb_body)

    bpy.ops.mesh.primitive_cube_add(
        size=1.0,
        location=(amb_x, amb_y - 0.38, amb_z)
    )
    amb_stripe = bpy.context.active_object
    amb_stripe.scale = (1.66, 0.02, 0.12)
    amb_stripe.data.materials.append(mat_amb_red)
    set_flat_shading(amb_stripe)

    bpy.ops.mesh.primitive_cube_add(
        size=1.0,
        location=(amb_x - 0.10, amb_y, amb_z + 0.36)
    )
    amb_siren_r = bpy.context.active_object
    amb_siren_r.scale = (0.16, 0.28, 0.08)
    amb_siren_r.data.materials.append(mat_amb_red)
    set_flat_shading(amb_siren_r)

    bpy.ops.mesh.primitive_cube_add(
        size=1.0,
        location=(amb_x + 0.10, amb_y, amb_z + 0.36)
    )
    amb_siren_b = bpy.context.active_object
    amb_siren_b.scale = (0.16, 0.28, 0.08)
    amb_siren_b.data.materials.append(mat_amb_blue)
    set_flat_shading(amb_siren_b)

    for wx, wy in [(-0.55, -0.38), (0.55, -0.38), (-0.55, 0.38), (0.55, 0.38)]:
        bpy.ops.mesh.primitive_cylinder_add(
            vertices=8,
            radius=0.16,
            depth=0.10,
            location=(amb_x + wx, amb_y + wy, z_base + 0.16)
        )
        wheel = bpy.context.active_object
        wheel.rotation_euler = (math.radians(90.0), 0, 0)
        wheel.data.materials.append(mat_pylon_groove)
        set_flat_shading(wheel)

    # 11. Xe ô tô thứ hai đỗ trước sảnh
    car_x = -1.2
    car_y = -3.2
    car_z = z_base + 0.32
    bpy.ops.mesh.primitive_cube_add(
        size=1.0,
        location=(car_x, car_y, car_z)
    )
    car = bpy.context.active_object
    car.scale = (1.45, 0.70, 0.45)
    car.data.materials.append(mat_white_origami)
    set_flat_shading(car)

    # 12. Thiết lập Camera Orthographic 3/4 Isometric chuẩn
    cam_data = bpy.data.cameras.new("Isometric_Camera_UHS")
    cam_data.type = 'ORTHO'
    cam_data.ortho_scale = 14.8
    cam_obj = bpy.data.objects.new("Isometric_Camera_UHS", cam_data)
    bpy.context.collection.objects.link(cam_obj)
    bpy.context.scene.camera = cam_obj

    # Điểm nhìn trung tâm (Target)
    target = Vector((0.5, -0.6, z_base + 2.0))
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

    # 13. Hệ thống chiếu sáng High-Contrast Low-Poly
    sun_key_data = bpy.data.lights.new(name="Sun_Key", type='SUN')
    sun_key_data.energy = 4.8
    sun_key_data.color = (1.0, 0.98, 0.95)
    sun_key_data.angle = 0.0
    sun_key_obj = bpy.data.objects.new("Sun_Key", sun_key_data)
    bpy.context.collection.objects.link(sun_key_obj)
    sun_key_obj.location = (-15, -15, 25)
    dir_key = Vector((0.55, 0.60, -0.75)).normalized()
    sun_key_obj.rotation_euler = dir_key.to_track_quat('-Z', 'Y').to_euler()

    sun_fill_data = bpy.data.lights.new(name="Sun_Fill", type='SUN')
    sun_fill_data.energy = 1.40
    sun_fill_data.color = (0.75, 0.92, 1.0)
    sun_fill_data.angle = 0.0
    sun_fill_obj = bpy.data.objects.new("Sun_Fill", sun_fill_data)
    bpy.context.collection.objects.link(sun_fill_obj)
    sun_fill_obj.location = (18, 14, 18)
    dir_fill = Vector((-0.65, -0.40, -0.65)).normalized()
    sun_fill_obj.rotation_euler = dir_fill.to_track_quat('-Z', 'Y').to_euler()

    sun_rim_data = bpy.data.lights.new(name="Sun_Rim", type='SUN')
    sun_rim_data.energy = 0.70
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

    print("UHS realistic model scene built successfully!")

if __name__ == "__main__":
    build_scene()
