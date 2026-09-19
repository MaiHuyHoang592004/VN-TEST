# Clean-room redesign — từ bản sao nội bộ thành sản phẩm độc lập

Tài liệu này trả lời đúng một câu hỏi: **thiết kế lại thế nào để giữ được kinh
nghiệm kỹ thuật mà không mang theo hệ thống của công ty cũ.**

Bằng chứng về những gì đang còn trong repo: [`lineage-audit.md`](./lineage-audit.md).
Công cụ kiểm tra tự động: [`check-clean-room.sh`](./check-clean-room.sh).

---

## 0. Phép thử duy nhất

> Xoá hết tên riêng đi. Nếu một người từng làm ở công ty cũ mở repo lên và vẫn
> nhận ra hệ thống của họ **qua cấu trúc dữ liệu**, thì chưa đủ.

Phép thử này loại bỏ toàn bộ nhóm giải pháp "đổi tên": `PENDING_1/PENDING_2`,
`gwprint → orderlane`, `BasketPosition → SlotAssignment`. Nó buộc phải đổi *mô
hình*, và đổi mô hình mới là thứ biến repo thành thiết kế của mình.

Hệ quả thực tế: **repo mới, lịch sử mới.** Không `git filter-repo` repo này rồi
public — vì (a) bản clone cũ và file zip vẫn tồn tại, (b) quan trọng hơn, lược
đồ dữ liệu vẫn là của họ nên history sạch cũng không giải quyết được gì.

---

## 1. Sản phẩm mới

**Multi-tenant fulfillment workspace** cho các thương hiệu bán lẻ nhỏ: catalog,
đơn hàng, sản xuất, giao hàng và dòng tiền trong một nơi.

Ba thứ làm nên bản sắc kỹ thuật — và cũng chính là ba thứ khác hẳn bản cũ:

1. **Workflow cấu hình được** — mỗi merchant tự định nghĩa vòng đời đơn hàng, thay vì một enum đóng cứng.
2. **Sổ cái kép (double-entry)** — số dư là phép chiếu từ bút toán bất biến, không phải một cột `balance`.
3. **Import hai pha có preview** — parse → soi trước → commit, idempotent theo nội dung.

CRUD thì ai cũng viết được. Ba thứ trên mới là thứ reviewer đọc.

---

## 2. Tám quyết định thiết kế

| # | Hiện tại (của công ty) | Thiết kế mới | Vì sao vừa khác vừa tốt hơn |
|---|---|---|---|
| 1 | `User.role` 6 giá trị; cô lập dữ liệu bằng `Order.customerId` rải khắp query | `Tenant` + `Membership(user, tenant, role)`; `tenantId` trên mọi bảng, chặn tại **một** Prisma client extension | Sơ đồ tổ chức của một công ty → multi-tenant thật. Quên `where` không còn làm lộ dữ liệu. |
| 2 | `Order` = 1 dòng = 1 sản phẩm (đúng hình dạng file Excel nguồn) | `Order → OrderLine[] → Fulfillment → Shipment` | Mô hình thương mại chuẩn; xử lý được giao từng phần, thứ mô hình cũ không làm được. |
| 3 | `FulfillmentStatus` enum khớp sàn xưởng | `WorkflowDefinition / State / Transition` + engine + log append-only | Từ sơ đồ của một xưởng → một engine. Đây là phần "thiết kế của mình" rõ nhất. |
| 4 | Cột số dư ví + nạp tiền admin duyệt + ảnh chuyển khoản | `LedgerAccount / LedgerTransaction / LedgerEntry` (bất biến, debit = credit) | Quy trình thu tiền của một công ty VN → bất biến kế toán phổ quát. Số dư không bao giờ lệch. |
| 5 | `Product / Variant / ProductVariant / Mockup` (4 tầng — vết sẹo migration) | `Product → Variant(sku)` + `Asset` | 4 tầng đó là di chứng, không phải thiết kế. |
| 6 | `BasketPosition` — khay nhựa trên sàn xưởng | Bỏ. Cần thì `WorkCell { capacity }` generic | Chi tiết vật lý của đúng một nhà xưởng. |
| 7 | `Material / BOM / Vendor / Expense / StockReceipt` (ERP mở rộng) | Cắt. Giữ `StockItem` + `StockMovement` append-only | Portfolio cần chiều sâu, không cần bề rộng. Cắt có chủ đích là một phán đoán kỹ thuật, nói được khi phỏng vấn. |
| 8 | Artwork trên Google Drive; carrier Kiloships/DRX hard-code | `StoragePort` (local/S3) + `CarrierPort` + `FakeCarrier` xác định trước | Clone về là chạy được, không cần tài khoản nào. Demo được ngay — điều repo cũ không làm được. |

