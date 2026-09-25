# 🏰 Land Rush Prototype - Comprehensive Walkthrough & Testing Guide

> **Real-time Multiplayer 3D Territory Conquest Platform**  
> Dự án mô phỏng tác chiến bản đồ lãnh thổ thời gian thực cho sinh viên Đại học Quốc gia TP.HCM (ĐHQG-HCM) kết hợp dữ liệu chạy bộ (Running Database / Strava).

---

## 1. Tổng Quan Dự Án (Project Overview)

**Land Rush Prototype** là một trò chơi chiến thuật chinh phục lãnh thổ trực tuyến 3D thời gian thực đa người chơi trên nền web. Người chơi đại diện cho 7 trường thành viên ĐHQG-HCM:
1. **HCMUT** (Đại học Bách Khoa) - Đỏ Bách Khoa `#d32f2f`
2. **HCMUS** (Đại học Khoa học Tự nhiên) - Xanh Dương `#1976d2`
3. **UIT** (Đại học Công nghệ Thông tin) - Cam Kỹ Thuật `#f57c00`
4. **USSH** (Đại học KHXH&NV) - Tím Xã Hội `#7b1fa2`
5. **UEL** (Đại học Kinh tế - Luật) - Xanh Lục Kinh Tế `#388e3c`
6. **IU** (Đại học Quốc tế) - Vàng Gold `#fbc02d`
7. **AGU** (Đại học An Giang) - Xanh Biển Phù Sa `#0097a7`

### Cơ chế cốt lõi:
- **Tích điểm từ chạy bộ (Running to Conquer):** 1 km chạy bộ tương ứng 10 điểm hành động. Sinh viên dùng điểm để chiếm đất (Claim), gia cố công sự (Fortify) và đóng quân phòng thủ (Deploy).
- **Quy mô bản đồ:** Grid 1000 × 1000 ô (1.000.000 tiles) với địa hình procedural 3D Simplex noise, sông ngòi, thảm thực vật đa tầng, các Landmark trọng điểm (Hồ Đá, Nhà Điều Hành, KTX...) và 7 Tổng Hành Dinh (HQ).
- **Mạng đa người chơi thời gian thực:** Kết nối thông qua Colyseus Server, đồng bộ state nhị phân hiệu năng cao, chunk-based delta update.

---

## 2. Kiến Trúc Hệ Thống (System Architecture)

```
┌────────────────────────────────────────────────────────────────────────┐
│                        LAND RUSH CLIENT (Vite + TS)                   │
├──────────────────┬──────────────────┬──────────────────────────────────┤
│    Rendering     │    Engine/Logic  │               UI                 │
│  Three.js Scene  │ ChunkGridManager │ Modern Cyber HUD (StatsOverlay)  │
│  CameraControls  │ NatureGrid       │ 3-Mode Action Dock (One-Click)   │
│  ModelLoader     │ BorderFlagMgr    │ MiniMap & TileTooltip            │
│  InstancedMesh   │ MegaEmblemMgr    │ DevToolsPanel & Simulation Dropdown │
└─────────┬────────┴────────┬─────────┴────────────────┬─────────────────┘
          │                 │                          │
          ▼                 ▼                          ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   ColyseusClient (WebSocket Client)                    │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ ws://localhost:2567
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   COLYSEUS SERVER (Node.js + TS)                       │
├───────────────────────────────────┬────────────────────────────────────┤
│            CampusRoom             │              BotManager            │
│  - 1000x1000 Tile State           │  - Multi-School AI Agents          │
│  - Chunked Area Sync (50x50)      │  - Adjacency Frontier Validation   │
│  - Landmark Control & Combat      │  - Coordinated Push & Expansion    │
├───────────────────────────────────┴────────────────────────────────────┤
│           TerritoryClusterEngine (Shared Core Logic)                   │
│  - BFS Breadth-First-Search Cluster Detection (TypedArrays)            │
│  - Bastion Activation (10x10 Cluster -> Tier 4 + Border Flags)        │
│  - Mega Emblem Activation (100x100 Cluster -> Tier 6 + School Crest)  │
│  - Breach Detection & Degradation Cascade                              │
└────────────────────────────────────────────────────────────────────────┘
```

### Chi tiết các hệ thống con:
1. **Three.js Renderer & SceneManager (`client/src/engine/`):**
   - Quản lý WebGL rendering loop, PBR lighting, bóng đổ shadow cascades, và OrbitControls với camera bay mượt mà (`flyToCoords`).
   - Cung cấp 3 cấp đồ họa: **60 FPS** (Performance), **Balanced** (Mặc định), **Cao Cấp** (High shadows & anti-aliasing).
