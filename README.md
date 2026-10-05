# Predator — Hành trình Khám phá

Game khám phá và mở rộng tri thức giữa 5 trường. Các trường cùng giữ tri thức trên một ô, ôn bài độc lập và giao lưu khi vùng tri thức tiếp giáp. Campaign xếp hạng theo số ô tri thức.

## Cài đặt và chạy

```sh
npm install
npm install --prefix server
npm install --prefix client
npm run dev
```

Client: http://localhost:5173; server: http://localhost:2567; health check /health. Giao diện mặc định normal. Có thể chọn sinh viên bằng ?email=student@hcmut.edu.vn&mode=normal; cấp điểm do server quyết định.

Kiểm thử dev: đặt ALLOW_DEV=true cho server và mở ?mode=dev&email=student@hcmut.edu.vn. Không bật ALLOW_DEV trên bản chia sẻ với sinh viên. URL không cấp quyền admin. Map Editor/reset được server kiểm tra bằng ALLOW_DEV hoặc ADMIN_KEY. Đổi mode tải lại trang để không giữ UI dev trong normal.

## Build, test và chạy bản xuất

```sh
npm test
npm run build
npm run start --prefix server
```

Test gồm gameplay, security, profile, notification/event, protocol và đồng bộ bản đồ. Benchmark hiệu năng tách khỏi correctness test. Build server xóa output cũ trước khi biên dịch. Start chạy JavaScript đã build; dev chạy server tự reload.

npm run start:unified build rồi phục vụ client/WebSocket chung cổng 2567. PORT thay cổng server. Giữ tunnel quick/named cho demo; không commit token hoặc .env.

## Luật đã chốt

- Khám phá/ôn bài: 1 điểm; giao lưu vào ô có trường khác: 3 điểm, phải tiếp giáp.
- Tri thức về 0 ở 22 giờ; mỗi trường decay riêng, không có deadline chuyển chủ toàn ô.
- UniStop: chủ là trường tới trước, thu hồi khi chủ không còn ô tri thức trong trạm; cooldown sinh viên/trạm.
- Chest: không chủ, tiêu thụ một lần toàn cục; cần key đúng tier và vùng tri thức chạm rương.
- Beacon: 1000 tinh thể, trường sau cần vượt mốc chủ thêm 5%; puzzle thưởng 10% mốc của trường mình.
- Xác suất Aspire/Nitro/Predator và chest giữ nguyên trong shared/constants/unistops.ts.

## Model Bách Khoa

Chỉ giữ client/public/models/hqs/hcmut_hq.glb. Trường khác/công trình dùng hình dựng hiện có, không yêu cầu GLB không tồn tại. Giữ nguồn HCMUT tại scripts/generators/hqs và Blender H1 tham khảo tại assets/new_assets.

```sh
npm run assets:verify
# Chỉ khi chủ động tạo lại model; cần Blender và Python:
npm run assets:generate
```

Cleanup không tạo lại/sửa model Bách Khoa. Manifest chỉ chứa HCMUT. Giữ Draco decoder tải model nén; trình duyệt không cần encoder.

## Trạng thái tích hợp

Nguồn điểm chạy/quà và pool buff chưa chốt với đối tác vẫn là adapter/placeholder. Notifications là JS/toast trong game. Không có bot trong runtime hoặc benchmark result dùng làm cam kết capacity.

Xem [kiến trúc hiện tại](docs/architecture.md) về data shape và compatibility còn giữ. File lịch sử đã lưu riêng trước cleanup; không rewrite lịch sử Git.
