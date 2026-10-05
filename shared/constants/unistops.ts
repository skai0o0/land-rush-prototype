export type UniStopTier = 'aspire' | 'nitro' | 'predator';
export type ChestTier = 'aspire' | 'nitro' | 'predator';
export type LootItemType = 'points' | 'crystal' | 'key' | 'treasure_map' | 'real_gift';
export type LootRarity = 'common' | 'rare' | 'epic' | 'legendary';

export interface LootItem {
  id: string;
  name: string;
  type: LootItemType;
  rarity: LootRarity;
  amount?: number;
  keyTier?: ChestTier;
  isRealGift?: boolean;
  weight: number;
  description?: string;
}

export interface UniStopConfig {
  tier: UniStopTier;
  name: string;
  cooldownMs: number;
  description: string;
}

export interface ChestConfig {
  tier: ChestTier;
  chestName: string;
  keyName: string;
  requiredKey: ChestTier;
  description: string;
}

export const UNISTOP_CONFIGS: Record<UniStopTier, UniStopConfig> = {
  aspire: {
    tier: 'aspire',
    name: 'UniStop - Aspire',
    cooldownMs: 12 * 3600 * 1000, // 12 giờ hồi chiêu
    description: 'Trạm tiếp tế cơ bản Aspire - Cung cấp điểm cơ bản và tinh thể cho sinh viên trên hành trình'
  },
  nitro: {
    tier: 'nitro',
    name: 'UniStop - Nitro',
    cooldownMs: 24 * 3600 * 1000, // 24 giờ hồi chiêu
    description: 'Trạm tiếp tế nâng cao Nitro - Nguồn năng lượng dồi dào, chìa khoá rương và quà tặng'
  },
  predator: {
    tier: 'predator',
    name: 'UniStop - Predator',
    cooldownMs: 24 * 3600 * 1000, // 24 giờ hồi chiêu
    description: 'Trạm tiếp tế cao cấp Predator - Tối thượng sức mạnh, tỉ lệ mở ra quà hiện vật Predator độc quyền'
  }
};

export const CHEST_CONFIGS: Record<ChestTier, ChestConfig> = {
  aspire: {
    tier: 'aspire',
    chestName: 'Chest - Aspire',
    keyName: 'Key - Aspire',
    requiredKey: 'aspire',
    description: 'Rương Aspire - Chứa điểm thưởng, tinh thể và bản đồ kho báu'
  },
  nitro: {
    tier: 'nitro',
    chestName: 'Chest - Nitro',
    keyName: 'Key - Nitro',
    requiredKey: 'nitro',
    description: 'Rương Nitro - Chứa lượng lớn tài nguyên và cơ hội trúng quà tặng Predator Gaming'
  },
  predator: {
    tier: 'predator',
    chestName: 'Chest - Predator',
    keyName: 'Key - Predator',
    requiredKey: 'predator',
    description: 'Rương Predator - Kho báu tối thượng chứa quà hiện vật độc quyền và tài nguyên dồi dào'
  }
};

