export type UniStopTier = 'aspire' | 'nitro' | 'predator';
export type ChestTier = 'silver' | 'gold' | 'platinum';
export type LootItemType = 'points' | 'charcoal' | 'key' | 'real_gift';
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
    cooldownMs: 15000, // 15 giây hồi chiêu
    description: 'Trạm tiếp tế cơ bản Aspire - Cung cấp điểm cơ bản và than củi cho sinh viên trên hành trình'
  },
  nitro: {
    tier: 'nitro',
    name: 'UniStop - Nitro',
    cooldownMs: 30000, // 30 giây hồi chiêu
    description: 'Trạm tiếp tế nâng cao Nitro - Nguồn năng lượng dồi dào, chìa khoá rương và quà tặng'
  },
  predator: {
    tier: 'predator',
    name: 'UniStop - Predator',
    cooldownMs: 60000, // 60 giây hồi chiêu
    description: 'Trạm tiếp tế cao cấp Predator - Tối thượng sức mạnh, tỉ lệ mở ra quà hiện vật Predator độc quyền'
  }
};

export const CHEST_CONFIGS: Record<ChestTier, ChestConfig> = {
  silver: {
    tier: 'silver',
    chestName: 'Chest - Silver',
    keyName: 'Key - Silver',
    requiredKey: 'silver',
    description: 'Rương Bạc - Chứa điểm thưởng, than củi và chìa khóa nâng cấp'
  },
  gold: {
    tier: 'gold',
    chestName: 'Chest - Gold',
    keyName: 'Key - Gold',
    requiredKey: 'gold',
    description: 'Rương Vàng - Chứa lượng lớn tài nguyên và cơ hội trúng quà tặng Predator Gaming'
  },
  platinum: {
    tier: 'platinum',
    chestName: 'Chest - Platinum',
    keyName: 'Key - Platinum',
    requiredKey: 'platinum',
    description: 'Rương Bạch Kim - Kho báu tối thượng chứa quà hiện vật độc quyền và tài nguyên dồi dào'
  }
};

// Item definitions
export const LOOT_ITEMS: Record<string, LootItem> = {
  // Điểm chơi game (Points: 20, 50, 100)
  points_20: {
    id: 'points_20',
    name: '20 Điểm (Points)',
    type: 'points',
    rarity: 'common',
    amount: 20,
    weight: 40,
    description: 'Cộng 20 Điểm vào tài khoản cá nhân và quân lực trường'
  },
  points_50: {
    id: 'points_50',
    name: '50 Điểm (Points)',
    type: 'points',
    rarity: 'rare',
    amount: 50,
    weight: 25,
    description: 'Cộng 50 Điểm vào tài khoản cá nhân và quân lực trường'
  },
  points_100: {
    id: 'points_100',
    name: '100 Điểm (Points)',
    type: 'points',
    rarity: 'epic',
    amount: 100,
    weight: 10,
    description: 'Cộng 100 Điểm vào tài khoản cá nhân và quân lực trường'
  },

  // Nguyên liệu Than củi (Charcoal: 15, 30, 60)
  charcoal_15: {
    id: 'charcoal_15',
    name: '15 Than củi (Charcoal)',
    type: 'charcoal',
    rarity: 'common',
    amount: 15,
    weight: 35,
    description: 'Nguyên liệu than củi dùng để thắp lửa Công trình biểu tượng'
  },
  charcoal_30: {
    id: 'charcoal_30',
    name: '30 Than củi (Charcoal)',
    type: 'charcoal',
    rarity: 'rare',
    amount: 30,
    weight: 20,
    description: 'Nguyên liệu than củi dồi dào hỗ trợ trường thắp lửa'
  },
  charcoal_60: {
    id: 'charcoal_60',
    name: '60 Than củi (Charcoal)',
    type: 'charcoal',
    rarity: 'epic',
    amount: 60,
    weight: 10,
    description: 'Kho than củi lớn tạo bước ngoặt thắp lửa'
  },

  // Chìa khoá rương (Silver, Gold, Platinum Key)
  key_silver: {
    id: 'key_silver',
    name: 'Chìa khoá Bạc (Key - Silver)',
    type: 'key',
    keyTier: 'silver',
    rarity: 'rare',
    weight: 15,
    description: 'Dùng để mở Chest - Silver rải rác trên bản đồ'
  },
  key_gold: {
    id: 'key_gold',
    name: 'Chìa khoá Vàng (Key - Gold)',
    type: 'key',
    keyTier: 'gold',
    rarity: 'epic',
    weight: 8,
    description: 'Dùng để mở Chest - Gold chứa nhiều phần quà giá trị'
  },
  key_platinum: {
    id: 'key_platinum',
    name: 'Chìa khoá Bạch Kim (Key - Platinum)',
    type: 'key',
    keyTier: 'platinum',
    rarity: 'legendary',
    weight: 3,
    description: 'Chìa khóa quý giá nhất dùng để mở Chest - Platinum'
  },

  // Quà thật Predator (Áo thun Predator, Móc khoá Predator Gaming, Vớ thể thao R2PL)
  // cờ isRealGift: true, chỉ mở khóa tỉ lệ trúng khi sinh viên có điểm chạy trong tuần (hasWeeklyRunningPoints)
  gift_socks: {
    id: 'gift_socks',
    name: 'Vớ thể thao R2PL',
    type: 'real_gift',
    isRealGift: true,
    rarity: 'epic',
    weight: 5,
    description: 'Hiện vật Vớ thể thao Road to Predator League chính hãng'
  },
  gift_keychain: {
    id: 'gift_keychain',
    name: 'Móc khoá Predator Gaming',
    type: 'real_gift',
    isRealGift: true,
    rarity: 'epic',
    weight: 4,
    description: 'Hiện vật Móc khoá kim loại Predator Gaming phiên bản giới hạn'
  },
  gift_tshirt: {
    id: 'gift_tshirt',
    name: 'Áo thun Predator',
    type: 'real_gift',
    isRealGift: true,
    rarity: 'legendary',
    weight: 2,
    description: 'Hiện vật Áo thun Predator Gaming thời thượng dành cho Runner xuất sắc'
  }
};

