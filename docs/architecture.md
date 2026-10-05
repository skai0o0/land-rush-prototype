# Hành trình Khám phá — kiến trúc hiện tại

Server Colyseus quyết định gameplay và tài nguyên. Client Three.js hiển thị bản đồ, dự đoán thao tác và nhận kết quả/profile từ server. Shared chứa roster 5 trường, 10 công trình, footprint, cân bằng và protocol.

## Tri thức và đồng bộ

Mỗi ô có knowledge theo trường, retention và timestamp ôn độc lập. Khám phá ô mới tốn 1 điểm; thêm tri thức vào ô có trường khác tốn 3 điểm và phải tiếp giáp vùng tri thức của mình. Tri thức hết ở 22 giờ; ô nền HQ duy trì làm điểm xuất phát. Ranking dựa trên số ô tri thức.

Decay được tính lazily trong các bước xác thực và housekeeping có ngân sách 256 ô/lượt, không quét liên tục 1 triệu ô. ownerId là projection tương thích, không quyết định trường nào có tri thức.

shared/land và server/src/land/landDataPlane.ts gửi snapshot byte map, batch và overlay thưa. knowledge_update/knowledge_sync bổ sung danh sách trường đồng tồn tại để pha màu; seq/epoch bỏ frame lỗi thời. Các trường HP/defense và cluster effect còn là consumer của projection.

## Trạm, rương, công trình

UniStop thuộc trường tới trước; thu hồi khi chủ không còn tri thức hiệu lực trong footprint. Cooldown theo sinh viên/trạm và giữ qua đổi chủ/reconnect. Chest không chủ, mở một lần toàn cục, cần key đúng tier và vùng tri thức chạm footprint. Quà thật giữ eligibility điểm chạy tuần và xác suất đã chốt.

Beacon đầu tiên 1000 tinh thể; trường tiếp theo vượt mốc chủ thêm 5%. Puzzle đúng nhận 10% mục tiêu của trường đó, một lần/trường; đáp án/cooldown được kiểm tra server. BuffDirector có cấu trúc pool động theo lượt/rank/comeback, chưa chốt thêm buff với đối tác.

## Dữ liệu và công cụ dev

ProfileManager quản lý điểm đã tiêu/thưởng, tinh thể, keys và cooldown. RunningPointsProvider vẫn là mock nguồn điểm chạy server. client/src/dev/runningDatabase.ts chỉ tải trong dev mode, không làm ví thẩm quyền trong normal mode. Tích hợp đối tác và persistence cần thiết kế riêng; cleanup không giả định đã có API/database bền vững.

Normal là mặc định. DevTools, database mock, Notification Studio và Map Editor tải riêng bằng dynamic import. Server kiểm tra ALLOW_DEV/ADMIN_KEY; query URL không thay thế phân quyền. Không có bot, bot commands hoặc spectator bot trong runtime. Notifications vẫn là JS/toast; gameplay_event có version/sequence/type/payload để tích hợp sau.

## Asset và tương thích

GLB duy nhất là client/public/models/hqs/hcmut_hq.glb. Trường khác/công trình dùng hình dựng bằng code. ModelLoader chỉ yêu cầu GLB cho HCMUT. Giữ decoder Draco, nguồn tạo HCMUT và Blender H1 tham khảo; không tạo lại model trong cleanup.

Alias personalTroops/schoolTroops, fuel/bonfire và một số frame legacy vẫn phục vụ consumer/test cũ. Chúng không khôi phục tấn công/gia cố hoặc chuyển chủ tri thức. Loại bỏ tiếp cần đổi protocol/consumer đồng bộ và migration rõ ràng. Giữ ownerId, LandState và cluster engine khi còn consumer.
