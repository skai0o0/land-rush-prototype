import * as THREE from "three";

function createBoxWithColor(
  width: number,
  height: number,
  depth: number,
  colorHex: number,
  centerX = 0,
  centerY = 0,
  centerZ = 0
): THREE.BufferGeometry {
  const geom = new THREE.BoxGeometry(width, height, depth);
  geom.translate(centerX, centerY, centerZ);

  const count = geom.attributes.position.count;
  const color = new THREE.Color(colorHex);
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  geom.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geom;
}

function mergeGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let totalPositions = 0;
  let totalNormals = 0;
  let totalColors = 0;
  let totalIndices = 0;

  for (const g of geometries) {
    totalPositions += g.attributes.position.array.length;
    totalNormals += g.attributes.normal.array.length;
    if (g.attributes.color) totalColors += g.attributes.color.array.length;
    if (g.index) totalIndices += g.index.array.length;
  }

  const mergedPositions = new Float32Array(totalPositions);
  const mergedNormals = new Float32Array(totalNormals);
  const mergedColors = new Float32Array(totalColors);
  const mergedIndices = new Uint32Array(totalIndices);

  let posOffset = 0;
  let normOffset = 0;
  let colOffset = 0;
  let indexOffset = 0;
  let vertexOffset = 0;

  for (const g of geometries) {
    const pos = g.attributes.position.array;
    mergedPositions.set(pos, posOffset);
    posOffset += pos.length;

    const norm = g.attributes.normal.array;
    mergedNormals.set(norm, normOffset);
    normOffset += norm.length;

    if (g.attributes.color) {
      const col = g.attributes.color.array;
      mergedColors.set(col, colOffset);
      colOffset += col.length;
    }

    if (g.index) {
      const idx = g.index.array;
      for (let i = 0; i < idx.length; i++) {
        mergedIndices[indexOffset + i] = idx[i] + vertexOffset;
      }
      indexOffset += idx.length;
    }
    vertexOffset += g.attributes.position.count;
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute("position", new THREE.BufferAttribute(mergedPositions, 3));
  merged.setAttribute("normal", new THREE.BufferAttribute(mergedNormals, 3));
  merged.setAttribute("color", new THREE.BufferAttribute(mergedColors, 3));
  if (totalIndices > 0) {
    merged.setIndex(new THREE.BufferAttribute(mergedIndices, 1));
  }

  return merged;
}

// 1. CÂY GỖ SỒI MINECRAFT (Oak Tree - Thân gỗ nâu sẫm, tán lá khối lập phương xanh đậm)
export function createOakTreeGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const cTrunk = 0x6d4e33;      // Thân gỗ sồi nâu sẫm (#6d4e33)
  const cTrunkDark = 0x543d2b;  // Vân gỗ sồi tối màu
  const cLeaves = 0x4e7a27;     // Tán lá sồi xanh đậm (#4e7a27)
  const cLeavesLight = 0x58892c; // Lớp viền lá xanh tươi đón nắng

  // Thân gỗ lập phương (Trunk: height 3.2, base at y = 0)
  parts.push(createBoxWithColor(0.55, 3.2, 0.55, cTrunk, 0, 1.6, 0));
  // Vệt vỏ gỗ tạo chiều sâu
  parts.push(createBoxWithColor(0.58, 0.6, 0.2, cTrunkDark, 0, 1.0, 0.2));
  parts.push(createBoxWithColor(0.2, 0.7, 0.58, cTrunkDark, -0.2, 2.0, 0));

  // Tán lá sồi Minecraft (Layered cubic voxel boxes)
  // Tầng 1: Tán lá rộng phía dưới (y = 2.0 -> 2.8)
  parts.push(createBoxWithColor(2.2, 0.8, 2.2, cLeaves, 0, 2.4, 0));
  // Tầng 2: Thân tán lá chính dày dặn (y = 2.8 -> 3.6)
  parts.push(createBoxWithColor(2.4, 0.8, 2.4, cLeaves, 0, 3.2, 0));
  parts.push(createBoxWithColor(2.5, 0.6, 1.4, cLeavesLight, 0, 3.2, 0));
  parts.push(createBoxWithColor(1.4, 0.6, 2.5, cLeavesLight, 0, 3.2, 0));
  // Tầng 3: Tán lá thuôn phía trên (y = 3.6 -> 4.4)
  parts.push(createBoxWithColor(1.8, 0.8, 1.8, cLeaves, 0, 4.0, 0));
  // Tầng 4: Đỉnh chóp lá vòm (y = 4.4 -> 4.9)
  parts.push(createBoxWithColor(1.1, 0.5, 1.1, cLeavesLight, 0, 4.65, 0));

  return mergeGeometries(parts);
}

