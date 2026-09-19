import * as THREE from "three";

// Helper to create a colored box buffer geometry with baked vertex colors
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

// Helper to merge an array of geometries into one single BufferGeometry
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

// 1. CÂY TRÀM (Melaleuca tree): slim ash-grey trunk, layered olive foliage
export function createMelaleucaGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const trunkColor = 0x8a8e91; // Ash-grey
  const leafColor1 = 0x476337; // Olive green lower
  const leafColor2 = 0x5a7c46; // Olive green mid
  const leafColor3 = 0x6e9455; // Olive green top

  // Slim trunk
  parts.push(createBoxWithColor(0.2, 1.8, 0.2, trunkColor, 0, 0.9, 0));

  // Layered olive foliage tiers
  parts.push(createBoxWithColor(1.2, 0.5, 1.2, leafColor1, 0, 1.7, 0));
  parts.push(createBoxWithColor(0.9, 0.5, 0.9, leafColor2, 0, 2.1, 0));
  parts.push(createBoxWithColor(0.6, 0.4, 0.6, leafColor3, 0, 2.5, 0));

  return mergeGeometries(parts);
}

// 2. CÂY PHƯỢNG VĨ (Royal Poinciana): brown trunk, vibrant dome red-orange flowers
export function createPoincianaGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const trunkColor = 0x543725; // Dark brown wood
  const flowerRed1 = 0xd62828; // Crimson red
  const flowerRed2 = 0xf77f00; // Orange accent
  const greenLeaf = 0x386641;  // Under-canopy foliage

  // Sturdy brown trunk
  parts.push(createBoxWithColor(0.35, 1.6, 0.35, trunkColor, 0, 0.8, 0));

  // Broad dome canopy
  parts.push(createBoxWithColor(2.2, 0.4, 2.2, greenLeaf, 0, 1.6, 0));
  parts.push(createBoxWithColor(2.0, 0.5, 2.0, flowerRed1, 0, 1.9, 0));
  parts.push(createBoxWithColor(1.4, 0.4, 1.4, flowerRed2, 0, 2.2, 0));
  parts.push(createBoxWithColor(0.8, 0.3, 0.8, flowerRed1, 0, 2.45, 0));

  return mergeGeometries(parts);
}

// 3. TẢNG ĐÁ GRANITE: cluster of 3-4 matte grey cubes
export function createGraniteGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const c1 = 0x767c82;
  const c2 = 0x8a9096;
  const c3 = 0x62686e;

  // Main boulder
  parts.push(createBoxWithColor(0.7, 0.45, 0.6, c1, 0, 0.22, 0));
  // Secondary side stone
  parts.push(createBoxWithColor(0.45, 0.35, 0.4, c2, 0.35, 0.17, 0.2));
  // Small accent pebble
  parts.push(createBoxWithColor(0.3, 0.25, 0.35, c3, -0.3, 0.12, -0.2));

  return mergeGeometries(parts);
}

// 4. BỤI CỎ DẠI: cluster of sharp bright green voxels
export function createWildGrassGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const g1 = 0x66bb33;
  const g2 = 0x77cc44;
  const g3 = 0x4fa326;

  // Tall central blade
  parts.push(createBoxWithColor(0.08, 0.5, 0.08, g1, 0, 0.25, 0));
  // Leaning blades
  parts.push(createBoxWithColor(0.07, 0.4, 0.07, g2, 0.12, 0.2, 0.08));
  parts.push(createBoxWithColor(0.07, 0.35, 0.07, g3, -0.1, 0.18, 0.1));
  parts.push(createBoxWithColor(0.06, 0.3, 0.06, g2, -0.08, 0.15, -0.12));
  parts.push(createBoxWithColor(0.06, 0.25, 0.06, g1, 0.14, 0.12, -0.06));

  return mergeGeometries(parts);
}