export const ALL_LOOT_ITEMS: LootItem[] = Object.values(LOOT_ITEMS);

// Loot Tables per UniStop Tier
export const UNISTOP_LOOT_TABLES: Record<UniStopTier, LootItem[]> = {
  aspire: [
    { ...LOOT_ITEMS.points_20, weight: 50 },
    { ...LOOT_ITEMS.points_50, weight: 20 },
    { ...LOOT_ITEMS.charcoal_15, weight: 45 },
    { ...LOOT_ITEMS.charcoal_30, weight: 15 },
    { ...LOOT_ITEMS.key_silver, weight: 10 },
    { ...LOOT_ITEMS.gift_socks, weight: 3 },
    { ...LOOT_ITEMS.gift_keychain, weight: 1 }
  ],
  nitro: [
    { ...LOOT_ITEMS.points_20, weight: 25 },
    { ...LOOT_ITEMS.points_50, weight: 40 },
    { ...LOOT_ITEMS.points_100, weight: 15 },
    { ...LOOT_ITEMS.charcoal_15, weight: 20 },
    { ...LOOT_ITEMS.charcoal_30, weight: 35 },
    { ...LOOT_ITEMS.charcoal_60, weight: 15 },
    { ...LOOT_ITEMS.key_silver, weight: 15 },
    { ...LOOT_ITEMS.key_gold, weight: 8 },
    { ...LOOT_ITEMS.gift_socks, weight: 5 },
    { ...LOOT_ITEMS.gift_keychain, weight: 4 },
    { ...LOOT_ITEMS.gift_tshirt, weight: 2 }
  ],
  predator: [
    { ...LOOT_ITEMS.points_50, weight: 30 },
    { ...LOOT_ITEMS.points_100, weight: 45 },
    { ...LOOT_ITEMS.charcoal_30, weight: 25 },
    { ...LOOT_ITEMS.charcoal_60, weight: 45 },
    { ...LOOT_ITEMS.key_silver, weight: 10 },
    { ...LOOT_ITEMS.key_gold, weight: 20 },
    { ...LOOT_ITEMS.key_platinum, weight: 8 },
    { ...LOOT_ITEMS.gift_socks, weight: 8 },
    { ...LOOT_ITEMS.gift_keychain, weight: 7 },
    { ...LOOT_ITEMS.gift_tshirt, weight: 5 }
  ]
};

// Loot Tables per Chest Tier
export const CHEST_LOOT_TABLES: Record<ChestTier, LootItem[]> = {
  silver: [
    { ...LOOT_ITEMS.points_50, weight: 40 },
    { ...LOOT_ITEMS.points_100, weight: 20 },
    { ...LOOT_ITEMS.charcoal_30, weight: 40 },
    { ...LOOT_ITEMS.charcoal_60, weight: 20 },
    { ...LOOT_ITEMS.key_gold, weight: 10 },
    { ...LOOT_ITEMS.gift_socks, weight: 6 },
    { ...LOOT_ITEMS.gift_keychain, weight: 4 }
  ],
  gold: [
    { ...LOOT_ITEMS.points_50, weight: 20 },
    { ...LOOT_ITEMS.points_100, weight: 50 },
    { ...LOOT_ITEMS.charcoal_30, weight: 20 },
    { ...LOOT_ITEMS.charcoal_60, weight: 50 },
    { ...LOOT_ITEMS.key_platinum, weight: 12 },
    { ...LOOT_ITEMS.gift_socks, weight: 8 },
    { ...LOOT_ITEMS.gift_keychain, weight: 8 },
    { ...LOOT_ITEMS.gift_tshirt, weight: 4 }
  ],
  platinum: [
    { ...LOOT_ITEMS.points_100, weight: 60 },
    { ...LOOT_ITEMS.charcoal_60, weight: 60 },
    { ...LOOT_ITEMS.key_platinum, weight: 15 },
    { ...LOOT_ITEMS.gift_socks, weight: 12 },
    { ...LOOT_ITEMS.gift_keychain, weight: 12 },
    { ...LOOT_ITEMS.gift_tshirt, weight: 10 }
  ]
};

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
    return LOOT_ITEMS.points_20;
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