// Item definitions
export const LOOT_ITEMS: Record<string, LootItem> = {
  // Điểm chơi game (Points: 1, 2, 3, 5)
  points_x1: {
    id: 'points_x1',
    name: '1 Điểm (Points)',
    type: 'points',
    rarity: 'common',
    amount: 1,
    weight: 0,
    description: 'Cộng 1 Điểm vào tài khoản cá nhân và quân lực trường'
  },
  points_x2: {
    id: 'points_x2',
    name: '2 Điểm (Points)',
    type: 'points',
    rarity: 'common',
    amount: 2,
    weight: 0,
    description: 'Cộng 2 Điểm vào tài khoản cá nhân và quân lực trường'
  },
  points_x3: {
    id: 'points_x3',
    name: '3 Điểm (Points)',
    type: 'points',
    rarity: 'rare',
    amount: 3,
    weight: 0,
    description: 'Cộng 3 Điểm vào tài khoản cá nhân và quân lực trường'
  },
  points_x5: {
    id: 'points_x5',
    name: '5 Điểm (Points)',
    type: 'points',
    rarity: 'epic',
    amount: 5,
    weight: 0,
    description: 'Cộng 5 Điểm vào tài khoản cá nhân và quân lực trường'
  },

  // Nguyên liệu Tinh thể (Crystal: 1, 2, 3, 4, 5, 10)
  crystal_1: {
    id: 'crystal_1',
    name: '1 Tinh thể (Crystal)',
    type: 'crystal',
    rarity: 'common',
    amount: 1,
    weight: 0,
    description: 'Nguyên liệu tinh thể dùng để thắp sáng Đèn hiệu Công trình'
  },
  crystal_2: {
    id: 'crystal_2',
    name: '2 Tinh thể (Crystal)',
    type: 'crystal',
    rarity: 'common',
    amount: 2,
    weight: 0,
    description: 'Nguyên liệu tinh thể dùng để thắp sáng Đèn hiệu Công trình'
  },
  crystal_3: {
    id: 'crystal_3',
    name: '3 Tinh thể (Crystal)',
    type: 'crystal',
    rarity: 'rare',
    amount: 3,
    weight: 0,
    description: 'Lượng tinh thể quý giá dùng để thắp sáng Đèn hiệu Công trình'
  },
  crystal_4: {
    id: 'crystal_4',
    name: '4 Tinh thể (Crystal)',
    type: 'crystal',
    rarity: 'rare',
    amount: 4,
    weight: 0,
    description: 'Nguyên liệu tinh thể dùng để thắp sáng Đèn hiệu Công trình'
  },
  crystal_5: {
    id: 'crystal_5',
    name: '5 Tinh thể (Crystal)',
    type: 'crystal',
    rarity: 'rare',
    amount: 5,
    weight: 0,
    description: 'Nguyên liệu tinh thể dùng để thắp sáng Đèn hiệu Công trình'
  },
  crystal_10: {
    id: 'crystal_10',
    name: '10 Tinh thể (Crystal)',
    type: 'crystal',
    rarity: 'epic',
    amount: 10,
    weight: 0,
    description: 'Lượng lớn tinh thể tạo bước ngoặt thắp sáng Đèn hiệu'
  },

  // Bản đồ kho báu (Treasure Map)
  treasure_map: {
    id: 'treasure_map',
    name: 'Bản đồ kho báu',
    type: 'treasure_map',
    rarity: 'rare',
    weight: 0,
    description: 'Chỉ dẫn vị trí chính xác của một rương kho báu chưa mở trên bản đồ'
  },

  // Chìa khoá rương (Aspire, Nitro, Predator Key)
  key_aspire: {
    id: 'key_aspire',
    name: 'Chìa khoá Aspire (Key - Aspire)',
    type: 'key',
    keyTier: 'aspire',
    rarity: 'rare',
    weight: 0,
    description: 'Dùng để mở Chest - Aspire rải rác trên bản đồ'
  },
  key_nitro: {
    id: 'key_nitro',
    name: 'Chìa khoá Nitro (Key - Nitro)',
    type: 'key',
    keyTier: 'nitro',
    rarity: 'epic',
    weight: 0,
    description: 'Dùng để mở Chest - Nitro chứa nhiều phần quà giá trị'
  },
  key_predator: {
    id: 'key_predator',
    name: 'Chìa khoá Predator (Key - Predator)',
    type: 'key',
    keyTier: 'predator',
    rarity: 'legendary',
    weight: 0,
    description: 'Chìa khóa quý giá nhất dùng để mở Chest - Predator'
  },

  // Quà thật Predator (Áo thun Predator, Móc khoá Predator Gaming, Vớ thể thao R2PL)
  gift_socks: {
    id: 'gift_socks',
    name: 'Vớ thể thao R2PL',
    type: 'real_gift',
    isRealGift: true,
    rarity: 'epic',
    weight: 0,
    description: 'Hiện vật Vớ thể thao Road to Predator League chính hãng'
  },
  gift_keychain: {
    id: 'gift_keychain',
    name: 'Móc khoá Predator Gaming',
    type: 'real_gift',
    isRealGift: true,
    rarity: 'epic',
    weight: 0,
    description: 'Hiện vật Móc khoá kim loại Predator Gaming phiên bản giới hạn'
  },
  gift_tshirt: {
    id: 'gift_tshirt',
    name: 'Áo thun Predator',
    type: 'real_gift',
    isRealGift: true,
    rarity: 'legendary',
    weight: 0,
    description: 'Hiện vật Áo thun Predator Gaming thời thượng dành cho Runner xuất sắc'
  }
};