// 2. CÂY GỖ BẠCH DƯƠNG MINECRAFT (Birch Tree - Thân trắng ngà có vân xám/đen, tán lá xanh vàng nhạt)
export function createBirchTreeGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const cBirchTrunk = 0xe2e8f0; // Thân gỗ trắng ngà (#e2e8f0)
  const cBirchMark = 0x4a4a4a;  // Vân đốm xám/đen đặc trưng (#4a4a4a)
  const cBirchLeaf = 0x7ba342;  // Tán lá xanh vàng nhạt đặc trưng (#7ba342)
  const cBirchLeafLight = 0x8cb84d; // Tán lá viền vàng nhạt

  // Thân cây cao và thon thả (Trunk: height 4.2, base at y = 0)
  parts.push(createBoxWithColor(0.42, 4.2, 0.42, cBirchTrunk, 0, 2.1, 0));

  // Vệt vân xám đen đặc trưng của gỗ Bạch Dương Minecraft
  parts.push(createBoxWithColor(0.44, 0.22, 0.44, cBirchMark, 0, 0.7, 0));
  parts.push(createBoxWithColor(0.45, 0.18, 0.22, cBirchMark, 0, 1.5, 0.12));
  parts.push(createBoxWithColor(0.22, 0.22, 0.45, cBirchMark, -0.12, 2.3, 0));
  parts.push(createBoxWithColor(0.45, 0.18, 0.45, cBirchMark, 0, 3.1, 0));

  // Tán lá Bạch Dương Minecraft (Slender cubic canopy)
  // Tầng 1: Tán dưới (y = 2.8 -> 3.5)
  parts.push(createBoxWithColor(1.8, 0.7, 1.8, cBirchLeaf, 0, 3.15, 0));
  // Tầng 2: Tán giữa (y = 3.5 -> 4.3)
  parts.push(createBoxWithColor(2.0, 0.8, 2.0, cBirchLeaf, 0, 3.9, 0));
  parts.push(createBoxWithColor(2.1, 0.6, 1.2, cBirchLeafLight, 0, 3.9, 0));
  parts.push(createBoxWithColor(1.2, 0.6, 2.1, cBirchLeafLight, 0, 3.9, 0));
  // Tầng 3: Tán trên (y = 4.3 -> 5.0)
  parts.push(createBoxWithColor(1.5, 0.7, 1.5, cBirchLeaf, 0, 4.65, 0));
  // Tầng 4: Đỉnh ngọn lá (y = 5.0 -> 5.6)
  parts.push(createBoxWithColor(0.9, 0.6, 0.9, cBirchLeafLight, 0, 5.3, 0));

  return mergeGeometries(parts);
}

// 3. CỎ DẠI MINECRAFT (Grass Tuft - Khóm cỏ khối hộp xanh mướt)
export function createGrassTuftGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const cGrass = 0x5b8c32;      // Xanh cỏ Minecraft
  const cGrassLight = 0x70a83b; // Xanh tươi sáng
  const cGrassDark = 0x4e7a27;  // Xanh đậm chân cỏ

  // Khóm các cọng cỏ voxel mọc tự nhiên
  parts.push(createBoxWithColor(0.12, 0.65, 0.12, cGrassLight, 0, 0.325, 0));
  parts.push(createBoxWithColor(0.10, 0.50, 0.10, cGrass, 0.18, 0.25, 0.1));
  parts.push(createBoxWithColor(0.10, 0.45, 0.10, cGrassDark, -0.16, 0.225, -0.08));
  parts.push(createBoxWithColor(0.08, 0.55, 0.08, cGrass, -0.1, 0.275, 0.15));
  parts.push(createBoxWithColor(0.08, 0.40, 0.08, cGrassLight, 0.14, 0.2, -0.14));

  return mergeGeometries(parts);
}

// 4. HOA NHỎ MINECRAFT (Wild Flower - Hoa đỏ Poppy & Dandelion đón nắng)
export function createFlowerGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const cStem = 0x5b8c32;       // Cuống hoa xanh
  const cPetalRed = 0xef4444;   // Cánh hoa đỏ Poppy (#ef4444)
  const cPetalYellow = 0xfacc15; // Nhị hoa vàng rực rỡ (#facc15)

  // Cuống hoa thẳng đứng
  parts.push(createBoxWithColor(0.08, 0.55, 0.08, cStem, 0, 0.275, 0));
  // Cánh hoa đỏ khối hộp Minecraft
  parts.push(createBoxWithColor(0.32, 0.22, 0.32, cPetalRed, 0, 0.62, 0));
  // Nhị hoa vàng ở giữa
  parts.push(createBoxWithColor(0.14, 0.14, 0.14, cPetalYellow, 0, 0.72, 0));
  // Chiếc lá nhỏ ở thân
  parts.push(createBoxWithColor(0.2, 0.05, 0.08, cStem, 0.1, 0.25, 0));

  return mergeGeometries(parts);
}