---

## 3. Workflow engine — điểm mạnh nhất nên đầu tư

Bản cũ đóng cứng:

```
PENDING → ASSIGNED → IN_PRODUCTION → FULFILLED → SHIPPED → DELIVERED
```

Đây là sơ đồ sàn của họ. Đổi tên các state cũng vẫn là sơ đồ đó. Nên đổi tầng
trừu tượng:

```prisma
model WorkflowDefinition { id, tenantId, key, version, isActive, @@unique([tenantId, key, version]) }
model WorkflowState      { id, definitionId, key, label, kind: INITIAL|ACTIVE|TERMINAL, position }
model WorkflowTransition { id, definitionId, key, fromStateId, toStateId, requiredRole, guards Json }
model WorkflowInstance   { id, definitionId, subjectType, subjectId, currentStateId, @@unique([subjectType, subjectId]) }
model TransitionLog      { id, instanceId, transitionId, actorId, at, payload Json }   // append-only
```

Engine là hàm thuần, không chạm DB:

```ts
type Guard  = (ctx: TransitionContext) => GuardResult          // registry, không phải code trong schema
type Result = { ok: true; next: State } | { ok: false; reason: TransitionError }

function apply(instance, transitionKey, actor, ctx): Result
```

Một transition chỉ hợp lệ khi **cả ba** đúng: có cạnh `from → to` trong
definition, actor có `requiredRole`, và mọi guard trả `pass`. Guard là *dữ liệu*
(`{ kind: "all_lines_have_artwork" }`) được phân giải qua registry — nhờ vậy
nghiệp vụ của bất kỳ ai cũng không bị nhúng vào schema.

Seed kèm **hai preset** (`standard-retail`, `made-to-order`) để chứng minh engine
chạy được với nhiều hình dạng — chứ không phải mã hoá một công ty.

Phần thưởng kèm theo: `TransitionLog` append-only thay luôn `AuditLog` cho toàn
bộ vòng đời. Ít bảng hơn, và nhật ký trung thực hơn vì không thể ghi lệch với
trạng thái.

**Test đáng giá:** kiểm tra khả năng tới được (mọi state đều có đường tới từ
INITIAL), không có state kẹt ngoài TERMINAL, và property-based: chuỗi transition
ngẫu nhiên không bao giờ đưa instance ra ngoài đồ thị.

---

## 4. Ledger — bất biến thay vì cột số dư

```prisma
model LedgerAccount     { id, tenantId, kind: TENANT_WALLET|PLATFORM_REVENUE|TENANT_RECEIVABLE, currency }
model LedgerTransaction { id, tenantId, kind, reference, idempotencyKey String @unique, createdAt }
model LedgerEntry       { id, transactionId, accountId, direction: DEBIT|CREDIT, amount Decimal(14,4) }
model BalanceSnapshot   { accountId, asOfEntryId, amount }
```

Bất biến duy nhất, kiểm tra trong cùng một transaction DB: **mỗi
`LedgerTransaction` có tổng DEBIT bằng tổng CREDIT.** Số dư = snapshot gần nhất
cộng các entry sau đó → đọc O(1) mà không cần cột `balance` để lệch.

Cái này thay thế trọn vẹn "ví + nạp tiền + upload bằng chứng + admin duyệt", vốn
là quy trình thu tiền của một doanh nghiệp cụ thể. Bài toán kỹ thuật được giữ
lại (tiền phải khớp, thao tác phải idempotent); cách giải là của mình.

---

## 5. Import pipeline — tổng quát hoá phần đã làm tốt

Phần import hiện tại đã đúng về nguyên tắc (idempotent theo content hash, một
dòng hỏng không giết cả lô). Giữ nguyên *nguyên tắc*, bỏ *ràng buộc với workbook
của công ty*, và thêm một pha mà bản cũ không có:

```
upload → ImportJob(PARSING)
       → ImportRow[]  { raw Json, rowHash, status: VALID|INVALID, issues Json[] }
       → PREVIEW      user thấy trước: sẽ tạo X, cập nhật Y, bỏ Z — và vì sao bỏ
       → COMMIT       chỉ row VALID; mỗi row một transaction
```

- `ImportAdapter<T> = { kind, columns, parseRow, validate, upsert }` — orders,
  catalog, stock dùng chung một khung.
