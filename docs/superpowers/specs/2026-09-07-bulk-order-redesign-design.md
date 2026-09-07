# Create Orders in Bulk — thiết kế lại luồng nhập đơn hàng loạt

Trạng thái: **chờ duyệt**. Ngày: 2026-09-07.

Mục tiêu: seller nhận đơn từ buyer qua Excel, đổ sang hệ thống mình mà **không
phải quay lại Excel để sửa**, và biết mã SKU của mình ở đâu mà tra.

---

## 1. Vấn đề

Quy trình thật hôm nay, đếm được từ code:

> tải template → mở 2 file Excel cạnh nhau → copy/paste → gõ thêm SKU và các cột
> thiếu (mù, không có kiểm tra nào) → Save As CSV → upload → nhận danh sách lỗi
> → quay lại Excel → lặp lại

Ba nguyên nhân gốc, đều xác minh được:

1. **Template là một dòng header trống.** `TEMPLATE_HEADERS`
   (`import-columns.ts:44`) sinh ra đúng 14 tiêu đề, không dòng ví dụ, không
   đánh dấu cột bắt buộc, không nói SKU lấy ở đâu.
2. **Kiểm tra đến quá muộn.** `import-dialog.tsx` giải quyết SKU lúc parse
   (`:98-106`) nhưng mọi lỗi field khác chỉ hiện **sau khi bấm Import**, dạng
   "Dòng 7: …", và không sửa được tại chỗ.
3. **Catalog giấu mã SKU.** `catalog/page.tsx` lấy `sku` từ server rồi
   `catalog-browser.tsx` **không render nó ở đâu cả** — chỉ hiện `variantName` và
   giá. Mã phải điền vào CSV thì trên toàn dashboard không tra được.

Ràng buộc nghiệp vụ (từ chủ sản phẩm): SKU của buyer **khác** SKU của mình. Cùng
một cái ốp lưng, hai bên đặt mã khác nhau. Seller phải nhìn catalog và tự ánh xạ.

---

## 2. Bằng chứng đo được: "Excel tự validate" không chạy

Đây là mục được đặt kỳ vọng cao nhất trong bản thiết kế ban đầu. Đã kiểm chứng
bằng cách **lái Microsoft 365 Excel thật (build 16.0.20326) qua COM**, chạy 10 bộ
kịch bản, rồi giải nén file `.xlsx` đọc XML làm chuẩn — không dựa vào forum.

### 2.1 Data Validation không bao giờ bắt được dữ liệu dán vào

Microsoft ghi trong tài liệu chính thức: DV chỉ hiện thông báo và chặn khi người
dùng **gõ trực tiếp** vào ô; *"When data is copied or filled, the messages do not
appear."* Toàn bộ workflow của mình được định nghĩa là paste. Dropdown là **trang
trí cho người gõ tay**, không phải cổng kiểm tra.

### 2.2 Paste còn phá luôn thứ đã có

| Trước | Sau một cú Ctrl+V |
|---|---|
| `dataValidation sqref="B2:B11" formula1=StatusList` | **hai** rule: `B7:B11`=StatusList và `B2:B6`=`"X,Y,Z"` |
| Conditional format `$B:$B` (cả cột) | `$B$1, $B$7:$B$1048576` — bị đục thủng đúng vùng dán |

Kiểu hỏng nguy hiểm nhất **không phải mất dropdown mà là bị thay dropdown**: ô
vẫn có mũi tên, vẫn mở bình thường, nhưng đưa danh sách của file nguồn. Không có
dấu hiệu nào cho thấy đã hỏng.

### 2.3 Cơ chế kích hoạt khiến QA không tái hiện được

Việc DV/CF có bị ghi đè hay không **phụ thuộc vào sheet nguồn, không phải ô được
copy**. Chỉ cần sheet nguồn có DV/CF ở bất kỳ đâu — kể cả ô Z1 không liên quan —
là clipboard mang theo lệnh ghi đè.

> Tester copy từ sheet trắng → chạy tốt → ký duyệt.
> Khách copy từ file export của buyer (luôn có DV/CF) → hỏng sạch.

### 2.4 Đúng một biện pháp chống được

**Protect Sheet, bỏ tick "Format cells".** Đo được: paste vẫn thành công, giá trị
vẫn vào, nhưng Excel **âm thầm hạ cấp cú paste thành values-only** — DV, CF, màu
nền, định dạng số nguyên vẹn. Paste tràn sang cột khoá thì bị từ chối nguyên
khối. Nếu **tick** "Format cells" thì CF vẫn vỡ — một ô tick quyết định thành bại.

Hai điều nữa, đều ngược trực giác:

- **Cột Status bên PHẢI vùng paste bị xoá** khi khách copy nguyên dòng — thao tác
  tự nhiên nhất khi chuyển đơn. Phải để **bên TRÁI** và khoá lại.
- **Excel Table gây ảo giác an toàn.** Dán *dưới* bảng thì tự nới và tự điền công
  thức rất đẹp; một cú dán đè full-width **phá vĩnh viễn** cột công thức, và mọi
  dòng thêm sau đó thừa hưởng hỏng hóc. Không tự lành.

### 2.5 Ngoài Excel desktop thì vô tác dụng

Microsoft Q&A nói thẳng Excel for the web **không có cách nào** chặn CF bị vỡ
(không có tuỳ chọn "All merging conditional formats", không VBA). LibreOffice có
báo cáo mất CF và validity chỉ qua một vòng save/reopen `.xlsx` — không cần paste.
Google Sheets có mô hình bảo vệ theo người dùng nên protection nhập vào coi như vô
hiệu. Ba môi trường này **chưa được kiểm chứng tận tay**, chỉ có tài liệu.

---

## 3. Quyết định đã chốt

