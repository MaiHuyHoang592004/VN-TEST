# Hướng dẫn ô nhập liệu — thiết kế và tình trạng

Mục tiêu: người dùng biết phải điền gì **trước khi** gõ, và biết mình gõ sai
**trước khi** bấm gửi.

## Vấn đề đo được (2026-09-07)

| Chỉ số | Số |
|---|---|
| Ô nhập qua `FormField` | 115 (24 file) |
| Trong đó có `hint` | 29 |
| **Ô chỉ có nhãn + dấu sao** | **86** |
| File `modules/*/schema.ts` (nguồn luật) | 19 |

Hai nguyên nhân gốc:

1. `FormField` đã có prop `hint` và render đúng chuẩn a11y — chỉ là 86/115 ô
   không ai viết chữ vào.
2. Lỗi field **chỉ** xuất hiện sau khi `submit` gọi server action rồi trả về
   (`use-form-action.ts:47`). Không có validate lúc rời ô.

Luật thì đã nằm sẵn trong zod. Máy đã biết "bắt buộc, tối đa 64 ký tự" — nó chỉ
chưa bao giờ nói ra.

## Hướng đã chốt: lai

Máy sinh phần **luật** từ chính schema; người viết phần **ngữ cảnh nghiệp vụ**.
Báo lỗi **khi rời ô, chỉ với ô người dùng đã gõ**.

## Kiến trúc

### `field-rules.ts`

`z.toJSONSchema(schema, { io: "input", unrepresentable: "any" })` — zod 4.4.3.
Ba điều chỉ lộ ra khi chạy thật, đều đã có test chặn:

- `.optional().or(z.literal(""))` (idiom `optionalText` của app) ra dạng `anyOf`
  → phải làm phẳng, lấy nhánh không phải `null`/`""`.
- `.positive()` sinh ra `maximum: 9007199254740991` — đọc thẳng thì hint hiện
  "Từ 1 đến 9007199254740991". Mọi bound chạm `MAX_SAFE_INTEGER` bị loại.
- `z.date()` ra **không có `type`**; enum ra `{type:"string", enum:[…]}` nên bị
  nhánh string bắt nhầm. Cả hai đều trả `undefined`.

Gọi một lần ở cấp module (`const RULES = fieldRules(orderSchema)`) — thuần hàm,
kết quả không đổi, nên không cần cache.

### Câu hướng dẫn — `ruleHint`

Chỉ nói thứ **riêng của ô đó**: ví dụ định dạng (email/url), khoảng số, và giới
hạn độ dài **khi ≤ 100 ký tự**. Trên ngưỡng đó, giới hạn là bound của cơ sở dữ
liệu chứ không phải điều người dùng có thể chạm tới.

**Không** nói "Không bắt buộc". Bản đầu có, và trên form đơn hàng nó in ra tám
dòng xám giống hệt nhau trên mười tám ô — đọc thành nhiễu chứ không thành trợ
giúp. Thay bằng một dòng chú thích `* Ô bắt buộc` ở đầu form.

### Legend trong `FormDialog`

Hiện **chỉ khi** form thật sự có ô bắt buộc, quyết định bằng CSS
`group-has-[[data-required]]` so với dấu `data-required` mà `FormField` gắn lên
dấu sao. Không context, không prop, không dialog nào phải nhớ truyền cờ và không
dialog nào truyền sai được.

### `FormField` — validate khi rời ô

Props thêm: `rules?: FieldRule`. Bag truyền xuống thêm `onBlur` và
`onChangeCapture`.

**`onChangeCapture` chứ không phải `onChange`:** các call site đều spread
`{...props}` rồi tự viết `onChange` ngay sau — inject `onChange` sẽ bị ghi đè và
cờ "đã chạm" không bao giờ bật. Prop khác tên thì không thể bị che, nên call site
chỉ phải thêm đúng `rules`.

- `onChangeCapture` → bật `touched`, xoá lỗi cục bộ (đang sửa thì đừng quát).
- `onBlur` → nếu `touched`, chạy `validateValue`.
- Ưu tiên: lỗi server > lỗi cục bộ. Câu lỗi sinh từ `t()`, không lấy chuỗi zod.