- `rowHash` = hash của nội dung đã chuẩn hoá, **không** phải vị trí dòng →
  sửa một dòng rồi upload lại thì đúng một dòng được cập nhật.
- `@@unique([tenantId, kind, rowHash])` là thứ thật sự chặn trùng; kiểm tra
  "đã tồn tại chưa" ở tầng ứng dụng thì bị race.

Pha PREVIEW là khác biệt đáng kể: người dùng quyết định **trước khi** dữ liệu
được ghi. Cùng bài toán, implementation khác, và mạnh hơn.

---

## 6. Cắt quy mô: 37 model → 30, nhưng đổi hẳn hình dạng

**Giữ:** `Tenant`, `Membership`, `User`, `Account`, `Session`, `Product`,
`Variant`, `Asset`, `Order`, `OrderLine`, `Fulfillment`, `Shipment`,
`WorkflowDefinition`, `WorkflowState`, `WorkflowTransition`, `WorkflowInstance`,
`TransitionLog`, `LedgerAccount`, `LedgerTransaction`, `LedgerEntry`,
`StockItem`, `StockMovement`, `ImportJob`, `ImportRow`, `ApiKey`, `Webhook`,
`WebhookDelivery`, `Notification`.

**Bỏ:** `Material`, `MaterialStock`, `Bom`, `Vendor`, `Expense`, `StockReceipt`,
`InventoryReservation` (thành một loại `StockMovement`), `BasketPosition`,
`Ticket`, `TicketReply`, `Mockup`, `ProductVariant`, `ImportMovement`,
`StockImport`, `WarehouseInventory`, `UserInvite`, `UserAllowedProduct`,
`AppConfig`, `RateLimit` (thuộc middleware, không cần bảng), `AuditLog`
(`TransitionLog` + `LedgerEntry` đã tự audit), `Address` (nhúng vào `Order`
dưới dạng JSON có schema — địa chỉ là ảnh chụp tại thời điểm đặt, không phải
thực thể chia sẻ), `Warehouse` → `Location` tối giản.

**Đính chính con số.** Bản đầu của tài liệu này ghi "~18 model" trong khi danh
sách "Giữ" ngay bên dưới đã có 28 tên — con số sai, danh sách đúng. Lược đồ
thực tế đã dựng là **30 model**.

Và 30 mới là con số trung thực, vì mức cắt không nằm ở số lượng:

- **Bỏ hẳn một nhánh**: Material, MaterialStock, Bom, Vendor, Expense,
  StockReceipt, BasketPosition, Ticket, TicketReply, WarehouseInventory,
  ImportMovement, StockImport, UserAllowedProduct, UserInvite, AppConfig,
  RateLimit, AuditLog, Address — 18 bảng biến mất.
- **Catalog 4 tầng → 2** (Product → Variant), bỏ ProductVariant và Mockup.
- **Thêm lại là hạ tầng engine**, không phải phình phạm vi: workflow ×5,
  ledger ×4, import ×2, fulfillment ×2 (Fulfillment + FulfillmentLine, thứ mô
  hình một-dòng-một-sản-phẩm không diễn đạt nổi).

Đây không phải cắt cho nhẹ. Đây là câu trả lời phỏng vấn: *"tôi bỏ BOM và
expense vì chúng thuộc ERP, không thuộc câu chuyện fulfillment mà sản phẩm này
kể — và tôi thêm 11 bảng cho workflow engine, sổ cái và import pipeline vì đó
mới là phần sản phẩm này làm khác"* — một phán đoán về phạm vi, thứ reviewer
đánh giá cao hơn 37 bảng.

---

## 7. Design system — giữ phương pháp, bỏ thương hiệu

**Giữ** (đây mới là phần đáng khoe): quy tắc chỉ dùng token, không màu rời;
một nguồn duy nhất cho màu trạng thái; script `check-ds-adherence.sh` chạy
trước commit; Base UI với `render={}`; mọi chuỗi qua `t()`.

**Bỏ:** `gwp.theme.css`, `GwpMark`, `WoodRings`, `CraftCut`, `public/gwp/*`, và
33 ảnh catalogue thật trong `public/products/`.

Bảng màu mới phải **khác giá trị màu thật sự**, không phải đổi tên biến. Đề
xuất: dựng scale bằng OKLCH với hue/chroma chọn độc lập, ghi lý do trong
`docs/design/tokens.md` (cặp màu nào đạt tương phản bao nhiêu, vì sao chọn hue
đó). Một trang lý do như vậy có giá trị portfolio cao hơn cả bảng token.