// Backward-compatibility aliases
(LOOT_ITEMS as any).points_20 = LOOT_ITEMS.points_x1;
(LOOT_ITEMS as any).points_50 = LOOT_ITEMS.points_x2;
(LOOT_ITEMS as any).points_100 = LOOT_ITEMS.points_x5;
(LOOT_ITEMS as any).charcoal_15 = LOOT_ITEMS.crystal_1;
(LOOT_ITEMS as any).charcoal_30 = LOOT_ITEMS.crystal_2;
(LOOT_ITEMS as any).charcoal_60 = LOOT_ITEMS.crystal_5;
(LOOT_ITEMS as any).key_silver = LOOT_ITEMS.key_aspire;
(LOOT_ITEMS as any).key_gold = LOOT_ITEMS.key_nitro;
(LOOT_ITEMS as any).key_platinum = LOOT_ITEMS.key_predator;

(CHEST_CONFIGS as any).silver = CHEST_CONFIGS.aspire;
(CHEST_CONFIGS as any).gold = CHEST_CONFIGS.nitro;
(CHEST_CONFIGS as any).platinum = CHEST_CONFIGS.predator;

export const ALL_LOOT_ITEMS: LootItem[] = Object.values(LOOT_ITEMS);

// Loot Tables per UniStop Tier (exact weights out of 1000)
export const UNISTOP_LOOT_TABLES: Record<UniStopTier, LootItem[]> = {
  aspire: [
    { ...LOOT_ITEMS.points_x1, weight: 325 },     // 32.5%
    { ...LOOT_ITEMS.points_x2, weight: 100 },     // 10.0%
    { ...LOOT_ITEMS.points_x3, weight: 50 },      // 5.0%
    { ...LOOT_ITEMS.crystal_1, weight: 325 },     // 32.5%
    { ...LOOT_ITEMS.crystal_2, weight: 100 },     // 10.0%
    { ...LOOT_ITEMS.crystal_4, weight: 50 },      // 5.0%
    { ...LOOT_ITEMS.treasure_map, weight: 30 },  // 3.0%
    { ...LOOT_ITEMS.key_aspire, weight: 20 }      // 2.0%
  ],
  nitro: [
    { ...LOOT_ITEMS.points_x1, weight: 295 },     // 29.5%
    { ...LOOT_ITEMS.points_x2, weight: 110 },     // 11.0%
    { ...LOOT_ITEMS.points_x3, weight: 70 },      // 7.0%
    { ...LOOT_ITEMS.crystal_1, weight: 295 },     // 29.5%
    { ...LOOT_ITEMS.crystal_2, weight: 110 },     // 11.0%
    { ...LOOT_ITEMS.crystal_4, weight: 70 },      // 7.0%
    { ...LOOT_ITEMS.treasure_map, weight: 30 },  // 3.0%
    { ...LOOT_ITEMS.key_nitro, weight: 20 }       // 2.0%
  ],
  predator: [
    { ...LOOT_ITEMS.points_x1, weight: 250 },     // 25.0%
    { ...LOOT_ITEMS.points_x2, weight: 125 },     // 12.5%
    { ...LOOT_ITEMS.points_x3, weight: 100 },     // 10.0%
    { ...LOOT_ITEMS.crystal_1, weight: 250 },     // 25.0%
    { ...LOOT_ITEMS.crystal_2, weight: 125 },     // 12.5%
    { ...LOOT_ITEMS.crystal_4, weight: 100 },     // 10.0%
    { ...LOOT_ITEMS.treasure_map, weight: 30 },  // 3.0%
    { ...LOOT_ITEMS.key_predator, weight: 19.8 }, // 1.98%
    { ...LOOT_ITEMS.gift_socks, weight: 0.2 }     // 0.02%
  ]
};

