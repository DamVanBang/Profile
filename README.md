# ĐÀM VĂN BẰNG — Scrollytelling Showcase v2 "Total Immersion" (damvanbang.sunbii.vn)

Trang profile **rebuild hoàn toàn** theo phong cách *Immersive WebGL Scrollytelling* tham chiếu
**Active Theory / Lusion / Igloo Inc** — dùng để **trình diễn hiệu ứng** và làm trang cá nhân
chính thức của Đàm Văn Bằng — sáng lập SUNBII Technology.

## 8 hệ thống hiệu ứng

| # | Hệ thống | Chi tiết |
|---|----------|----------|
| 1 | **Intro điện ảnh** | Preloader → wordmark `SUNBII // DVB` reveal → camera lao từ z=120 xuyên qua đám hạt hỗn loạn (noise 6.5→2.4) vào hero. Cuộn bị khoá đến khi intro xong. |
| 2 | **20.000 hạt GPU morphing** | 6 hình thái: chữ `BẰNG` → thiên hà → torus knot → xoắn kép ADN → ngôi sao Việt → hành tinh. Simplex 3D noise bùng mạnh giữa các chuyển cảnh. |
| 3 | **Liquid field** | Nền aurora fbm-noise 4 octave phản ứng chuột + vận tốc cuộn, đổi màu theo chương (shader riêng, chất Lusion). |
| 4 | **Mouse trail GPU** | Dòng ~900 hạt vàng→đỏ theo con trỏ, tái sinh liên tục (đặc sản Active Theory). |
| 5 | **Click shockwave** | Click anywhere → sóng xung kích lan qua hệ hạt trong vertex shader (`uClick`/`uClickTime`). |
| 6 | **InstancedMesh shards** | ~220 khối octahedron wireframe trôi nổi, parallax theo chuột, hiện/tan theo từng chương (chất Igloo). |
| 7 | **Camera điện ảnh** | CatmullRomCurve3 qua 6 chương + FOV warp theo vận tốc + xoay group theo chương. |
| 8 | **Menu fullscreen + kinetic strips** | Menu type khổng lồ stagger, 2 marquee outline chữ chạy theo vận tốc + skew. |

Post-processing: UnrealBloom + pass tùy chỉnh (tán sắc theo vận tốc, vignette, film grain).
Kinetic typography: masked line reveal, skew theo vận tốc, cursor tuỳ biến, nút magnetic.

## Chuẩn hiệu năng

- DPR ≤ 2 + adaptive: FPS < 48 liên tục → hạ DPR, giảm bloom. **Tự phục hồi kích thước** khi
  webview/pane mở với viewport 0.
- `renderer.compile()` trong preloader; tự kiểm tra kích thước buffer mỗi 30 frame.
- Draw calls ~16–20/frame; mọi geometry/material `.dispose()` khi rời trang.
- `ScrollTrigger.config({ ignoreMobileResize: true })`, đơn vị `100svh`.
- Mobile: 9.000 hạt · 400 trail · 90 shards · bloom nhẹ. `prefers-reduced-motion`: tắt intro
  nhanh + bỏ turbulence + bỏ trail/shards. No-WebGL: fallback gradient + noscript.

## Cấu trúc

```
damvanbang/
├── index.html        # DOM layer + intro + menu overlay + importmap (three r160)
├── css/style.css     # Dual-layer, rail, menu, strips, cursor
├── js/app.js         # Engine 8 hệ thống + shaders GLSL
└── README.md
```

Không cần build step — deploy trực tiếp thư mục này.

## Deploy lên Git server

```bash
cd damvanbang
git init
git add -A
git commit -m "feat: damvanbang v2 — total immersion scrollytelling"
git remote add origin <URL_GIT_SERVER_CUA_BAN>
git push -u origin main
```

## Điều chỉnh nhanh

- **Đổi chữ hạt**: `buildTargets()` → mục T0 (`fillText('BẰNG', ...)`).
- **Đổi màu từng chương**: mảng `PALETTES`; độ nổi mảnh khối: `SHARD_VIS`.
- **Quỹ đạo camera**: mảng `camPts` / `tgtCurve`.
- **Cường độ**: `uNoiseAmp` (2.4), `SHARD_VIS`, `SPIN_AMP`, tốc độ strip trong ticker.
- **Debug**: `window.__dvb.info()` (draw calls), `__dvb.uniforms()`, `__dvb.shaderErrors()`, `window.__lenis`.
