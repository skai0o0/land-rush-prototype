# DHQG Land Rush

Dự án chiến thuật thời gian thực (RTS) quy mô lớn mô phỏng cuộc tranh hùng lãnh thổ giữa các trường thuộc Đại học Quốc gia TP.HCM.

## Kiến trúc Hệ thống
- **Architecture**: Monorepo Lite
- **Server**: Node.js + Colyseus.js + Express (cổng 2567)
- **Client**: Vite + Three.js + Procedural Voxel Nature (cổng 5173)
- **Shared**: Chia sẻ danh mục trường (`schools.ts`), công trình biểu tượng (`landmarks.ts`), và data types.
- **UI**: 100% SVG Tactical HUD, mini-map radar, student action dock, devtools 1x-50x.

## Cài đặt & Khởi chạy

### 1. Cài đặt dependencies
```bash
# Cài đặt tại root
npm install

# Cài đặt server
cd server && npm install && cd ..

# Cài đặt client
cd client && npm install && cd ..
```

### 2. Khởi chạy song song Server & Client
```bash
npm run dev
```
- Server: `ws://localhost:2567` (HTTP health check tại `http://localhost:2567/health`)
- Client Web App: `http://localhost:5173/`

### 3. Build Production
```bash
npm run build
```

### 4. Tạo mô hình 3D (.glb) bằng Blender Headless (nếu cần sinh lại asset)
```bash
npm run assets:generate
```