// Loot Tables per Chest Tier (exact weights out of 1000)
export const CHEST_LOOT_TABLES: Record<ChestTier, LootItem[]> = {
  aspire: [
    { ...LOOT_ITEMS.points_x1, weight: 312.5 },   // 31.25%
    { ...LOOT_ITEMS.points_x2, weight: 135 },     // 13.5%
    { ...LOOT_ITEMS.points_x5, weight: 50 },      // 5.0%
    { ...LOOT_ITEMS.crystal_1, weight: 312.5 },   // 31.25%
    { ...LOOT_ITEMS.crystal_5, weight: 135 },     // 13.5%
    { ...LOOT_ITEMS.crystal_10, weight: 50 },     // 5.0%
    { ...LOOT_ITEMS.gift_socks, weight: 5 }       // 0.5%
  ],
  nitro: [
    { ...LOOT_ITEMS.points_x1, weight: 271.875 }, // 27.1875%
    { ...LOOT_ITEMS.points_x2, weight: 150 },     // 15.0%
    { ...LOOT_ITEMS.points_x5, weight: 75 },      // 7.5%
    { ...LOOT_ITEMS.crystal_1, weight: 271.875 }, // 27.1875%
    { ...LOOT_ITEMS.crystal_5, weight: 150 },     // 15.0%
    { ...LOOT_ITEMS.crystal_10, weight: 75 },     // 7.5%
    { ...LOOT_ITEMS.gift_socks, weight: 3.75 },   // 0.375%
    { ...LOOT_ITEMS.gift_keychain, weight: 2.5 }  // 0.25%
  ],
  predator: [
    { ...LOOT_ITEMS.points_x1, weight: 231.5 },   // 23.15%
    { ...LOOT_ITEMS.points_x2, weight: 165 },     // 16.5%
    { ...LOOT_ITEMS.points_x5, weight: 100 },     // 10.0%
    { ...LOOT_ITEMS.crystal_1, weight: 231.5 },   // 23.15%
    { ...LOOT_ITEMS.crystal_5, weight: 165 },     // 16.5%
    { ...LOOT_ITEMS.crystal_10, weight: 100 },    // 10.0%
    { ...LOOT_ITEMS.gift_socks, weight: 3 },      // 0.3%
    { ...LOOT_ITEMS.gift_keychain, weight: 2.5 }, // 0.25%
    { ...LOOT_ITEMS.gift_tshirt, weight: 1.5 }    // 0.15%
  ]
};

// Backward compat aliases for CHEST_LOOT_TABLES
(CHEST_LOOT_TABLES as any).silver = CHEST_LOOT_TABLES.aspire;
(CHEST_LOOT_TABLES as any).gold = CHEST_LOOT_TABLES.nitro;
(CHEST_LOOT_TABLES as any).platinum = CHEST_LOOT_TABLES.predator;

export const MAX_UNISTOP_INTERACTION_DISTANCE = 50; // Khoảng cách tối đa để sinh viên có thể quay trạm
export const MAX_CHEST_INTERACTION_DISTANCE = 50; // Khoảng cách tối đa để sinh viên có thể mở rương

/**
 * Server Weighted RNG roller for Loot Items
 * Tự động loại trừ các phần quà có `isRealGift: true` nếu `hasWeeklyRunningPoints` là false
 */
export function rollLoot(
  lootTable: LootItem[],
  hasWeeklyRunningPoints: boolean = false,
  rng: () => number = Math.random
): LootItem {
  const eligibleItems = lootTable.filter((item) => {
    if (item.isRealGift && !hasWeeklyRunningPoints) {
      return false;
    }
    return item.weight > 0;
  });

  if (eligibleItems.length === 0) {
    return LOOT_ITEMS.points_x1;
  }

  const totalWeight = eligibleItems.reduce((sum, item) => sum + item.weight, 0);
  let roll = rng() * totalWeight;

  for (const item of eligibleItems) {
    if (roll < item.weight) {
      return item;
    }
    roll -= item.weight;
  }

  return eligibleItems[eligibleItems.length - 1];
}

/**
 * Tạo danh sách vật phẩm giả lập để client chạy animation Carousel (CS:GO Case Opening style)
 * Đặt winningItem tại winningIndex (mặc định 24 trong danh sách 30 items)
 */
export function generateCarouselItems(
  winningItem: LootItem,
  pool: LootItem[] = ALL_LOOT_ITEMS,
  totalCount: number = 30,
  winningIndex: number = 24
): LootItem[] {
  const carousel: LootItem[] = [];
  const safePool = pool.length > 0 ? pool : ALL_LOOT_ITEMS;

  for (let i = 0; i < totalCount; i++) {
    if (i === winningIndex) {
      carousel.push(winningItem);
    } else {
      const randomIndex = Math.floor(Math.random() * safePool.length);
      carousel.push(safePool[randomIndex]);
    }
  }

  return carousel;
}
