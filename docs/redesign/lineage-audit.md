# Lineage audit — repo hiện tại

Quét ngày 2026-09-18 trên `hoangmh/lucid-curie-dk5vpa`. Đây là bằng chứng, không
phải phỏng đoán: mỗi dòng đều có đường dẫn hoặc số lượng kiểm chứng được.

Kết luận ngắn: **sanitize tại chỗ không cứu được repo này.** Không phải vì nhiều
chỗ phải sửa, mà vì hai loại dấu vết dưới đây không sửa được bằng cách đổi tên —
lược đồ dữ liệu của hệ thống cũ, và lịch sử Git.

---

## 1. Thương hiệu

| Dấu vết | Số lượng |
|---|---|
| `gwprint` (tên package `@gwprint/*`, script, import) | 221 file |
| `gwp` / `GWP` (token, component, thư mục asset) | 307 file |
| `GoodWoodPrint` / `goodwood` | 22 file |
| `GWPrintz` (tên sau lần đổi thương hiệu thứ hai) | 15 file |
| `opcreative` (tên công ty) | 9 file |

Thương hiệu còn nằm trong cả chuỗi gửi ra ngoài: email mời và mã OTP
(`libs/auth/src/email.ts`), `User-Agent: GWPrintz-Webhook/1.0`, tên người gửi
hàng mặc định khi mua nhãn vận chuyển, và một khối branding hoàn chỉnh cho file
Excel xuất ra (`components/global/theme/brandingSection.ts`).

Tài sản mang thương hiệu: `apps/dashboard/src/app/gwp.theme.css`,
`components/ds/brand/gwp-mark.tsx`, `components/ds/brand/wood-rings.tsx`,
`components/ds/craft-cut.tsx`, `public/gwp/{gwp-favicon,gwp-lockup,gwp-monogram}.svg`,
`support@gwprint.com`.

## 2. Dữ liệu và danh tính thật

| Dấu vết | Vị trí |
|---|---|
| `huyhoang5924@gmail.com` (tài khoản ADMIN seed) | 5 chỗ, trong đó `seed-demo.ts` |
| `niyamvora@gmail.com`, repo `niyamvora/opcreative-team` | `MANGLED-SOURCE-REPORT.md`, seed |
| `maya@demo.opcreative.dev` | seed |
| **33 ảnh catalogue thật** (`custom-name-puzzle-with-animals.webp`, `custom-glass-suncatcher-...webp`, …) | `apps/dashboard/public/products/` |
| 489 đơn hàng thật nhập từ workbook `OP × Xưởng` | commit `512834d`, `import-order-history.ts` |
| Giá VND thật, cột `Pro chuẩn` / `Size chuẩn` / `Giá` / `Ngày` | `import-order-history.ts`, `import-price-list.ts`, `lib/price-list.ts` |
| Google Drive folder id (kho artwork nội bộ) | `backfill-drive-mockups.ts` |

Ảnh trong `public/products/` được trích ra từ bảng giá của công ty
(`extract-price-list-images.ts`) — đó là tài sản của họ, không phải placeholder.

## 3. Lược đồ hệ thống cũ — phần không sanitize được

`libs/db/prisma/scripts/migrate-legacy.sql` (26 KB) và
`migrate-legacy-inventory.sql` (37 KB) chép nguyên tên bảng backend cũ:

```
Orders · TopupTransaction · BasketPosition · Mockups · StockImport
WarehouseInventory · ProductVariants · Variants · Warehouse · ImportMovement
AppConfig · Ticket · Users · Products
```

Cộng với đường dẫn `.archive/oldproject/fulfillment-system-be` và ghi chú vận
hành thật ("API key cũ là plaintext, hash lại để integration hiện tại còn chạy",
"giá cũ là integer, nếu là cents thì đổi PRICE_DIVISOR").

**Đổi tên không cứu được file này.** Nội dung của nó *chính là* thiết kế cơ sở
dữ liệu của công ty. Cách xử lý duy nhất là xoá và không bao giờ port.

## 4. Quy trình nghiệp vụ riêng của công ty

Nằm trong schema, nên rename status sẽ không giấu được:

- `FulfillmentStatus`: `PENDING → ASSIGNED → IN_PRODUCTION → FULFILLED → SHIPPED → DELIVERED` — sơ đồ sàn xưởng của họ, đóng cứng thành enum.
- `BasketPosition` + `BasketPositionStatus` (`AVAILABLE/RESERVED/OCCUPIED/BROKEN`) — khay đựng vật lý tại xưởng.
- `UserRole`: `ADMIN/SELLER/WAREHOUSE/WAREHOUSE_ADMIN/SUPPORT/DESIGNER` — sơ đồ tổ chức của họ mã hoá thành enum, kèm comment nhắc sai lầm cũ `warehouse_external`.
- Ví tiền: nạp tiền → seller upload bằng chứng chuyển khoản → admin duyệt. Đây là quy trình thu tiền của một công ty VN cụ thể.
- `Order` mang sẵn `baseCost / fee / revenue / profit` — bảng P&L của họ.
- Comment trong schema nhắc dữ liệu thật: *"~319 legacy Refund orders"*, *"legacy chạy BA hệ thống tồn kho song song"*.

## 5. Nhà cung cấp và tích hợp nội bộ

`KILOSHIPS_API_KEY`, `KILOSHIPS_API_BASE_URL`, `DRX_API_KEY`, `DRX_WEBHOOK_SECRET`,
`ship.pirateship.com`, `labels/kiloships.ts`, `api/webhooks/drx/route.ts`,
tên key Resend nội bộ (`"Ai_access" key (full account access)`), Google Drive
làm kho artwork. `.env.example` còn trỏ tới tài liệu nội bộ ("doc 05 C5", "doc 05 A1").

## 6. Tài liệu lộ quá trình làm việc

- `docs/MIGRATION-STATUS.md` — "Layers 0–3 done, Layer 4 not started", "nothing has been verified visually".
- `docs/superpowers/MANGLED-SOURCE-REPORT.md` — nêu đích danh repo upstream, md5 của ba file zip, mô tả source bị hỏng do search-and-replace.
- `docs/superpowers/plans/2026-09-03-gwp-ds-migration.md` — chỉ tới file nguồn của design system trên máy cá nhân (`~/Downloads/GoodWoodPrint Fulfillment Design System1.zip`, 561 file) và id project nội bộ.
- `docs/implementation/*.txt` — master plan, runbook cutover legacy.
- `docs/team/old-vs-new.html`, `docs/design-system-migration-report.md`, `docs/huong-dan/**`.
- `CLAUDE.md`, `.claude/` — biến repo thành bản sao đang làm việc, không phải một sản phẩm.

## 7. Lịch sử Git — lý do phải làm repo mới

66 commit. Thuật ngữ bị cấm xuất hiện trong nội dung commit:

| Từ khoá | Số commit chạm vào |
|---|---|
| `gwprint` | 15 |
| `opcreative` | 8 |
| `legacy` | 7 |
| `GoodWoodPrint` | 6 |
| `niyamvora` | 3 |
| `Xưởng` | 3 |
| `huyhoang` | 2 |

Và bản thân thông điệp commit đã kể hết câu chuyện:

```
fcb6681  chore: rebrand OpCreative to GWPrint
dbcc15f  feat(brand): rename the system to GWPrintz and give it its own mark
512834d  feat(orders): import 489 orders of fulfillment history
643401f  docs: migration status at handover — Layers 0-3 done, Layer 4 not started
```

Commit `fcb6681` là bằng chứng quyết định: lần đổi tên **nằm trong lịch sử**. Ai
mở `git log` cũng thấy tên công ty gốc.

## 8. Quy mô hiện tại

37 model Prisma · 37 route · ~73.000 dòng TS/TSX · 7 locale · 30+ migration.

Riêng `Order` có 14 index. Đó là dấu hiệu của một bảng đang gánh việc của bốn
bảng — và cũng là một lý do độc lập để thiết kế lại, không liên quan gì tới
chuyện sanitize.

---

## 9. Kết quả chạy gate

`check-clean-room.sh` chạy trên repo này: **thất bại ở cả 9 hạng mục.**

```
✗ Tên công ty / sản phẩm cũ / con người      (cây làm việc)
✗ Lược đồ hệ thống cũ                        (cây làm việc)
✗ Nhà cung cấp và tích hợp nội bộ            (cây làm việc)
✗ Dấu vết quá trình làm việc                 (cây làm việc)
✗ Email ngoài danh sách cho phép
✗ File dữ liệu / bí mật không được commit
✗ Tên công ty / sản phẩm cũ / con người      (lịch sử Git)
✗ Lược đồ hệ thống cũ                        (lịch sử Git)
✗ Dấu vết quá trình làm việc                 (lịch sử Git)
```

Sáu hạng mục đầu về lý thuyết sửa được bằng cách sửa file. Ba hạng mục cuối thì
không — trừ khi bỏ lịch sử. Đó là toàn bộ lý do tài liệu redesign chọn phương án
repo mới.
