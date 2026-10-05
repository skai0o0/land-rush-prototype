/**
 * Shared Notification Constants & Templates
 * Defines notification templates, categories, target groups, and formatting utilities
 * for in-game push & realtime notifications.
 */

export type NotificationCategory = 'territory' | 'landmark' | 'gacha' | 'rank' | 'chest' | 'ranking';

export interface NotificationSassyExample {
  title: string;
  body: string;
}

export interface NotificationTemplate {
  id: string;
  category: NotificationCategory;
  target: string;
  titleTemplate: string;
  bodyTemplate: string;
  icon?: string;
  sassyExamples?: NotificationSassyExample[];
}

export const DEFAULT_NOTIFICATIONS: NotificationTemplate[] = [
  // --- Territory Category ---
  {
    id: 'terr_urgent_expire',
    category: 'territory',
    target: 'school_online',
    titleTemplate: 'Ô tri thức sắp hết hạn!',
    bodyTemplate: 'Ô tri thức tại ({x}, {y}) sắp hết hạn trong {time_left}! Ôn bài ngay để bảo vệ lãnh thổ.',
    icon: 'clock',
    sassyExamples: [
      {
        title: 'Kiến thức sắp bốc hơi! ⏰',
        body: 'Chỉ còn {time_left} nữa là ô ({x}, {y}) bay màu, đừng để công sức cày cuốc trôi sông!'
      },
      {
        title: 'Báo động đỏ lãnh thổ! 🔥',
        body: 'Ô ({x}, {y}) đang kêu cứu! Còn {time_left} để cứu vãn trước khi thành đất hoang!'
      }
    ]
  },
  {
    id: 'terr_shared_start',
    category: 'territory',
    target: 'all',
    titleTemplate: 'Ô Tri Thức Chung xuất hiện!',
    bodyTemplate: '{enemy_school} mở Ô Tri Thức Chung tại ({x}, {y})!',
    icon: 'swords',
    sassyExamples: [
      {
        title: 'Kèo thơm hay bẫy đây? ⚔️',
        body: '{enemy_school} vừa mở Ô Tri Thức Chung ở ({x}, {y}), không vào húp nhanh là mất phần!'
      },
      {
        title: 'Chiến trường khai mở! 💥',
        body: 'Tọa độ ({x}, {y}) đang rực lửa vì {enemy_school}. Mau tới tranh giành nào!'
      }
    ]
  },
  {
    id: 'terr_lost',
    category: 'territory',
    target: 'school',
    titleTemplate: 'Lãnh thổ bị chiếm đóng!',
    bodyTemplate: 'Mất ô ({x}, {y}) vào tay {enemy_school}!',
    icon: 'shield-broken',
    sassyExamples: [
      {
        title: 'Mất đất rồi anh em ơi! 😭',
        body: 'Ô ({x}, {y}) vừa bị {enemy_school} nẫng tay trên. Chuẩn bị lập đội đi đòi lại!'
      },
      {
        title: 'Cay đắng quá đi! 💢',
        body: '{enemy_school} vừa cướp ô ({x}, {y}) ngay trước mũi. Báo thù ngay thôi!'
      }
    ]
  },
  {
    id: 'terr_saved',
    category: 'territory',
    target: 'school',
    titleTemplate: 'Giải cứu lãnh thổ thành công!',
    bodyTemplate: '{student_name} vừa ôn bài giải cứu ô ({x}, {y}) kịp thời!',
    icon: 'shield-check',
    sassyExamples: [
      {
        title: 'Cứu tinh xuất hiện! 🛡️',
        body: '{student_name} vừa gánh team cực mạnh, cứu nguy ô ({x}, {y}) trong gang tấc!'
      },
      {
        title: '10 điểm không có nhưng! ✨',
        body: '{student_name} ôn bài chuẩn chỉnh, giữ vững ô ({x}, {y}) cho trường ta!'
      }
    ]
  },
  {
    id: 'terr_cluster_cut',
    category: 'territory',
    target: 'school',
    titleTemplate: 'Cụm lãnh thổ bị cô lập!',
    bodyTemplate: 'Cụm lãnh thổ tại ({x}, {y}) đã bị cô lập khỏi HQ!',
    icon: 'scissors',
    sassyExamples: [
      {
        title: 'Bị chia cắt rồi! ✂️',
        body: 'Tuyến đường về HQ tại ({x}, {y}) đã bị đứt gãy, mau nối lại trước khi cụm đất biến mất!'
      },
      {
        title: 'Ốc đảo lạc lõng! 🏝️',
        body: 'Ô ({x}, {y}) cùng các đồng đội đang bị cô lập. Mau mở đường tiếp ứng!'
      }
    ]
  },

  // --- Landmark Category ---
  {
    id: 'lm_overtake_warn',
    category: 'landmark',
    target: 'school',
    titleTemplate: 'Báo động: Nguy cơ mất Đèn hiệu!',
    bodyTemplate: '{landmark_name} sắp bị {enemy_school} cướp đèn hiệu!',
    icon: 'flame',
    sassyExamples: [
      {
        title: 'Giữ đèn khẩn cấp! 🚨',
        body: '{enemy_school} đang dí sát {landmark_name}, mau nạp thêm tinh thể kẻo mất trắng!'
      },
      {
        title: 'Báo động cấp 1! ⚠️',
        body: 'Đèn hiệu {landmark_name} rung lắc dữ dội trước bước tiến của {enemy_school}!'
      }
    ]
  },
  {
    id: 'lm_lit_success',
    category: 'landmark',
    target: 'all',
    titleTemplate: 'Thắp sáng Đèn hiệu thành công!',
    bodyTemplate: '{landmark_name} đã thắp sáng thành công!',
    icon: 'award',
    sassyExamples: [
      {
        title: 'Hào quang rực rỡ! 🌟',
        body: '{landmark_name} đã rực sáng dưới màu cờ sắc áo trường mình. Đỉnh nóc kịch trần!'
      },
      {
        title: 'Chiến thắng vang dội! 👑',
        body: 'Đèn hiệu {landmark_name} chính thức bùng nổ, buff sức mạnh toàn trường!'
      }
    ]
  },
  {
    id: 'lm_usurped',
    category: 'landmark',
    target: 'school',
    titleTemplate: 'Mất Đèn hiệu!',
    bodyTemplate: 'Mất Đèn hiệu {landmark_name} vào tay {enemy_school}!',
    icon: 'zap-off',
    sassyExamples: [
      {
        title: 'Bị cướp mất hào quang! 💔',
        body: '{enemy_school} vừa soán ngôi tại {landmark_name}. Tập hợp quân lực đòi lại nào!'
      },
      {
        title: 'Mất đèn vào tay giặc! 😤',
        body: '{landmark_name} vừa rơi vào tay {enemy_school}. Chuẩn bị tinh thể phục thù!'
      }
    ]
  },
  {
    id: 'lm_guess_cooldown',
    category: 'landmark',
    target: 'personal',
    titleTemplate: 'Hồi chiêu giải đố sẵn sàng!',
    bodyTemplate: 'Hồi chiêu giải đố {landmark_name} đã sẵn sàng!',
    icon: 'hourglass',
    sassyExamples: [
      {
        title: 'Não đã hồi mana! 🧠',
        body: '10 phút hồi chiêu tại {landmark_name} đã hết, quay lại gỡ gạc danh dự đi nào!'
      },
      {
        title: 'Lượt đoán mới đã mở! 💡',
        body: 'Lần này chắc chắn đoán trúng {landmark_name}, vào việc thôi!'
      }
    ]
  },
  {
    id: 'lm_guess_correct',
    category: 'landmark',
    target: 'school',
    titleTemplate: 'Giải đố thành công!',
    bodyTemplate: '{student_name} vừa giải đúng {landmark_name} (+10 tinh thể)!',
    icon: 'check-circle',
    sassyExamples: [
      {
        title: 'Thần đồng lộ diện! 🎓',
        body: '{student_name} hack não thành công {landmark_name}, gom về ngay 10 tinh thể cho trường!'
      },
      {
        title: 'Kiến thức uyên bác! 💎',
        body: '{student_name} trả lời chuẩn không cần chỉnh câu đố tại {landmark_name}!'
      }
    ]
  },

  // --- Gacha Category ---
  {
    id: 'gacha_ready',
    category: 'gacha',
    target: 'personal',
    titleTemplate: 'Trạm tiếp tế đã hồi!',
    bodyTemplate: 'Trạm tiếp tế {chest_tier} đã hồi lượt quay!',
    icon: 'gift',
    sassyExamples: [
      {
        title: 'Hàng về hàng về! 🎁',
        body: 'Trạm {chest_tier} đã sẵn sàng phát quà, vào gacha đổi đời ngay thôi!'
      },
      {
        title: 'Lượt quay miễn phí chờ bạn! 🎰',
        body: 'Đừng để trạm {chest_tier} mốc meo, vào hốt quà ngay nào!'
      }
    ]
  },
  {
    id: 'real_gift_viral',
    category: 'gacha',
    target: 'all',
    titleTemplate: 'Trúng quà hiện vật khủng!',
    bodyTemplate: '{student_name} vừa trúng {gift_name} từ rương {chest_tier}!',
    icon: 'sparkles',
    sassyExamples: [
      {
        title: 'Nhân phẩm cực hạn! 🎉',
        body: 'Xin chúc mừng {student_name} vừa ẵm trọn {gift_name} từ rương {chest_tier}, uy tín luôn!'
      },
      {
        title: 'Bàn tay vàng trong làng gacha! 🏆',
        body: '{student_name} vừa rinh {gift_name} từ rương {chest_tier}. Quá đã!'
      }
    ]
  },
  {
    id: 'map_found',
    category: 'gacha',
    target: 'personal',
    titleTemplate: 'Tìm thấy Bản đồ kho báu!',
    bodyTemplate: 'Bản đồ kho báu định vị rương {chest_tier} tại ({x}, {y})!',
    icon: 'map',
    sassyExamples: [
      {
        title: 'Kho báu được khai mở! 🗺️',
        body: 'Tọa độ bí mật ({x}, {y}) chứa rương {chest_tier} đã lộ diện, nhanh chân tới mở!'
      },
      {
        title: 'Vết tích kho báu! 🧭',
        body: 'Tấm bản đồ chỉ lối tới rương {chest_tier} ở ({x}, {y}). Đi săn ngay!'
      }
    ]
  },
  {
    id: 'key_found',
    category: 'gacha',
    target: 'personal',
    titleTemplate: 'Nhặt được Chìa khóa!',
    bodyTemplate: 'Nhặt được chìa khóa {chest_tier}!',
    icon: 'key',
    sassyExamples: [
      {
        title: 'Chìa khóa trao tay! 🗝️',
        body: 'Chìa khóa {chest_tier} sáng loáng đã vào túi, rương báu đang chờ bạn mở!'
      },
      {
        title: 'Vận may gõ cửa! 🍀',
        body: 'Chìa khóa {chest_tier} xịn sò đã thuộc về bạn, đi tìm rương tương ứng thôi!'
      }
    ]
  },

  // --- Rank Category ---
  {
    id: 'rank_up',
    category: 'rank',
    target: 'school',
    titleTemplate: 'Thăng hạng bảng xếp hạng!',
    bodyTemplate: '{my_school} leo lên Top {rank}!',
    icon: 'trending-up',
    sassyExamples: [
      {
        title: 'Lên đỉnh bảng vàng! 🚀',
        body: '{my_school} vừa leo thẳng lên Top {rank}! Giữ vững phong độ anh em ơi!'
      },
      {
        title: 'Tăng tốc thần sầu! 🏎️',
        body: 'Vị trí Top {rank} nay đã thuộc về {my_school}. Tiến lên vị trí số 1!'
      }
    ]
  },
  {
    id: 'rank_down',
    category: 'rank',
    target: 'school',
    titleTemplate: 'Cảnh báo tụt hạng!',
    bodyTemplate: '{enemy_school} đẩy {my_school} xuống Top {rank}!',
    icon: 'trending-down',
    sassyExamples: [
      {
        title: 'Bị đá đít đau đớn! 📉',
        body: '{enemy_school} vừa vượt mặt đẩy chúng ta xuống Top {rank}, chạy bộ ôn bài lấy lại ngay!'
      },
      {
        title: 'Không thể ngồi yên! ⚡',
        body: '{my_school} bị rớt xuống Top {rank} vì {enemy_school}. Cùng nhau quật khởi nào!'
      }
    ]
  },
  {
    id: 'rank_gap',
    category: 'rank',
    target: 'school',
    titleTemplate: 'Khoảng cách thứ hạng!',
    bodyTemplate: 'Chỉ còn kém {enemy_school} đúng {delta_points} điểm!',
    icon: 'target',
    sassyExamples: [
      {
        title: 'Thở phả vào gáy đối thủ! 🔥',
        body: 'Chỉ còn cách {enemy_school} đúng {delta_points} điểm, một cú nước rút là vượt!'
      },
      {
        title: 'Bám đuổi nghẹt thở! 🏃',
        body: 'Khoảng cách với {enemy_school} chỉ là {delta_points} điểm. Cơ hội bứt phá trong tầm tay!'
      }
    ]
  },
  {
    id: 'running_points',
    category: 'rank',
    target: 'personal',
    titleTemplate: 'Điểm chạy bộ đã về ví!',
    bodyTemplate: '+{added_points} Điểm từ {km} km chạy bộ đã về ví!',
    icon: 'zap',
    sassyExamples: [
      {
        title: 'Mồ hôi đổi thành điểm! 🏃💨',
        body: '{km} km vừa qua đã đổi về +{added_points} điểm ngon lành cành đào!'
      },
      {
        title: 'Đôi chân biết hái ra điểm! 👟',
        body: 'Hoàn thành {km} km nhận ngay +{added_points} điểm. Tiếp tục duy trì nào!'
      }
    ]
  },

  // --- Extended Gameplay Event Notifications ---
  {
    id: 'terr_captured',
    category: 'territory',
    target: 'all',
    titleTemplate: 'Ô Tri Thức mới được khai phá!',
    bodyTemplate: '{student_name} ({my_school}) vừa khai phá ô tri thức tại ({x}, {y})!',
    icon: 'flag',
    sassyExamples: [
      {
        title: 'Cắm cờ mở cõi! 🚩',
        body: '{student_name} mang màu cờ {my_school} cắm thẳng vào ô ({x}, {y})!'
      }
    ]
  },
  {
    id: 'terr_enemy_stolen',
    category: 'territory',
    target: 'school',
    titleTemplate: 'Ô tri thức bị đoạt lấy!',
    bodyTemplate: '{enemy_school} đã chiếm ô ({x}, {y}) của {my_school}!',
    icon: 'shield-broken',
    sassyExamples: [
      {
        title: 'Đất trường ta bị cướp! 🚨',
        body: '{enemy_school} vừa nẫng mất ô ({x}, {y}) của {my_school}. Đòi lại ngay!'
      }
    ]
  },
  {
    id: 'terr_studied',
    category: 'territory',
    target: 'school',
    titleTemplate: 'Ôn bài bảo vệ tri thức!',
    bodyTemplate: '{student_name} vừa ôn bài củng cố ô ({x}, {y})!',
    icon: 'shield-check',
    sassyExamples: [
      {
        title: 'Chăm chỉ là số một! 📚',
        body: '{student_name} vừa buff độ bền tri thức cho ô ({x}, {y}) vững như bàn thạch!'
      }
    ]
  },
  {
    id: 'lm_guessed',
    category: 'landmark',
    target: 'all',
    titleTemplate: 'Giải đố công trình thành công!',
    bodyTemplate: '{student_name} ({my_school}) đã giải đúng bí danh của {landmark_name}!',
    icon: 'check-circle',
    sassyExamples: [
      {
        title: 'IQ vô cực! 🧠💡',
        body: '{student_name} vừa giải đúng {landmark_name}, mang 10 tinh thể về cho {my_school}!'
      }
    ]
  },
  {
    id: 'lm_lit_buff',
    category: 'landmark',
    target: 'all',
    titleTemplate: 'Đèn hiệu rực sáng buff toàn trường!',
    bodyTemplate: '{landmark_name} đã được {my_school} thắp sáng thành công!',
    icon: 'award',
    sassyExamples: [
      {
        title: 'Toàn trường nhận buff! ⚡🌟',
        body: '{my_school} chính thức làm chủ Đèn hiệu {landmark_name}. Bật chế độ tăng tốc điểm!'
      }
    ]
  },
  {
    id: 'lm_under_attack',
    category: 'landmark',
    target: 'school',
    titleTemplate: 'Đèn hiệu bị tranh chấp gay gắt!',
    bodyTemplate: '{enemy_school} đang nạp dồn tinh thể tranh chấp Đèn hiệu {landmark_name}!',
    icon: 'flame',
    sassyExamples: [
      {
        title: 'Giữ đèn khẩn cấp! 🚨',
        body: '{enemy_school} đang dồn quân nạp đè {landmark_name}. Anh em vào tiếp tế tinh thể gấp!'
      }
    ]
  },
  {
    id: 'chest_opened_big',
    category: 'chest',
    target: 'all',
    titleTemplate: 'Mở rương trúng thưởng khủng!',
    bodyTemplate: '{student_name} vừa mở rương {chest_tier} nhận được {gift_name}!',
    icon: 'package',
    sassyExamples: [
      {
        title: 'Kho báu thức giấc! 💎',
        body: '{student_name} vừa mở rương {chest_tier} nổ hũ {gift_name} cực chất!'
      }
    ]
  },
  {
    id: 'chest_real_gift',
    category: 'chest',
    target: 'all',
    titleTemplate: 'TRÚNG QUÀ THẬT SIÊU PHẨM!',
    bodyTemplate: '{student_name} ({my_school}) vừa trúng {gift_name} cực xịn!',
    icon: 'sparkles',
    sassyExamples: [
      {
        title: 'Nhân phẩm chói lóa! 🎁',
        body: 'Quà thật {gift_name} đã thuộc về {student_name} ({my_school}). Cả server chúc mừng!'
      }
    ]
  },
  {
    id: 'unistop_ready',
    category: 'chest',
    target: 'personal',
    titleTemplate: 'Trạm tiếp tế đã sẵn sàng!',
    bodyTemplate: 'Trạm tiếp tế {chest_tier} đã hồi lượt: {time_left}!',
    icon: 'gift',
    sassyExamples: [
      {
        title: 'Đến giờ hốt quà! 🎰',
        body: 'Trạm {chest_tier} đã sẵn sàng tiếp tế ({time_left}). Nhanh chân tới gacha nào!'
      }
    ]
  },
  {
    id: 'rank_lead',
    category: 'ranking',
    target: 'all',
    titleTemplate: 'Bứt phá vươn lên dẫn đầu!',
    bodyTemplate: '{my_school} đã vươn lên dẫn đầu bảng xếp hạng (+{delta_points} điểm)!',
    icon: 'trending-up',
    sassyExamples: [
      {
        title: 'Ngôi vương đổi chủ! 👑',
        body: '{my_school} đã xuất sắc vượt lên Top 1 với cách biệt +{delta_points} điểm!'
      }
    ]
  }
];

/**
 * Replace placeholders in template text with actual values.
 * Placeholders are in format `{key}`.
 */
export function formatNotificationText(templateText: string, vars: Record<string, any>): string {
  if (!templateText) return '';
  let result = templateText;
  for (const [key, val] of Object.entries(vars)) {
    result = result.replaceAll(`{${key}}`, val !== undefined && val !== null ? String(val) : '');
  }
  return result;
}

/**
 * Find notification template by id.
 */
export function getNotificationTemplate(id: string): NotificationTemplate | undefined {
  return DEFAULT_NOTIFICATIONS.find((t) => t.id === id);
}