| # | Quyết định | Lý do |
|---|---|---|
| D1 | **Hoãn "Excel tự validate" xuống sau khi có sửa-inline**, rồi quyết bằng số liệu | §2 — nó không đóng được vòng lặp, và bị sửa-inline lấn át hoàn toàn |
| D2 | **Cắt dropdown SKU** khỏi mọi giai đoạn | §2.1, §2.2 và §3.1 |
| D3 | **Sửa khoá chống trùng trước tiên**, như một việc độc lập | §4 — đang là lỗi tiềm ẩn ngay cả khi không làm gì thêm |
| D4 | Màn Review sống **hoàn toàn trong state của trình duyệt**, không thêm model Prisma | §6.3 |
| D5 | Tiêu đề cột và tên sheet **luôn tiếng Anh** ở cả 7 ngôn ngữ | `COLUMN_ALIASES` khớp chuỗi tiếng Anh cứng; dịch tiêu đề là làm vỡ importer |
| D6 | Cột bắt buộc **sinh từ schema**, không gõ tay | §5.2 |
| D7 | Parse file **trong trình duyệt**, không phải server | §8.4 |
| D8 | P0 **không thêm thư viện spreadsheet nào** | §5 (CSV đủ dùng) và §9.3 |

### 3.1 Vì sao cắt dropdown SKU (D2)

Ba lý do độc lập, không lý do nào liên quan tới độ dài danh sách:

- **Sai chiều tra cứu.** Đầu vào của seller là *tên sản phẩm của buyer*; đầu ra
  cần là *mã SKU của mình*. Dropdown chỉ hiện được một cột mã — thứ seller không
  thể đoán — và Excel không cho gõ để lọc trong dropdown.
- **Sai thao tác.** DV không kích hoạt khi paste (§2.1).
- **Chính nó là thứ bị paste thay thế**, âm thầm (§2.2).

Catalog hiện có 32 sản phẩm / 119 biến thể. Vấn đề không phải quy mô — thiết kế
này hỏng ngay ở 119.

**Thay bằng:** sheet Product List tra bằng `Ctrl+F` (tìm được **mọi cột kể cả tên
sản phẩm** — đúng thứ seller đang cầm), cộng cột "sản phẩm đã nhận diện" khoá
cứng bên trái ở giai đoạn P2.

---

## 4. P0.0 — Sửa khoá chống trùng (chặn mọi việc khác)

**Đây là lỗi dữ liệu có thật, không phải rủi ro giả định.**

Khoá hiện tại, `writes.ts:215`:

```ts
const idempotencyKey = `import:${owner}:${i}:${createHash("sha256").update(JSON.stringify(raw)).digest("hex").slice(0, 32)}`;
```

`i` là **vị trí trong mảng payload gửi lên** — mà payload đã bị lọc bỏ những dòng
không tra được SKU (`import-dialog.tsx:125-127`) và đã bị cắt theo lô 50
(`BATCH`, `import-dialog.tsx:21`). Nên `i` **không phải** số dòng trong file, và
nó đổi bất cứ khi nào tập dòng bị bỏ qua thay đổi.

Hai đường hỏng, cả hai đều xác suất cao khi có sửa-inline:

- Seller sửa 7 dòng lỗi rồi import → sau đó upload lại file gốc để đối chiếu →
  130 dòng cũ dedupe đúng, nhưng **7 dòng đã sửa hash khác → tạo 7 đơn trùng, và
  báo cáo là "thành công"**.
- Seller xoá các dòng lỗi trong Excel rồi upload lại → mọi dòng phía dưới đổi chỉ
  số → đổi khoá → **toàn bộ phần đuôi import lần nữa**.

Không có gì bắt được: qua type-check, qua review, và `writes.test.ts:88-114` chỉ
ghim trường hợp upload lại **y hệt**.

### Thay đổi

Khoá mới, bỏ vị-trí-trong-payload, thay bằng **thứ tự theo nội dung trong file**:

```
import:${owner}:${sha256(canonical(row)).slice(0,32)}:${ordinal}
```

- `canonical(row)` — `JSON.stringify` với **khoá đã sắp xếp**. Khoá của object
  hiện tại đến từ thứ tự cột trong file seller (`Object.fromEntries(headers.map(…))`),
  nên đảo cột đang làm đổi hash. Sắp xếp khoá làm hết chuyện đó.
- `ordinal` — số lần xuất hiện thứ mấy (đếm từ 1) của **đúng nội dung đó** tính
  từ đầu **file**, do client tính trên toàn bộ mảng đã parse và gửi kèm.

Giữ nguyên tính chất mà comment `writes.ts:207-214` đang bảo vệ: hai dòng giống
hệt nhau vẫn tạo hai đơn — chúng nhận `ordinal` 1 và 2.