2. **Colyseus Client / Server (`CampusRoom.ts` & `colyseusClient.ts`):**
   - Xử lý các phòng game thời gian thực với schema `@colyseus/schema`.
   - Giảm tải băng thông bằng kỹ thuật viewport chunking (chỉ đồng bộ ô đất trong bán kính nhìn thấy của client).
3. **TerritoryClusterEngine (`shared/engine/territoryClusterEngine.ts`):**
   - Chạy BFS cực nhanh trên cấu trúc dữ liệu phẳng `Uint8Array` (1 triệu ô đất xử lý dưới ~150ms).
   - Phân tích ranh giới (Border Detection) xác định các cạnh ngoài cùng (Top, Right, Bottom, Left) để đặt cờ biên giới.
   - Nhận diện cấp cụm:
     - **Bastion (Tier 4):** Cụm $\ge 100$ ô có Tier $\ge 3$. Kích hoạt cờ viền.
     - **Mega Emblem (Tier 6):** Cụm $\ge 10.000$ ô. Phủ biểu tượng lớn trường, xoá cờ con bên trong tránh rối mắt.
4. **BorderFlagManager (`client/src/engine/borderFlagManager.ts`):**
   - Sử dụng `THREE.InstancedMesh` kết hợp cọc cờ và lá cờ tam giác low-poly (`vertexColors`).
   - Hỗ trợ tới 20.000 cờ cùng lúc ở 60 FPS. Tự động gắn cờ vào cao độ địa hình (`getTerrainHeight`).
5. **MegaEmblemManager (`client/src/engine/megaEmblemManager.ts`):**
   - Tạo texture huy hiệu phát sáng theo chuẩn màu nhận diện của trường thông qua HTML5 Canvas.
   - Áp PlaneGeometry dạng lớn lên mặt đất với blend mode tối ưu.
6. **BotManager (`server/src/bots/BotManager.ts`):**
   - Quản lý các bot AI đại diện cho các trường, duy trì tập ô biên giới (frontier pool), tuân thủ nghiêm ngặt quy tắc mở rộng liền kề (adjacency rule), đồng bộ tức thời với `TerritoryClusterEngine`.

---

## 3. Các Tính Năng Giao Diện Mới Nhất

### 🎨 Modern Glassmorphism & Cyber-Tactical HUD
- HUD được thiết kế theo phong cách glassmorphism bán trong suốt kết hợp viền neon cyber hiện đại.
- Hiển thị thông tin người chơi: Trường trực thuộc, Điểm tác chiến khả dụng, Chế độ chơi (Normal / Dev), Cảnh báo trạng thái.

### ⚡ 3-Mode Action Dock (One-Click Actions)
Thanh công cụ tác chiến đặt ở cạnh dưới màn hình với 3 chế độ tương tác:
1. **CLAIM (Chiếm Đất):** Chiếm ô đất hoang liền kề với lãnh thổ trường mình (chi phí: 10 điểm).
2. **FORTIFY (Gia Cố):** Nâng cấp cấp độ phòng thủ từ Tier 1 lên Tier 3 (tăng máu và độ bền).
3. **DEPLOY (Đóng Quân):** Điều động thêm binh lực vào các tiền đồn biên giới nhằm chống đỡ bot/địch tấn công.

### 🛠️ Dev Tools Panel & Simulation Dropdown
Một bảng điều khiển nổi bật (có thể thu gọn/mở rộng dạng dropdown) hỗ trợ dev và tester:
- **Chuyển chế độ:** Chuyển đổi linh hoạt giữa `DEV (TỰ DO)` (cho phép chiếm mọi ô đất không giới hạn) và `NORMAL (KHÓA TRƯỜNG)` (chỉ được chiếm đất theo trường của tài khoản và luật liền kề).
- **Bộ chọn tài khoản mẫu (Mock Accounts):** Danh sách đầy đủ sinh viên của 7 trường với số dư km chạy bộ thực tế từ RunningDatabase.
- **Giả lập điểm chạy nhanh:** Nút nạp nhanh `+5 km (50đ)`, `+10 km (100đ)`, `+50 km (500đ)`.
- **Cài đặt hiệu năng:** Chuyển đổi 1-click giữa các cấu hình 60 FPS / Cân Bằng / Cao Cấp.
- **Kịch bản mô phỏng cụm đất (Territory Simulation):**
  - 🚩 **Spawn Bastion (10×10):** Sinh ngay một cụm Bastion 10x10 Max Tier 3 tại HQ, tự động kích hoạt cắm cờ viền và buff Tier 4.
  - 🌟 **Spawn Đại Lãnh Thổ (100×100):** Tạo cụm siêu đô thị 10.000 ô, hiển thị Mega Emblem, ẩn cờ bên trong và buff Tier 6.
  - 💥 **Chọc Thủng Cụm (Breach):** Phá huỷ 1 ô trọng yếu giữa cụm để kiểm tra thuật toán giáng cấp (degradation) và gỡ cờ/emblem tự động.
  - 🛡️ **Max Gia Cố Toàn Bộ Đất:** Nâng cấp tất cả ô đang chiếm đóng lên Tier 3.

