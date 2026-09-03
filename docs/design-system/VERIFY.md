# VERIFY — làm sao biết FE build ra "giống design"

Quy trình tự kiểm cho Claude Code sau khi port mỗi screen. Design HTML trong
`ui_kits/` là visual truth; file này định nghĩa "giống" một cách đo được.

## 1 · Render cả hai phía

- **Reference:** mở `ui_kits/<surface>/<Screen>.html` trực tiếp bằng Playwright/
  browser (file tĩnh, chạy bằng `_ds_bundle.js` sẵn trong repo design — không cần
  build). Viewport chuẩn: **1440×900** (floor của kit là 1024px).
- **Built:** chạy dev server của codebase thật, mở route tương ứng
  (`ui_kits/screen-manifest.json` → `route`), cùng viewport, đợi fonts load
  (`document.fonts.ready`).
- Nếu có ảnh chuẩn trong `screenshots/reference/` thì diff với ảnh đó thay vì
  render lại reference.

## 2 · Screenshot diff

Playwright: `page.screenshot()` cả hai → so bằng `pixelmatch` (threshold 0.1).
Vùng lệch chấp nhận được: nội dung data thật khác fixture, ảnh sản phẩm,
timestamp. Vùng KHÔNG chấp nhận: lệch layout, sai màu token, sai font/cỡ chữ,
thiếu Craft Cut / Wood Rings, đổ bóng khác.

## 3 · Checklist đo được (per screen)

Token & màu:
- [ ] Mọi màu resolve về token trong `tokens.json` — không có hex lạ ngoài 7 màu canonical và các ramp của chúng (grep hex trong code build ra).
- [ ] Status dùng `STATUS_TONES` — đúng cặp bg/fg đã verify contrast; KHÔNG dùng `theme`/`color` literals từ `metadata.ts` của BE.
- [ ] Nền trang đúng surface class: seller = sky field + cream shell; admin = white ground + đúng 1 sky element; không trang nào "trắng toàn phần + nút xanh".

Type:
- [ ] 3 font đúng: Baloo 2 (display/KPI/page title) · Nunito Sans (UI/body) · IBM Plex Mono (ID/SKU/tracking/money). Computed `font-family` kiểm bằng JS, không nhìn bằng mắt.
- [ ] Cỡ chữ khớp scale: page title 44px (admin 32px), KPI 32px, UI 14px, dense 13px, label 12px, table header 11px caps.
- [ ] Hero title trên sky là CREAM, không phải navy.

Layout & spacing:
- [ ] Content max 1280px (marketing 1200px), nav 64px, table row 56px (dense 48px), controls 32/40/48px — đo bằng `getBoundingClientRect`.
- [ ] Radius: control 10px, card/surface 14px, badge/chip/nav pill = pill.
- [ ] Card: trắng, hairline 8% navy, `--shadow-xs` — không left-border màu, không card lồng 3 lớp.

Hành vi & trạng thái:
- [ ] Hover/press/focus đúng hợp đồng (darken, scale .98, ring 3px Action Blue) — focus ring không bao giờ bị remove.
- [ ] Đủ 4 trạng thái theo `STATES.md`: loading (Skeleton/LoadingState) · empty (EmptyState với copy thật) · error · no-permission.
- [ ] `prefers-reduced-motion` tắt animation.

Data binding:
- [ ] Endpoint đúng `BE_ALIGNMENT.md` §3; vocabulary enum verbatim (`ORDER_STATUS`, `Ticket*`, không dịch).
- [ ] Field DOMAIN-BOUND vẫn là placeholder có chú thích — không fabricate.
- [ ] Chart không zero-fill client-side; `tracking_status` chỉ theme 4 giá trị chuẩn hoá.

## 4 · Ngưỡng đạt

Screen được coi là ĐẠT khi: pixel diff < 2% (sau khi mask vùng data), checklist
trên xanh hết, và mắt thường không phân biệt được reference với build ở 1440px.
Chưa đạt → sửa build, không bao giờ "sửa" reference cho khớp.