Client cấp `ordinal` là an toàn và **đã là mẫu có sẵn trong repo**: `assignSchema`
(`schema.ts`) nhận `idempotencyKey` từ client với chính lý do đó ("Supplied by the
CLIENT and reused verbatim on retry"). Client vốn đã kiểm soát toàn bộ nội dung
dòng, nên không mở thêm bề mặt tấn công nào.

### Chữ ký hàm

`createOrders(actor, rows, ctx, owner)` → thêm tham số `ordinals?: number[]`.
Thiếu thì mặc định `i + 1`, giữ tương thích cho `/api/v1`.

### Hệ quả phải nói rõ

Đơn đã import **trước** thay đổi này mang khoá dạng cũ. Upload lại file đó **sau**
khi deploy sẽ không dedupe được → tạo trùng một lần. Cửa sổ này được đóng bởi
kiểm tra "đã import rồi" ở P1 (§8.3). Ghi vào changelog, không im lặng.

### Kèm theo

- **Bộc lộ `deduped`.** `writes.ts:248` đếm dòng dedupe vào `created`, và dialog
  vứt cờ đi (`import-dialog.tsx:138-140`). Thêm `deduped` vào giá trị trả về và
  mang xuống UI. **Không** đổi nghĩa của `created` — `writes.test.ts:99` đang ghim
  ngữ nghĩa "dedupe không phải thất bại". Màn kết quả đọc:
  *"128 đơn mới · 9 đã import trước đó · 0 lỗi"*.
- **`orderBatchSchema` là code chết** (`schema.ts:56`, không call site nào) trong
  khi comment của nó tuyên bố đang chặn ở 500 dòng. Hoặc dùng nó trong
  `createOrdersAction`, hoặc xoá. Không để lại một comment nói dối.

---

## 5. P0.2 — Template CSV làm cho ra hồn

P0 **không** đổi sang `.xlsx` (D8). Một CSV vẫn làm được hàng ví dụ và đánh dấu
cột bắt buộc — đó là 80% giá trị, với 0 thư viện mới.

### 5.1 Sửa alias trước, nếu không template sẽ nói dối

`Address 1` và `Artwork URL` **không có** trong `COLUMN_ALIASES` (đã kiểm lại trên
cây hiện tại). Khách điền vào cột mà importer ném đi — tệ hơn là không có cột đó.

- Thêm `"Address 1": "line1"` và `"Artwork URL": "imageUrl"`, kèm các biến thể
  người ta thật sự gõ: `Address1`, `Street`, `Image`, `Image URL`, `Mockup`,
  `Design Link`.
- **Sinh `TEMPLATE_HEADERS` từ `COLUMN_ALIASES`** thay vì duy trì hai danh sách.
- Test chặn: mọi tiêu đề trong template phải giải được qua `COLUMN_ALIASES` thành
  một field mà `orderSchema` chấp nhận.
- Màn Review liệt kê **mọi tiêu đề không nhận diện được**: *"cột không nhận diện —
  các giá trị này đã bị bỏ qua"*. Không bao giờ vứt im lặng nữa.

### 5.2 Dấu sao sinh từ schema (D6)

Bản thiết kế ban đầu đánh dấu `Address 1*`, `City*`, `Country*`. Schema để cả ba
là `optionalText` (`schema.ts:38,40,45`). **Bắt buộc thật sự chỉ có 5**:
`externalId`, `productVariantId` (qua SKU), `quantity`, `shippingName`, `zip`.

Template nghiêm hơn server sẽ **bôi đỏ những dòng server chấp nhận** — đúng vòng
lặp mà tính năng này sinh ra để giết, giờ mang thêm uy tín "template chính chủ".

Dùng `fieldRules(orderSchema)` (`field-rules.ts:125`, thuần, đã có test) để sinh:
dấu `*`, chặn 1..10000 của `quantity`, độ dài tối đa từng cột. Thêm test khẳng
định template khớp `fieldRules` từng field — schema đổi thì **CI đỏ**, không phải
người dùng phát hiện.

Hai field `fieldRules` không phủ được: `placedAt`/`deadline` (kiểu date không sinh
`type` trong JSON Schema) và `productVariantId` (là tra cứu server, không phải ô).
Ghi rõ cả hai là **chỉ kiểm tra ở server**.

### 5.3 Hàng ví dụ, và chuyện không ai xoá nó

Không được phụ thuộc vào việc người dùng xoá. Hai lớp:

- Order ID của hàng ví dụ mang **sentinel** `EXAMPLE-DELETE-THIS-ROW`; parser bỏ
  đúng chuỗi đó và báo trên màn Review là thông tin, **không phải lỗi**.
- Trường hợp nguy hiểm hơn là **đè một phần**: seller ghi đè Order ID và Qty nhưng
  để nguyên tên và địa chỉ ví dụ → đơn thật gửi tới địa chỉ giả. Nên **mọi ô** của
  hàng ví dụ mang token `EXAMPLE` (`EXAMPLE — delete this row`, city `EXAMPLE`,
  zip `00000`), và Review gắn tone `attention` cho bất kỳ dòng nào còn sót token.

### 5.4 Cột giữ nguyên

Giữ `Marketplace`, `Email`, `Phone`, `Address Line 2` — bản thiết kế ban đầu bỏ cả
bốn. `Address Line 2` là số căn hộ; `Phone` là thứ hãng vận chuyển hỏi khi giao
thất bại. Để optional, không xoá.

---

## 6. P0.3 — Trang "Create Orders in Bulk" và màn Review

Route: `/orders/bulk`. Segment tĩnh thắng `[id]` trong router Next — lý do đã ghi
sẵn ở `orders/[id]/page.tsx`.

**`ImportDialog` bị trang này thay thế hẳn.** Nút ở `orders-table.tsx` thành link.
Tái sử dụng 18 khoá i18n `import*` sẵn có, không nhân bản. Hai UI import song song
nghĩa là hai đường validate rồi sẽ trôi khỏi nhau.

### 6.1 Ba bước

Không dựng component stepper — design system **không có** cái nào, và
`SectionHeading.eyebrow` là cách đánh số bước được phép.

1. **Tải template** — nút ghost + icon `Download`, dùng lại logic blob của
   `downloadTemplate()` nguyên vẹn, gồm cả `revokeObjectURL` ở tick kế tiếp.
2. **Điền đơn** — link sang catalog, kèm nút *Tải danh sách SKU*.
3. **Upload** — vùng thả file: `<input type="file" className="hidden">` (**không**
   `sr-only` — sr-only vẫn nhận focus và vẫn nằm trong tab order) + `<button>` có
   nhãn, viền `border-dashed`. Kéo-thả là nâng cấp tuỳ chọn trên cùng nút đó;
   đường bấm chuột vẫn là đường tiếp cận được.

Hành động chính đặt trong `<PageToolbar>` — `PageHeader` **cố ý không có** prop
`action`, và rulebook cấm thanh công cụ ghim / footer dính.

### 6.2 Màn Review

Ba trạng thái dòng, định nghĩa dứt khoát:

| Trạng thái | Tone | Nghĩa |
|---|---|---|
| **Invalid** | `critical` | Trượt zod ở field bắt buộc, hoặc SKU không tra được. **Không import được.** |
| **Needs attention** | `attention` | Sẽ import, nhưng có điểm đáng ngờ (§6.4) |
| **Ready** | `success` | Không phát hiện vấn đề |

Ba trạng thái này **không** nằm trong `STATUS_TONES` (test của nó duyệt enum
Prisma — đây là trạng thái UI, không phải trạng thái đơn). Truyền tone tường minh
tại chỗ gọi.

Chữ dùng là **"không phát hiện vấn đề"**, không phải "sẽ import". Một dòng Ready
vẫn có thể trượt ở server (`unknown-sku` do đua giữa parse và commit,
`sku-inactive`, `cannot-create-for-others`).

**Chặn số dòng render.** `PREVIEW_ROWS` tồn tại vì một lý do đã ghi:
*"A 5,000-row file is a legitimate import and an illegitimate DOM"* — và `DataTable`
của app **không có** virtualization. Nên:

- Mặc định chỉ hiện **dòng có vấn đề** (Invalid + Needs attention — thường dưới 20).
- "Xem tất cả" thì phân trang 50 qua `DataTablePagination` sẵn có.
- Sắp xếp mặc định: Invalid → Needs attention → Ready.
- Tiến trình thật khi commit ("1.250 / 5.000"), vì `BATCH=50` giữ nguyên.
- Dưới ~5 dòng thì **bỏ dải 3 thẻ KPI** (một file 1 dòng không đáng có dải
  `1 / 0 / 0`), thay bằng một câu.

### 6.3 Dữ liệu sống ở đâu (D4)

**Trong state React. Không thêm model Prisma.**

`rows` và `skuIds` đã là state (`import-dialog.tsx:50,55`); `orderSchema` chỉ
import zod nên chạy được cả hai phía; SKU đã được giải quyết lúc parse. Màn Review
vì thế cần **0 dòng code server mới**.

Các lựa chọn khác đắt hơn mà không mua thêm tính toàn vẹn nào:

- **Bảng staging**: một migration, một scope helper, một đường dọn lô bị bỏ dở
  **mà không có runtime nào để chạy** (không cron/queue/worker trong
  `apps/dashboard/src`), và **vẫn không bỏ được batching** vì dòng vẫn phải qua
  giới hạn body 1 MB của server action.
- **Blob tạm**: `putObject` có sẵn nhưng không model nào giữ key, và post file
  vẫn đụng đúng giới hạn đó.

Các đường hỏng của state trình duyệt đều chịu được:

- F5 → mất review, **không mất gì khác**; file vẫn nằm trên đĩa, parse lại.
- Hai tab cùng file → **sinh khoá idempotency giống hệt** → dedupe đúng.
- 5.000 dòng → vấn đề DOM, không phải vấn đề bộ nhớ hay truyền tải (`BATCH=50`
  giữ mỗi request ở ~22 KB).

Thêm cảnh báo `beforeunload` khi review đang có sửa đổi chưa gửi.

**Không được đổi hợp đồng commit.** Vòng lặp lô vẫn chạy ở client, mỗi dòng một
transaction ở server. Đóng tab giữa chừng vẫn để lại lô 1-2 đã commit và lô 3
chưa — **không sao**, vì mỗi dòng có khoá riêng và upload lại thì dedupe. Điều
kiện để giữ được tính chất đó: **không bao giờ đánh số lại mảng dòng**.

### 6.4 Kiểm tra chạy ở đâu

**Client, không round trip** — qua `fieldRules(orderSchema)` ở module scope +
`validateValue(RULES[field], cell, t)` từng ô: `externalId` 1-120, `shippingName`
1-200, `zip` 1-20, `quantity` số nguyên 1..10000, định dạng email/url.

**Không** đưa chuỗi ô thô vào `orderSchema.safeParse` để lấy phản hồi từng ô:
`quantity` và `productVariantId` không có coercion, nên mọi ô chưa chuyển kiểu sẽ
báo *"expected number, received string"* thay vì *"At least one"*. Chuyển kiểu
trước, đúng như `import-dialog.tsx:132` đang làm.

**Bẫy phải ghi lại:** ô được điền từ parse (không phải do gõ) **không bao giờ lật
cờ `touched`**, nên validate-khi-rời-ô sẽ im lặng không chạy. Gọi `validateValue`
**thẳng cho mọi ô ngay lúc parse**, đừng dựa vào dây nối của `FormField`.

**Chỉ server**: `productVariantId` (tra SKU), `unknown-sku`, `sku-inactive`,
`cannot-create-for-others`.

**Needs attention** gồm:
- Artwork URL là link Drive không nhận dạng được (§6.6).
- Trong cùng file có dòng trùng nhau ở cả `(Order ID, SKU, Qty, Recipient Name)`.
- Còn sót token `EXAMPLE`.
- `Country` = US mà `State` trống.

### 6.5 Trùng Order ID — tách làm hai

`externalId` **cố ý không unique**, ghi ở cả `schema.ts:12-13` lẫn `order.prisma`:
*"một đơn ngoài sàn có thể tách thành nhiều dòng"*. Có `@@index`, không `@@unique`.

- **Trùng trong file**: chỉ là ghi chú trung tính, **không bao giờ đỏ, không bao
  giờ chặn, không tính vào Invalid** — *"Dòng 4, 5, 6 dùng chung Order ID
  3021-118 — bình thường với đơn tách nhiều món."*
- **Trùng với database**: đây mới là cái tốn tiền, và quy tắc Excel **không thể
  nào thấy được**. Là một trạng thái dòng riêng ở P1 (§8.3).

Bỏ hẳn "duplicate Order ID" khỏi danh sách quy tắc conditional-format.

### 6.6 Cột Artwork URL và cái bẫy Google Drive

Repo có một luật đã trả giá để học, ghi trong `CLAUDE.md`: `orders.image_url` của
hệ cũ là link **thư mục** Google Drive, **không phải ảnh** — nhét nó vào `<img>`
chính là thứ làm mọi thumbnail đơn hàng vỡ. URL render được nằm ở
`mockups.thumbnail`; không bao giờ đưa `imageUrl` cho `<img>`, phải qua
`thumbSrc()` (`order-thumb.tsx:96`).

Mở một cột `Artwork URL` trong template nghĩa là **mời seller dán đúng loại link
đó vào**, và màn Review là nơi dễ tái phạm nhất (một lượt "đánh bóng UI" sau này
rất dễ thêm cái `<img>` preview).

Ba luật, bắt buộc:

1. **Màn Review render Artwork URL dưới dạng CHỮ, không bao giờ `<img>`, không
   ngoại lệ.** Ghi thẳng câu này vào comment tại chỗ để lượt polish sau không thêm.
2. **Phân loại từng giá trị lúc review** bằng `parseDriveUrl()` từ `@gwprint/shared`
   (`libs/shared/src/drive/folder.ts:49`, trả `{kind:"folder"|"file", id}` hoặc
   `null`):
   - `folder` → chip thông tin: *"Thư mục Drive — sẽ tự nhận diện sau khi import."*
     **Không phải lỗi** — `backfill-drive-mockups` và `/api/orders/<id>/thumb` xử
     lý được.
   - `file` → hợp lệ.
   - URL `drive.google.com` mà parse ra `null` → tone `attention`: link Drive
     không nhận dạng được.
   - URL khác → chỉ kiểm định dạng URL qua `validateValue`.
3. Sau khi thêm alias `"Artwork URL": "imageUrl"` (§5.1), chạy
   `npm run db:backfill:mockups` (`--dry-run` trước) sau mỗi đợt import lớn, đúng
   như `CLAUDE.md` yêu cầu.

---

## 7. P0.1 — Catalog hiện SKU

Nhỏ, độc lập, gỡ ngay cái bí hiện tại. Ship được trước cả phần còn lại.

**Trên trang** (chỉ client): render `s.sku` ở panel biến thể
(`catalog-browser.tsx:184-194`) và ở pill của list view (`:221-231`), font
`font-mono tracking-(--ls-mono)`, cạnh giá từng biến thể; thêm `sku` vào needle
tìm kiếm (`:36-43`).

Nút Copy là **anh em** của nút header, **không lồng bên trong** — lồng vào là tên
khả truy cập của thẻ nuốt luôn nút. Nâng `CopyButton` lên `components/ds/` mang
theo try/catch quanh `navigator.clipboard.writeText` đã viết sẵn ở
`api-keys-panel.tsx:49-56`, Copy→Check 1500ms qua timer giữ trong ref.

> Lỗi nhãn variant (`variantName: s.product.name`) **đã được session khác sửa** —
> `page.tsx:37` giờ đọc `s.variant.name` và `SKU_SELECT` đã chọn quan hệ variant.
> Không còn việc phải làm ở đây.

**Tải danh sách SKU** — cần code server mới, **không** dựng trên dữ liệu của trang:

- Query riêng, `productVariant.findMany` với mệnh đề `product` spread
  `await productScope(actor)` — **không bao giờ** `findMany` trần, đó chính là hình
  dạng làm rò cả catalog cho partner bị giới hạn.
- Giá qua `effectivePrice` với tier của **chính actor**, lấy từ session. Không
  bao giờ nhận tier từ caller.
- Lọc `status === "ACTIVE" && priced` — `effectivePrice` tụt đáy về `salePrice`
  (mặc định 0), nên một SKU chưa định giá sẽ **báo giá bằng 0**.
- Xuất **đúng** 4 cột: Product, Variant, SKU, Your price. **Không** `salePrice`,
  **không** mảng `prices`.
- **Không** dùng `listProducts({ pageSize: 100 })` — pageSize bị kẹp ở 100 và
  không có cursor, nên file import đầu tiên vượt 100 sản phẩm sẽ **cụt danh sách
  trong im lặng**.
- Guard `requirePermission("products.read")`.
- Nút đặt ở hàng action của SearchShell cạnh toggle grid/list, **không** ở
  `CatalogHeader` (`PageHeader` từ chối CTA theo thiết kế).

**Bỏ cột ảnh khỏi phạm vi.** Cả 32 thumbnail đang là đường dẫn tương đối
`/products/*.webp` và **không có asset nào trong `apps/dashboard/public`** — chúng
307 về `/` và trả HTML. Xuất cột ảnh là xuất link chết. Sửa thumbnail là ticket
riêng.

**Quyết định lưu trữ:** file danh sách SKU mang **giá đàm phán riêng của một
seller**. `exportOrders` hiện `putObject` rồi trả link — trên production là URL
Vercel Blob **không đoán được nhưng công khai**. Danh sách giá phải đi qua route
`/api/files` có xác thực, không phải URL blob công khai.

---

## 8. P1 — Sửa inline, import từng phần, nhận `.xlsx`

Đây là phần **thật sự** giết vòng lặp Excel, và nó rẻ hơn hẳn phương án Excel:
đổi state React + dùng lại `orderSchema` và `field-rules.ts` (đã viết, đã test,
đã dịch).

### 8.1 Sửa inline

Không dựng spreadsheet editor. Là **chế độ sửa theo dòng** trong `DataTable` sẵn
có: `renderExpanded` mở một panel một dòng, hoặc dòng đổi ô thành control ở
`--control-height-sm` (32px); dưới 768px phải đạt vùng chạm 44px.

Ô SKU dùng `components/ui/combobox.tsx` (Base UI) — consumer đầu tiên trong app.
Base UI compose bằng `render={<El/>}`, **không bao giờ** `asChild`.

**Một sửa đổi chỉ cần round trip khi ô SKU đổi**, khi đó gọi lại `resolveSkusAction`
với đúng một ref (nó vốn nhận mảng).

**Khớp SKU đang phân biệt hoa thường** cho mã (`codeMap.get(code)` trên chuỗi
trimmed thô) trong khi cặp product/variant thì lowercase cả hai phía. Seller gõ
tay chữ thường sẽ nhận "không tra được SKU". Sửa: so khớp không phân biệt hoa
thường, đồng thời bỏ khoảng trắng trong và non-breaking space — copy từ Excel sinh
ra cả hai. Phủ test ở `skus.test.ts`.

**Dòng không tra được SKU chỉ có thể sửa bằng cách chọn một SKU thật, không bao
giờ ép qua.** Những dòng đó hiện không tới server nên không có khoá idempotency và
không có bản ghi audit; mở đường "cứ import" là cho chúng đi qua một lối chưa từng
được dedupe.

**Sản phẩm không có trong catalog** hiện là ngõ cụt ("No SKU matches", hết). Thêm
link sang module tickets để seller hỏi — đừng để ngõ cụt trên chính màn hình mà cả
thiết kế này xoay quanh.

**Sửa inline không ghi ngược vào file Excel của seller.** File của họ và database
của mình sẽ lệch nhau, và lần upload sau mang lại giá trị cũ. Spec **nói thẳng
điều đó**; không hứa hẹn "tải file đã sửa" ở v1.

### 8.2 Import từng phần

Dòng đã commit thì **đóng băng** trên màn Review, hiện mã đơn mới, không gửi lại
được. Nút Import đổi chữ thành "import N dòng còn lại".

**Thử lại không bao giờ quay về Excel**: màn Review giữ mảng gốc và gửi lại chỉ
những dòng lỗi, **với `ordinal` gốc của chúng** (§4). Không nén, không đánh số lại.

### 8.3 Kiểm tra "đã import rồi"

Chạy cùng lúc với giải quyết SKU ở parse: truy vấn `Order` **trong scope của
actor** (`orderScope`, không phải truy vấn trần) tìm dòng chưa xoá khớp
`(externalId, productVariantId, quantity)` tạo trong N ngày gần đây, đánh dấu là
*"Đã import trước đó"* với lựa chọn import-dù-sao **cho từng dòng**.

Đây là kiểm tra duy nhất sống sót qua **cả** đổi chỉ số **lẫn** sửa nội dung, và
là thứ thật sự bắt được một lần upload lại.

### 8.4 Nhận `.xlsx`

Rẻ và gỡ được đúng thứ ma sát seller kêu. Thư viện: **`read-excel-file`** — 14 KB
gzip (so với 256 KB exceljs / 334 KB SheetJS), đang được bảo trì, chạy sẵn trong
Web Worker, và `readSheet(input, 'Orders')` chọn sheet theo tên rồi ném
`SheetNotFoundError` liệt kê các sheet có sẵn — đúng thông báo lỗi mà UI cần.

Import động, nằm sau trang, không vào bundle chung.

**Parse ở trình duyệt (D7).** Trực giác "file không tin được thì đẩy lên server"
là **ngược** ở đây:

- File **không phải** ranh giới tin cậy hôm nay — server đã validate lại từng dòng
  bằng chính `orderSchema` và giải quyết mọi SKU phía server. Parse ở client không
  làm yếu đi một byte nào.
- **Bán kính vụ nổ.** Đo được: 208 KB vào → 457-506 MB RSS ra, ở **mọi** thư viện.
  Ở trình duyệt đó là tab của chính người upload. Trên Vercel đó là function OOM,
  lỗi 500, compute bị tính tiền, và một DoS hai dòng mà bất kỳ seller đã đăng nhập
  nào cũng chạy được trong vòng lặp.
- **Truyền tải.** Một sheet 5.000 dòng đo được 3,33 MB. Next kẹp body của server
  action ở 1 MB; Vercel kẹp body function ở 4,5 MB. **Không** nâng
  `serverActions.bodySizeLimit` — nó toàn cục và làm yếu mọi action khác.

**Bắt buộc trong spec:**

- `readSheet(input, 'Orders')` — **không bao giờ** dùng export mặc định, thứ trả
  về **mọi** sheet kể cả sheet ẩn, và sẽ đọc luôn Product List vào bảng đơn hàng.
- Chặn dung lượng **5 MB, kiểm tra trước khi parse**; chặn **5.000 dòng**, thất bại
  bằng một lỗi có tên và đã dịch, **không** import một phần đầu.
- Kiểm magic byte `PK` để file đổi đuôi thất bại với "không phải file bảng tính".
- Chỉ đọc **giá trị đã cache** của công thức; ô công thức không có giá trị cache
  coi như **rỗng**, và đối chiếu số dòng parse được với `dimension` khai báo của
  sheet, vì những dòng đó bị **bỏ im lặng**.
- **Dò hàng tiêu đề**: parser hiện giả định dòng 1. File ngoài đời có dòng tiêu đề
  phía trên. Quét ~10 dòng đầu tìm dòng đầu tiên có ≥2 ô khớp `COLUMN_ALIASES`;
  không có thì báo "không tìm thấy hàng tiêu đề", đừng sinh rác.
- **Viết lại comment** ở `import-columns.ts:90-93` trong **cùng commit**. Nó đang
  ghi một quyết định mà thay đổi này đảo ngược; để nguyên là để codebase mang một
  luật nó không còn theo. Nêu tên thư viện mới và vì sao nó vượt qua phản đối cũ.
- Quyết bằng văn bản chuyện `libs/db/prisma/scripts/import-catalog.ts` vẫn đọc
  workbook bằng SheetJS 0.18.5 — chuyển sang `read-excel-file`, hoặc chấp nhận rủi
  ro có ghi lý do. Nó do người vận hành chạy, không phải seller, nên không gấp.

---

## 9. P2 — Template `.xlsx` tự kiểm (có điều kiện)

**Không lên lịch. Mở khoá bằng số liệu, không bằng niềm tin.**

### 9.1 Đo trước

Nhét một **ô đóng dấu ẩn** vào template sinh ra (phiên bản generator, thời điểm
sinh, danh sách tên sheet mong đợi). Màn Review ghi nhận file quay về còn dấu và
còn đủ sheet không. Vài tuần là biết bao nhiêu % file đi qua một trình biên tập
khác. **Toàn bộ khoản đầu tư P2 phụ thuộc con số đó** — vì ở Google Sheets,
LibreOffice và Excel-for-web nó vô tác dụng (§2.5).

### 9.2 Nếu vẫn đáng làm, thì chỉ ở dạng chống-paste đã đo

Hình học sheet Orders — **không phải chi tiết triển khai, là điều kiện đúng/sai**:

| Vùng | Trạng thái |
|---|---|
| Dòng 1: tiêu đề | **KHOÁ** |
| Cột A: "Check" | **KHOÁ**, nền khác, công thức kiểm tra từng dòng tới trần cố định |
| Cột B: "Sản phẩm nhận diện" | **KHOÁ**, hiện `Sản phẩm · Biến thể · Giá` tra từ ô SKU |
| Cột C..N: dữ liệu | **MỞ** — đây là vùng paste |

- Mở khoá từ C2 **tới hết mép phải** của sheet, để một cú dán nguyên dòng bắt đầu
  ở C2 vẫn vào được thay vì bị từ chối nguyên khối vì tràn sang ô khoá.
- Freeze pane ở C2 để A và B luôn nhìn thấy.
- **Protect Sheet có mật khẩu, `AllowFormattingCells = FALSE`.** Đây là biện pháp
  duy nhất đo được là có tác dụng.
- Công thức kiểm tra dùng **`INDEX($C:$C, ROW())`**, không dùng `INDIRECT` (đúng
  nhưng volatile, tính lại mỗi lần gõ trên 5.000 dòng) và tuyệt đối không dùng
  tham chiếu trực tiếp `=Orders!C2` (cắt-kéo trong sheet biến nó thành `#REF!`).
- Conditional format dùng **cả cột** `$B:$B` — miễn nhiễm với chèn/xoá dòng, và
  khi bị paste thì chỉ thủng đúng vùng dán thay vì vỡ thành hàng chục rule.
- Mọi nguồn dropdown (nếu còn) phải là **named range**, không bao giờ
  `=Sheet!$A$1:$A$3` — dạng trực tiếp nằm trong khối mở rộng x14 của OOXML mà
  **trình đọc ngoài Excel xoá trong im lặng** (đã kiểm chứng: openpyxl cảnh báo
  rồi xoá).
- Một **ô tổng kết khoá** đếm số dòng trượt, để seller đã phá nát dropdown của
  chính mình vẫn thấy một con số.
- Đúng **một** câu hướng dẫn: *"Bấm vào ô C2 rồi dán. Nếu Excel từ chối, dùng
  Paste Special > Values (Ctrl+Alt+V, V, Enter). Đừng chèn hoặc xoá cột."*

**Ghi vào spec, không được lược:** protection là **biện pháp trải nghiệm, không
phải biện pháp bảo mật** — gỡ được bằng công cụ phổ biến hoặc sửa XML. Nó chặn tai
nạn, không chặn người cố tình. Đừng ai mô tả với stakeholder rằng nó bảo vệ tính
toàn vẹn dữ liệu.

### 9.3 Thư viện, nếu tới bước này

Chỉ **ExcelJS** ghi được Data Validation và Conditional Formatting. Cả họ SheetJS
— gồm `xlsx-js-style` đang có trong repo — có đúng hai dòng comment rỗng ở chỗ lẽ
ra sinh XML:

```js
/* conditionalFormatting */
/* dataValidations */
```

Không một dòng code. Đây là kiểu hỏng im lặng, không phải lỗi.

Dùng **`exceljs-hardened@5.0.0`**, không phải `exceljs@4.4.0`: bản gốc ngừng bảo
trì từ 01/2024, và 4 CVE năm 2026 chỉ được vá ở fork. Quan trọng: **`npm audit`
không thấy** những CVE đó — đúng điểm mù đang để `xlsx-js-style` (SheetJS 0.18.5,
mang CVE-2023-30533 và CVE-2024-22363) đi qua sạch sẽ hôm nay, vì advisory được
gắn với tên gói `xlsx`.

### 9.4 Template là tài liệu theo từng seller

Sheet Product List mang **giá theo tier của seller** và **chỉ** sản phẩm họ được
phép đặt. Nên template **không thể là file tĩnh** trong `/public` — phải sinh
theo session qua route có xác thực, cùng ràng buộc scope ở §7.

Và nó là **ảnh chụp tại một thời điểm**: seller dùng lại template tháng trước sẽ
ánh xạ theo catalog tháng trước, rồi trượt ở server — tái lập đúng vòng lặp cần
giết. Bản rẻ: đóng dấu ngày sinh vào sheet Instructions, và màn Review nói *"template
này sinh cách đây 47 ngày"* khi thấy dấu cũ. **Không** xây hệ versioning.

---

## 10. Những thứ cố ý KHÔNG làm

| Không làm | Vì sao |
|---|---|
| Đọc file Excel tuỳ ý của buyer, tự dò cột | Chủ sản phẩm đã chốt: khách dùng template của mình. Kiểm soát được schema là lợi thế lớn, đừng vứt đi |
| Dropdown SKU trong Excel | §3.1 |
| Nhớ ánh xạ SKU của seller | Xem §11 — là khoảng trống thật, nhưng là dự án riêng |
| Sửa RTL cho tiếng Ả Rập | App chưa bao giờ set `dir`; Ả Rập đang render LTR. Sửa nó làm regress **mọi** layout và không được đi ké một feature. **Ghi nhận là hạn chế đã biết** |
| Nhúng ảnh vào Product List | Thumbnail đang là link chết (§7) |
| Bảng staging cho Review | §6.3 |
| Nâng `serverActions.bodySizeLimit` | Toàn cục, làm yếu mọi action khác |

---

## 11. Khoảng trống lớn nhất, ghi nhận nhưng chưa làm

Seller ánh xạ **cùng những SKU đó, mỗi tuần, mãi mãi**. Thiết kế này làm việc tra
cứu **nhanh hơn** (Product List, nút Copy ở catalog) nhưng **không bao giờ nhớ
lại**. Một seller có 80 sản phẩm quen sẽ dẫn lại đúng 80 ánh xạ đó ở mỗi lần
import.

Sheet Product List thậm chí làm chuyện này **tệ hơn** vì nó *có cảm giác* như một
giải pháp.

Đây là khoảng trống thật, không phải YAGNI. Nhưng nó là một hệ con riêng (một model
mới, một trang quản lý ánh xạ, một quy tắc an toàn "chỉ ghi nhớ thứ người đã bấm
xác nhận, không bao giờ đoán mờ theo tên gần giống" — vì map sai nghĩa là in sai
sản phẩm và mất vật tư). **Spec riêng, sau khi P0 và P1 chạy thật.**

---

## 12. Ràng buộc bắt buộc

**Design system** — chạy `bash apps/dashboard/scripts/check-ds-adherence.sh` trước
khi commit; nó **đang pass**, nên mọi lỗi mới là của mình.

- Không literal màu ở bất cứ đâu (gate grep hex/rgb/oklch/color-mix và tên màu trần).
- Không utility palette Tailwind ngoài ramp của GWP; `neutral-` chỉ ở 50/100.
- Body trang qua `<Page>` — một `<main class="max-w-7xl">` sẽ trượt gate.
- Trạng thái chỉ qua `toneFor`/`STATUS_TONES`, không ternary cục bộ.
- Ô lỗi mang **cả** token tone (`text-(--status-critical-fg)`, không `text-red-*`,
  không hex) **và** một tín hiệu phi màu — glyph `AlertTriangle` có tên khả truy
  cập, hoặc `aria-invalid` + `aria-describedby`. Trạng thái **không bao giờ chỉ
  bằng màu**; màn hình phải sống sót qua bài test grayscale.
- Không viền dọc giữa ô, không nền xám ở header bảng.
- Không stepper tự chế; `SectionHeading eyebrow` là cách đánh số bước.
- Số ở bảng: mono + `tabular-nums`.
- Dựng đủ **cả 5 trạng thái** trong STATES.md.

**i18n** — thêm namespace là **8 file và 14 sửa đổi** trong `translations.ts`, và
**không có tooling nào bắt lỗi**: build chỉ bắt thiếu *file*, thiếu *khoá* thì âm
thầm rơi về tiếng Anh.

- 7 file `locales/{en,zh,vi,ja,ko,fr,ar}/<ns>.json` cùng bộ khoá.
- 7 dòng import + 7 mục registry trong `translations.ts`.
- **Bắt buộc chạy diff tập khoá lá so với `en` trước khi commit.**
- Chuỗi mới dùng **`t(key, vars)`**, cấm chuỗi `.replace("{count}", …)` cũ — nó
  không mang nổi hai biến và ghim cứng trật tự từ tiếng Anh.

**Lỗi server phải qua `t()`.** `createOrdersAction` cố ý không bọc `withValidation`,
nên `writes.ts:222-230` làm phẳng ZodError thành `"<path>: <message>; …"` hoặc
chuỗi trần "Could not be imported", rồi render **nguyên xi** ở
`import-dialog.tsx:315`. Đây là **bề mặt lỗi duy nhất trong module orders đi vòng
qua `t()`**, ở cả 7 ngôn ngữ — và màn Review đưa nó từ chú thích nhỏ lên vị trí
chính. Hai bước, cả hai đều rẻ vì mảnh ghép đã có:

1. Dùng lại map code→`t()` mà `order-dialog.tsx:99-101` đã ship —
   `unknown-sku`, `sku-inactive`, `cannot-create-for-others`; cả ba khoá đã có
   trong 7 file `orders.json`.
2. Lỗi cấp field thì **đừng dựa vào chuỗi server**: chạy `validateValue` ở client
   (khoá `form.err.*` đã có đủ 7 ngôn ngữ). Giữ chuỗi tiếng Anh của server làm
   fallback không-tới-được-trong-thực-tế **và ghi comment nói vậy**, để không ai
   xoá kiểm tra client vì tưởng server đã lo.

---

## 13. Test bắt buộc

| File | Khẳng định |
|---|---|
| `import-columns.test.ts` (mở rộng) | Mọi tiêu đề template giải được qua `COLUMN_ALIASES` thành field `orderSchema` nhận (**chính test này sẽ bắt được "Address 1" và "Artwork URL"**); sentinel hàng ví dụ bị bỏ; tiêu đề không nhận diện được **báo cáo** chứ không bỏ im lặng; dò được hàng tiêu đề khi có dòng rác phía trên |
| `writes.test.ts` (mở rộng) | Upload lại file **y hệt** → 0 đơn mới (giữ nguyên bảo đảm cũ); **sửa một dòng rồi upload lại → chỉ dòng đó là mới**; **xoá một dòng rồi upload lại → 0 đơn mới**; hai dòng giống hệt nhau trong một file → **2 đơn** |
| `template.test.ts` (mới) | Cột bắt buộc của template khớp `fieldRules(orderSchema)` **từng field** — schema đổi thì đỏ |
| `skus.test.ts` (mở rộng) | Khớp SKU không phân biệt hoa thường; bỏ khoảng trắng trong và non-breaking space |
| `review-rows.test.ts` (mới) | Phân loại Ready / Needs attention / Invalid; `quantity` chuyển kiểu trước khi parse; ô từ parse vẫn được validate dù chưa `touched` |
| `sku-export.test.ts` (mới) | Danh sách SKU tôn trọng `productScope`; không bao giờ lộ `salePrice` hay giá của tier khác; SKU chưa định giá bị loại |

---

## 14. Thứ tự thực hiện

1. **P0.0** (§4) — sửa khoá chống trùng + bộc lộ `deduped` + xử lý
   `orderBatchSchema`. *Độc lập, và là điều kiện tiên quyết của mọi thứ sau.*
2. **P0.1** (§7) — catalog hiện SKU + Copy + tải danh sách SKU. *Ship được ngay,
   gỡ cái bí hiện tại.*
3. **P0.2** (§5) — template CSV + sửa alias + dấu sao sinh từ schema.
4. **P0.3** (§6) — trang `/orders/bulk` + màn Review.
5. **P1** — sửa inline, import từng phần, kiểm tra đã-import, nhận `.xlsx`.
6. **P2** — chỉ khi số liệu đóng dấu ở §9.1 biện hộ được.

Mốc 2 dùng được ngay cả khi các mốc khác chưa xong.

---

## 15. Nguồn

Kết luận về Excel ở §2 đến từ 10 tác nhân điều tra song song (1,6 triệu token, 451
lượt gọi công cụ). Mũi Excel lái Microsoft 365 thật qua COM; script chạy lại được
nằm ở thư mục scratchpad của phiên, `xltest/test1.ps1 … test10.ps1`.

Ba môi trường **chưa kiểm chứng tận tay**, chỉ có tài liệu và báo cáo người dùng:
Excel for Mac, Google Sheets, LibreOffice. Hành vi conditional-format khi paste
của Google Sheets **các nguồn mâu thuẫn nhau** (ghi đè hay tích luỹ) — đừng viết
một dòng spec nào phụ thuộc vào đó mà chưa tự thử.