---

## 4. Hướng Dẫn Walkthrough Chi Tiết Từng Bước (Step-by-step Feature Walkthrough)

Dưới đây là kịch bản kiểm thử toàn diện dành cho QA Tester, Developer hoặc Automation Tool:

### Bước 1: Khởi động Dev Server
1. Mở terminal tại thư mục gốc của dự án.
2. Chạy lệnh:
   ```bash
   npm run dev
   ```
   *Lệnh này sẽ khởi chạy đồng thời:*
   - **Colyseus Game Server:** Chạy trên cổng `http://localhost:2567` (WebSocket: `ws://localhost:2567`).
   - **Vite Client:** Chạy trên cổng `http://localhost:5173`.
3. Kiểm tra terminal: Đảm bảo cả hai dịch vụ báo `listening` và sẵn sàng nhận kết nối.

### Bước 2: Kết nối phòng game & Spawn nhân vật/camera
1. Mở trình duyệt web (Google Chrome / Brave / Edge) truy cập `http://localhost:5173`.
2. Quan sát màn hình load game:
   - Hệ thống tự động khởi tạo Three.js WebGL canvas.
   - Kết nối WebSocket tới Colyseus room `campus_room`.
   - Camera tự động bay (`flyToCoords`) về vị trí Tổng Hành Dinh (HQ) của trường bạn (mặc định HCMUT hoặc trường theo query param).
3. Kiểm tra HUD góc trên: Thẻ tên sinh viên, trường đại học (màu đỏ HCMUT), số điểm ban đầu.

### Bước 3: Điều khiển di chuyển & khám phá bản đồ
1. **Di chuyển camera (Pan):** Nhấn giữ chuột trái (hoặc chuột phải) và kéo để di chuyển vùng nhìn khắp bản đồ ĐHQG.
2. **Xoay góc nhìn (Orbit):** Giữ phím `Shift` + chuột trái hoặc dùng chuột giữa để xoay góc nghiêng 3D.
3. **Phóng to/Thu nhỏ (Zoom):** Cuộn con lăn chuột hoặc click vào nút `+` / `-` trên MiniMap góc phải.
4. **Trở về căn cứ:** Click vào nút radar/HQ trên MiniMap, camera sẽ mượt mà bay về tọa độ trung tâm trường của bạn.

### Bước 4: Kiểm tra cơ chế chiếm đất (Territory Claim) & Border Flags
1. Chọn chế độ **CLAIM** trên thanh **Action Dock** ở đáy màn hình.
2. Click chuột vào một ô đất nằm liền kề với biên giới đất trường bạn đang có:
   - Một ô lưới sáng lên, màu trường được tô lên mặt đất.
   - Điểm tác chiến bị trừ 10 điểm.
   - Âm thanh/toast thông báo hiển thị thành công.
3. Chuyển sang chế độ **FORTIFY**:
   - Click vào ô đất vừa chiếm 2 lần liên tiếp để nâng lên Tier 2 rồi Tier 3.
   - Bề mặt ô xuất hiện kết cấu công sự kiên cố hơn.

### Bước 5: Thử nghiệm Action Dock 3 chế độ trên HUD
1. Nhấp chọn lần lượt 3 nút trên Action Dock:
   - **Chiếm Đất (Claim):** Cho phép chọn ô đất hợp lệ để thâu tóm.
   - **Gia Cố (Fortify):** Cho phép nâng cấp độ bền ô đất.
   - **Đóng Quân (Deploy):** Bổ sung đơn vị quân bảo vệ.
2. Thử click ra ngoài hoặc thao tác sai luật (ví dụ: chiếm ô đất cách xa biên giới khi đang ở Normal Mode) để xác nhận hệ thống hiển thị Toast cảnh báo lỗi rõ ràng.