**Giới hạn:** `Select`/`Checkbox` (Base UI) không phát `onBlur`/`onChangeCapture`
và không có `.value` → `valueOf()` trả `undefined` và bỏ qua. Giá trị chọn từ
danh sách không thể sai định dạng nên không mất gì.

### `t()` nội suy biến

Mở rộng thành `t(key, vars?)`, thay `{name}`. Cần vì số không đứng cùng vị trí ở
mọi ngôn ngữ (tiếng Nhật để trước, tiếng Ả Rập đọc ngược) — ghép chuỗi trong JS
là đóng cứng trật tự từ tiếng Anh vào cả bảy locale. Tương thích ngược: không
truyền `vars` thì không đụng gì, nên các chỗ đang tự `.replace()` vẫn chạy.

## Tình trạng

| | |
|---|---|
| ✅ `t()` nội suy | `lib/i18n/index.tsx` |
| ✅ `form.json` × 7 locale | 16 key, đã đăng ký trong `translations.ts` |
| ✅ `field-rules.ts` + 17 test | `node --test` — 17/17 xanh |
| ✅ `FormField` + legend `FormDialog` | |
| ✅ **68 ô trên 18 dialog** | 21 ô có câu luật, 47 ô chỉ kiểm khi rời ô |
| ✅ 32 câu viết tay | 29 có sẵn + 3 mới (mã đơn, người nhận, số tiền) × 7 locale |
| ⬜ 47 ô im lặng | cần chữ viết tay — máy không có gì để nói về chúng |
| ⬜ 7 ô auth | chưa dùng `FormField` |

**Đã bỏ khỏi kế hoạch** (over-engineering): cache `WeakMap`, cửa thoát
`rulesHint={false}`, nhánh `enum`/`boolean` trong `FieldRule`, và việc đổi 32 câu
lỗi zod thành mã lỗi.

**Đã thêm sau khi nhìn output thật:**

- Bỏ chữ "Không bắt buộc" khỏi câu tự sinh — nó in ra tám dòng giống hệt nhau
  trên một form. Thay bằng legend một dòng.
- Không in cận dưới bằng 0 ("Ít nhất 0" dưới ô đơn giá nói một điều hiển nhiên).
- Đọc thêm `pattern`: `moneyAmountSchema` và `phoneSchema` là regex, nên trước đó
  **ô số tiền không được kiểm gì ngoài "bắt buộc"** — đúng ô đắt giá nhất.
- Gợi ý **không còn bị ẩn đi khi có lỗi**. Câu lỗi định dạng nói "làm theo ví dụ
  bên dưới"; giấu ví dụ đúng lúc người ta cần nó là ngược đời.

## Giới hạn còn lại

- **`.refine()` không đọc được.** Nó là một hàm, không biểu diễn được trong JSON
  Schema. Cụ thể: `moneyAmountSchema` bắt số phải lớn hơn 0, nên `0.00` vẫn lọt
  qua client và chỉ bị server chặn. Đây là lý do client chỉ là lớp báo sớm, còn
  server vẫn là nơi phán quyết.
- **`priceSchema` (bulk-prices-dialog)** là schema mảng, không phải object, nên
  `fieldRules` không nhận. Ô giá theo bậc chưa nối.
- **`PhoneInput`** khai báo kiểu prop đóng (chỉ `id`, `aria-describedby`,
  `aria-invalid`), nên truyền thêm handler vào sẽ lỗi biên dịch. Ô điện thoại
  trong hồ sơ chưa nối.
- **`artwork-dialog`** — `setOrderArtworkAction` nhận thẳng `FormData`, không qua
  zod; validate nằm trong service và ném `ArtworkError`. Không có luật để suy ra.

## Ràng buộc

- Chạy `bash apps/dashboard/scripts/check-ds-adherence.sh` trước khi commit.
- Key phải có mặt ở **cả 7** locale.