**i18n:** 7 locale là gánh nặng giả. Giữ **en + vi** — đủ chứng minh kiến trúc
(tách namespace, plural, RTL-ready) — và nói rõ trong README rằng đó là lựa chọn
có chủ ý.

---

## 8. Dữ liệu tổng hợp

`prisma/seed.ts` xác định trước:

- `faker.seed(42)` → ai clone cũng ra đúng bộ dữ liệu → screenshot và test ổn định.
- 3 tenant, ~12 sản phẩm tự nghĩ, hoàn toàn generic (`Ceramic Mug 11oz`,
  `Canvas Print 12×16`), ~400 đơn rải đều qua các state của cả hai workflow preset.
- Bút toán ledger sinh kèm và **cân bằng** — seed cũng là một test.
- Ảnh sản phẩm: SVG placeholder sinh bằng code, không dùng ảnh thật.
- Không tên người thật, không địa chỉ thật, không giá thật, không email thật.

---

## 9. Tuyệt đối không port (xoá, không sanitize)

| File | Lý do |
|---|---|
| `libs/db/prisma/scripts/migrate-legacy.sql` (26 KB) | **Chính là lược đồ DB của công ty** viết ra giấy. Không sanitize được. |
| `libs/db/prisma/scripts/migrate-legacy-inventory.sql` (37 KB) | Như trên. |
| `import-order-history.ts`, `import-catalog.ts`, `import-price-list.ts`, `extract-price-list-images.ts`, `lib/price-list.ts` | Gắn với workbook `OP × Xưởng`, cột `Pro chuẩn`/`Size chuẩn`/`Giá`/`Ngày`, giá VND thật. |
| `backfill-drive-mockups.ts` | Google Drive folder id nội bộ. |
| `seed-demo.ts` (62 KB) | Viết lại từ số không. |
| `apps/dashboard/public/products/*.webp` (33 ảnh) | Ảnh catalogue thật của công ty. |
| `apps/dashboard/public/gwp/*` | Logo. |
| `docs/MIGRATION-STATUS.md`, `docs/superpowers/**`, `docs/implementation/**`, `docs/design-system-migration-report.md`, `docs/team/old-vs-new.html`, `docs/huong-dan/**` | Kể lại quá trình làm việc nội bộ. |
| `CLAUDE.md`, `.claude/` | Viết lại ngắn gọn như hướng dẫn đóng góp; không nhắc lịch sử. |

Và một quy tắc áp cho code: **không comment nào được nhắc tới một hệ thống nằm
ngoài repo này.** Hiện tại rất nhiều comment vi phạm — *"legacy chạy ba hệ thống
tồn kho song song"*, *"~319 đơn Refund cũ"*, *"sai lầm warehouse_external"*.
Chúng là ghi chép về hệ thống của người khác.

---

## 10. Được phép mang theo nguyên văn

Quy tắc: **một file copy được nếu nó không chứa danh từ nghiệp vụ và không chứa
quyết định riêng của công ty.**

- Được: `lib/cn.ts`, wrapper Base UI, hook phân trang, util HMAC verify,
  util retry/backoff, cấu hình test, `money.ts` (sau khi bỏ tỉ giá VND).
- Không được dù trông generic: `status-tones.ts` — nó map theo enum của họ.
  Giữ *ý tưởng* (một nguồn duy nhất cho màu trạng thái), viết lại theo state key mới.

Với phần còn lại: được phép đọc code cũ để hiểu **cách tiếp cận**, nhưng code
mới phải tự gõ. Đọc để học khác với chép rồi đổi tên.

---

## 11. Tối ưu kèm theo (vì dù sao cũng viết lại)

- **Cô lập tenant tại một chỗ**: Prisma client extension tự chèn `tenantId`, thay vì nhớ thêm `where` ở từng query.
- **Phân trang bằng cursor**, không offset — `OFFSET 10000` sẽ chậm dần theo dữ liệu.
- **Index phải có query chứng minh.** `Order` hiện có 14 index; mỗi index là thuế ghi. Chỉ tạo khi có `EXPLAIN` đi kèm trong PR.
- **Zod schema dùng chung** cho server action, API route và import adapter — một nguồn sự thật cho validation.
- **Server Components + Suspense theo từng panel** để trang không chờ truy vấn chậm nhất.
- **Test**: property-based cho bất biến ledger và tính tới được của state machine; integration test trên Postgres thật (testcontainers) thay vì mock Prisma — mock Prisma chỉ test lại chính cái mock.
- **CI**: typecheck · lint · test · `check-ds-adherence.sh` · `check-clean-room.sh`.