### Bước 6: Mở Dev Tools Panel & kích hoạt các kịch bản Dev Simulation
1. Click vào nút **Dev Control** (hoặc biểu tượng bánh răng cài đặt) ở góc trên bên phải màn hình để bung menu dropdown.
2. Thử nghiệm các kịch bản mô phỏng nâng cao:
   - **Spawn Bastion (10×10):**
     + Click nút `🚩 Spawn Bastion (10×10)`.
     + Quan sát cụm 100 ô xung quanh HQ được tạo với Tier 4.
     + Hàng rào cờ biên giới (`Border Flags`) bằng cọc cờ 3D màu của trường sẽ xuất hiện bao quanh mép ngoài của cụm.
   - **Spawn Đại Lãnh Thổ (100×100):**
     + Click nút `🌟 Spawn Đại Lãnh Thổ (100×100)`.
     + Quan sát một vùng lãnh thổ khổng lồ 10.000 ô mở rộng.
     + Một biểu tượng huy hiệu trường khổng lồ (`Mega Emblem`) xuất hiện chính giữa khu đất.
     + Toàn bộ cờ biên giới nhỏ bên trong vùng Mega Emblem tự động được dọn dẹp để giữ khung hình sạch sẽ.
   - **Chọc Thủng Cụm (Breach):**
     + Click nút `💥 Chọc Thủng Cụm (Breach)`.
     + Hệ thống tạo ra một điểm đứt gãy ở giữa cụm đất.
     + Quan sát: Thuật toán nhận diện cụm bị phá vỡ, các cờ/emblem cấp cao được gỡ bỏ và hạ bậc phòng thủ xuống mức Tier an toàn tương ứng.
   - **Max Gia Cố Toàn Bộ Đất:**
     + Click `🛡️ Max Gia Cố Toàn Bộ Đất` để đưa tất cả các ô hiện hữu lên Tier 3 tối đa.

### Bước 7: Bật/Tắt Bot AI qua BotManager quan sát tương tác đa người chơi
1. Trong Dev Tools Panel, tìm mục **GIẢ LẬP BOT (TỰ ĐỘNG)**.
2. Click nút **ĐÃ TẮT** để chuyển sang **ĐANG CHẠY**:
   - Máy chủ kích hoạt `BotManager`.
   - Các bot thuộc các trường đối lập (HCMUS, UIT, UEL, USSH, IU, AGU) bắt đầu tự động đánh chiếm các ô đất liền kề xung quanh HQ của chúng.
   - Bản đồ trở nên sôi động với các làn sóng bành trướng lãnh thổ cạnh tranh trực tiếp với người chơi.
3. Quan sát các trận đụng độ biên giới tại các vùng giao tranh (chẳng hạn khu vực Hồ Đá hoặc Trục đường Trung tâm).
4. Click lại nút bot để dừng mô phỏng khi cần kiểm tra tĩnh.

### Bước 8: Kiểm thử nhiều người chơi (Multi-tab)
1. Trong mục **TÀI KHOẢN SINH VIÊN**, chọn một tài khoản thuộc trường khác (ví dụ: Sinh viên UIT).
2. Click nút **Mở tab mới (+)**:
   - Một tab trình duyệt mới sẽ mở với tài khoản và trường UIT.
3. Đặt hai cửa sổ trình duyệt cạnh nhau:
   - Thao tác chiếm đất ở tab 1 (HCMUT) và tab 2 (UIT).
   - Xác nhận rằng mọi thay đổi về đất, cờ biên giới, và điểm số được đồng bộ thời gian thực mượt mà giữa cả hai màn hình.

---

## 5. Danh Mục Lệnh & Kiểm Thử Tự Động (Automation & Verification)

Dự án đi kèm bộ unit tests và integration tests chuẩn TypeScript:

| Lệnh | Mục đích |
| :--- | :--- |
| `npx ts-node server/test/territoryCluster.test.ts` | Kiểm thử thuật toán BFS, kích hoạt Bastion, Border Flags, Mega Emblem và benchmark hiệu năng |
| `npx ts-node server/test/test_bot.ts` | Kiểm thử cơ chế mở rộng tuân thủ biên giới liền kề và đồng bộ trạng thái của BotManager |
| `npx ts-node server/test/test_schema.ts` | Kiểm thử đồng bộ schema Colyseus |
| `npm run build --prefix client` | Kiểm tra TypeScript typecheck và Vite production bundle |
| `npm run build --prefix server` | Biên dịch TypeScript server |

---

*Tài liệu được cập nhật tự động theo quy chuẩn của Land Rush Architecture Team.*