---

## 12. Quy trình sáu bước

| Bước | Việc |
|---|---|
| **B0** | Chốt tên, tạo repo mới ở chế độ private. |
| **B1** | Scaffold trắng: `create-next-app`, `prisma init`, turborepo — gõ config bằng tay, không copy. |
| **B2** | **Viết design doc trước code**: `domain-model.md`, `workflow-engine.md`, `ledger.md`, `import-pipeline.md`. Đây là tài sản portfolio mạnh nhất — reviewer đọc lý do, không đọc CRUD. |
| **B3** | Port bằng cách viết lại, theo thứ tự: identity → catalog → orders → workflow → ledger → import → inventory. Mỗi module xong là có test. |
| **B4** | Seed tổng hợp + test đầy đủ. |
| **B5** | Bật `check-clean-room.sh` trong CI và chạy sạch. |
| **B6** | `git init` mới, một commit `Initial public release`, rồi chuyển public. |

Repo hiện tại giữ nguyên ở chế độ private làm tài liệu tham khảo cá nhân. Không
bao giờ thêm nó làm remote của repo mới.

---

## 13. Tên và README

Tên hiện tại (`VN-TEST`) không nói lên sản phẩm gì. Vài phương án trung tính,
không đụng thương hiệu nào và đọc được ở mọi ngôn ngữ:

| Tên | Ghi chú |
|---|---|
| **Orderlane** | **Đã chốt** — mô tả đúng việc (đường đi của một đơn hàng), dễ đọc, trung tính. |
| Palletworks | Nghiêng về kho vận. |
| Fulfil Studio | Rõ nghĩa nhưng hơi chung. |
| Stitchline | Hợp nếu muốn ám chỉ sản xuất theo yêu cầu. |

README mở đầu **không** có chữ "migrated from". Nó mở bằng vấn đề:

> Các thương hiệu bán lẻ nhỏ chạy đơn hàng, catalog và giao vận trên những công
> cụ rời rạc: bảng tính cho đơn, thư mục ảnh cho thiết kế, một bảng tính khác
> cho tiền. Không có chỗ nào trả lời được "đơn này đang ở đâu" mà không phải mở
> ba tab.
>
> **Orderlane** gộp chúng vào một workspace đa người thuê: catalog, nhập đơn
> hàng loạt, vòng đời sản xuất cấu hình được, giao hàng, và một sổ cái kép cho
> dòng tiền.

Rồi tới phần reviewer thật sự đọc — **Design decisions**: vì sao workflow là dữ
liệu chứ không phải enum, vì sao tiền là sổ cái kép chứ không phải cột số dư, vì
sao import có pha preview, vì sao cô lập tenant nằm ở tầng client extension.

---

## 14. Gate tự động

Sanitize một lần rồi quên sẽ hỏng ở commit thứ mười. Vì vậy quy tắc phải thành
script: [`check-clean-room.sh`](./check-clean-room.sh) — chặn danh sách từ cấm,
chặn loại file cấm (`.xlsx`, `.csv`, `.sql` dump), chặn email và domain thật.
Chạy trong CI của repo mới, ngay từ commit đầu tiên.

---

## 15. Tiến độ

| Bước | Trạng thái |
|---|---|
| B0 — chốt tên | ✅ Orderlane |
| B1 — scaffold trắng | ✅ `orderlane/` — Turborepo, Next.js, Prisma 7, lược đồ 30 model đã `prisma validate` |
| B2 — design doc trước code | ✅ `orderlane/docs/design/` — bốn tài liệu |
| B3 — port bằng cách viết lại | ⏳ `@orderlane/core` đã có workflow engine, ledger, import planner (47 test xanh). Còn: identity, catalog, orders, screens |
| B4 — seed tổng hợp + test | ⏳ |
| B5 — gate trong CI | ✅ `orderlane/scripts/check-clean-room.sh` + `.github/workflows/ci.yml`, chạy sạch |
| B6 — repo mới, 1 commit | ⏳ xem `orderlane/EXTRACT.md` |

`orderlane/` đang được **dàn** trong repo private này cho tới B6. Lịch sử của
repo công khai vẫn sạch: B6 là `cp -r` sang thư mục mới rồi `git init`, không
phải `subtree` hay `filter-repo` — cả hai đều mang commit theo.
