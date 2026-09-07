# Bulk Order P0.0 + P0.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sửa lỗi khoá chống trùng của importer (đang âm thầm tạo đơn trùng khi
tập dòng bị bỏ qua thay đổi), rồi cho seller tra được mã SKU trên catalog — hai
mốc đầu của spec Create Orders in Bulk.

**Architecture:** Tách phần dẫn xuất khoá idempotency ra một module **thuần**
(`import-key.ts`) test được bằng `node --test` không cần database, rồi ghép vào
`createOrders`. Client tính `ordinal` trên **toàn bộ file** và gửi kèm — cùng mẫu
mà `assignSchema` đã dùng cho `idempotencyKey`. Phần catalog thuần client: dữ liệu
cần đã nằm sẵn trên trang, đã lọc scope và đã tính giá theo tier phía server.

**Tech Stack:** Next.js 16, React 19, TypeScript (Node 24 type-stripping gốc),
Prisma 7, zod 4, `node:test` + `node:assert/strict`, Tailwind v4 + token layer.

**Spec:** `docs/superpowers/specs/2026-09-07-bulk-order-redesign-design.md`
(§4 = P0.0, §7 = P0.1). Đọc spec cùng plan này.

## Global Constraints

- **Chạy test thuần:** `npm run test:unit -w @gwprint/dashboard`. File test mới
  **phải được thêm tay** vào script `test:unit` (`apps/dashboard/package.json:12`)
  — nó liệt kê file cụ thể, không dùng glob.
- **Test có DB:** `npm run test:money -w @gwprint/dashboard` chạy **mọi**
  `src/**/*.test.ts` trên một DB tạm. Nó cần `createdb`/`dropdb`.
  **Máy phát triển hiện tại KHÔNG có Postgres client** — lệnh này sẽ hỏng ở đây.
  Test có DB vẫn phải viết, nhưng xác minh bằng CI hoặc máy có Postgres. Đừng báo
  cáo là đã chạy nếu chưa chạy.
- **Import dùng đuôi `.ts`** trong file test và module (`from "./import-key.ts"`)
  — đây là quy ước sẵn có, không phải nhầm.
- Mọi chuỗi hiển thị đi qua `t()`, khoá thêm vào **cả 7** locale:
  `en, zh, vi, ja, ko, fr, ar`.
- Chuỗi mới dùng `t(key, vars)`; **cấm** `.replace("{count}", …)` trong code mới.
- Không literal màu. Chạy `bash apps/dashboard/scripts/check-ds-adherence.sh`
  trước khi commit UI — nó **đang pass**, lỗi mới là của bạn.
- Base UI compose bằng `render={<El />}`, **không bao giờ** `asChild`.
- Không đổi hợp đồng commit của importer: vòng lặp lô vẫn ở client, `BATCH = 50`
  giữ nguyên, mỗi dòng một transaction ở server.

---

## File Structure

| File | Trách nhiệm |
|---|---|
| `apps/dashboard/src/modules/fulfillment/orders/import-key.ts` | **Mới.** Thuần: chuẩn hoá dòng, đếm thứ tự theo nội dung, dựng khoá idempotency. Không import prisma, không side effect. |
| `apps/dashboard/src/modules/fulfillment/orders/import-key.test.ts` | **Mới.** Unit test thuần cho trên. |
| `apps/dashboard/src/modules/fulfillment/orders/service/writes.ts` | Sửa: `createOrders` nhận `ordinals`, dùng `importIdempotencyKey`, trả thêm `deduped`. |
| `apps/dashboard/src/modules/fulfillment/orders/actions.ts` | Sửa: `createOrdersAction` nhận `ordinals`, ép `orderBatchSchema`. |
| `apps/dashboard/src/modules/fulfillment/orders/writes.test.ts` | Sửa: thêm 3 ca chống trùng (chạy trên DB tạm). |
| `apps/dashboard/src/components/pages/orders/import-dialog.tsx` | Sửa: tính ordinal toàn file, gửi kèm, hiện `deduped`. |
| `apps/dashboard/src/components/ds/copy-button.tsx` | **Mới.** `CopyButton` nâng từ api-keys-panel lên DS. |
| `apps/dashboard/src/components/ds/index.ts` | Sửa: export `CopyButton`. |
| `apps/dashboard/src/components/pages/profile/api-keys-panel.tsx` | Sửa: dùng `CopyButton` của DS, xoá bản cục bộ. |
| `apps/dashboard/src/components/pages/catalog/sku-list-csv.ts` | **Mới.** Thuần: dựng CSV danh sách SKU từ dữ liệu trang. |
| `apps/dashboard/src/components/pages/catalog/sku-list-csv.test.ts` | **Mới.** Unit test thuần cho trên. |
| `apps/dashboard/src/components/pages/catalog/catalog-browser.tsx` | Sửa: hiện SKU + Copy, thêm SKU vào tìm kiếm, nút tải danh sách. |
| `apps/dashboard/src/lib/i18n/locales/*/catalog.json` | Sửa (7 file): khoá mới trong `browse`. |
| `apps/dashboard/src/lib/i18n/locales/*/orders.json` | Sửa (7 file): khoá `importDeduped`. |
| `apps/dashboard/package.json` | Sửa: thêm 2 file test mới vào `test:unit`. |

---

## Sai lệch có chủ ý so với spec

Spec §7 viết *"Tải danh sách SKU — cần code server mới, **không** dựng trên dữ
liệu của trang"*, vì lo `pageSize` bị kẹp và lo rò scope.

**Plan này dựng ở client.** Lý do:

- Trang catalog **đã có đúng 4 cột cần** (Product, Variant, SKU, giá theo tier
  của người xem), đã lọc `productScope` và `status === "ACTIVE" && priced` ở
  server (`catalog/page.tsx`).
- Sinh ở client **không thể rò rỉ**: trình duyệt chỉ có dữ liệu người xem vốn đã
  được phép thấy. Ngược lại, viết một query export mới **chính là hình dạng dễ
  rò** — spec tự cảnh báo `findMany` trần là thứ làm lộ cả catalog.
- Bỏ hẳn câu hỏi lưu trữ: không `putObject`, không URL blob công khai mang giá
  đàm phán riêng của một seller.

Cái giá: kế thừa trần **100 sản phẩm** (`products/service.ts:35`,
`Math.min(100, …)`). **Nhưng trần đó đã bóp chính trang catalog rồi** — seller có
>100 sản phẩm thì trang đã sai trước khi có nút tải. Task 8 xử lý riêng.

---

## Task 1: Module khoá idempotency thuần

**Files:**
- Create: `apps/dashboard/src/modules/fulfillment/orders/import-key.ts`
- Test: `apps/dashboard/src/modules/fulfillment/orders/import-key.test.ts`
- Modify: `apps/dashboard/package.json:12`

**Interfaces:**
- Consumes: không gì (thuần, chỉ `node:crypto`).
- Produces:
  - `canonicalRow(raw: unknown): string`
  - `contentOrdinals(rows: readonly unknown[]): number[]`
  - `importIdempotencyKey(owner: string, raw: unknown, ordinal: number): string`

- [ ] **Step 1: Viết test hỏng trước**

Tạo `apps/dashboard/src/modules/fulfillment/orders/import-key.test.ts`:

```ts
/**
 * Khoá chống trùng của importer.
 *
 * Khoá cũ nhúng VỊ TRÍ của dòng trong payload đã gửi — mà payload đã bị lọc bỏ
 * dòng không tra được SKU và bị cắt theo lô 50. Nên sửa một dòng rồi upload lại
 * làm xê dịch khoá của mọi dòng sau nó, và tạo đơn trùng được báo là thành công.
 *
 * Khoá mới dùng nội dung + thứ tự xuất hiện của chính nội dung đó TRONG FILE, nên
 * không dòng nào phụ thuộc vào dòng khác.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { canonicalRow, contentOrdinals, importIdempotencyKey } from "./import-key.ts";

test("canonicalRow bỏ qua thứ tự khoá", () => {
  // Thứ tự khoá đến từ thứ tự CỘT trong file seller. Đảo cột không được đổi khoá.
  assert.equal(canonicalRow({ a: "1", b: "2" }), canonicalRow({ b: "2", a: "1" }));
});

test("canonicalRow phân biệt giá trị khác nhau", () => {
  assert.notEqual(canonicalRow({ a: "1" }), canonicalRow({ a: "2" }));
});

test("canonicalRow phân biệt số với chuỗi", () => {
  // quantity đi qua Number() trước khi gửi; "1" và 1 là hai dòng khác nhau.
  assert.notEqual(canonicalRow({ q: 1 }), canonicalRow({ q: "1" }));
});

test("contentOrdinals đếm từ 1 cho mỗi nội dung riêng biệt", () => {
  assert.deepEqual(contentOrdinals([{ a: 1 }, { a: 2 }, { a: 3 }]), [1, 1, 1]);
});

test("contentOrdinals đánh số các dòng giống hệt nhau theo thứ tự", () => {
  // Hai dòng thật sự giống nhau (đơn tách món) vẫn phải tạo hai đơn.
  assert.deepEqual(contentOrdinals([{ a: 1 }, { a: 1 }, { a: 1 }]), [1, 2, 3]);
});

test("contentOrdinals xen kẽ vẫn đúng", () => {
  assert.deepEqual(contentOrdinals([{ a: 1 }, { a: 2 }, { a: 1 }]), [1, 1, 2]);
});

test("khoá của một dòng KHÔNG đổi khi dòng khác bị xoá", () => {
  // Đây là hồi quy chính: seller xoá dòng lỗi rồi upload lại.
  const rows = [{ a: 1 }, { a: 2 }, { a: 3 }];
  const before = contentOrdinals(rows);
  const keyOfThird = importIdempotencyKey("u1", rows[2], before[2]);

  const afterDelete = [{ a: 1 }, { a: 3 }];
  const ords = contentOrdinals(afterDelete);
  assert.equal(importIdempotencyKey("u1", afterDelete[1], ords[1]), keyOfThird);
});

test("khoá của một dòng KHÔNG đổi khi dòng khác được sửa", () => {
  const rows = [{ a: 1 }, { a: 2 }];
  const keyOfSecond = importIdempotencyKey("u1", rows[1], contentOrdinals(rows)[1]);

  const fixed = [{ a: 99 }, { a: 2 }];
  const ords = contentOrdinals(fixed);
  assert.equal(importIdempotencyKey("u1", fixed[1], ords[1]), keyOfSecond);
});

test("owner khác thì khoá khác", () => {
  assert.notEqual(
    importIdempotencyKey("u1", { a: 1 }, 1),
    importIdempotencyKey("u2", { a: 1 }, 1),
  );
});

test("khoá mang tiền tố import: và độ dài ổn định", () => {
  const key = importIdempotencyKey("u1", { a: 1 }, 1);
  assert.match(key, /^import:u1:[0-9a-f]{32}:1$/);
});
```

- [ ] **Step 2: Chạy để chắc chắn nó hỏng**

```bash
node --test apps/dashboard/src/modules/fulfillment/orders/import-key.test.ts
```

Expected: FAIL — `Cannot find module './import-key.ts'`.

- [ ] **Step 3: Viết implementation tối thiểu**

Tạo `apps/dashboard/src/modules/fulfillment/orders/import-key.ts`:

```ts
import { createHash } from "node:crypto";

/**
 * Một dòng import, ở dạng ổn định để băm.
 *
 * Khoá của object đến từ thứ tự CỘT trong file seller
 * (`Object.fromEntries(headers.map(…))` trong import-dialog), nên đảo cột từng
 * làm đổi hash của cùng một dòng. Sắp xếp khoá làm hết chuyện đó.
 *
 * Không đệ quy: dòng import là object phẳng gồm chuỗi và số. Nếu có ngày sau
 * này thì phải chuẩn hoá nó tại chỗ tạo dòng, không phải ở đây.
 */
export function canonicalRow(raw: unknown): string {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return JSON.stringify(raw);
  }
  const entries = Object.entries(raw as Record<string, unknown>).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  return JSON.stringify(entries);
}

/**
 * Với mỗi dòng, đây là lần xuất hiện thứ mấy (đếm từ 1) của ĐÚNG nội dung đó
 * tính từ đầu file.
 *
 * Đây là thứ thay cho vị-trí-trong-payload ở khoá cũ. Vị trí đổi bất cứ khi nào
 * tập dòng bị bỏ qua thay đổi; thứ tự theo nội dung thì không — nó chỉ phụ thuộc
 * vào chính những dòng có cùng nội dung.
 *
 * Tính trên TOÀN BỘ file đã parse, kể cả dòng sẽ không được gửi. Dòng không tra
 * được SKU không bao giờ dùng tới ordinal của nó, và không thể chiếm chỗ của
 * dòng được gửi: nội dung giống hệt nhau thì tra SKU cũng ra kết quả giống nhau.
 */
export function contentOrdinals(rows: readonly unknown[]): number[] {
  const seen = new Map<string, number>();
  return rows.map((raw) => {
    const key = canonicalRow(raw);
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    return n;
  });
}

/**
 * Khoá chống trùng cho một dòng import.
 *
 * Giữ nguyên tính chất mà createOrders vẫn bảo vệ: hai dòng THẬT SỰ giống hệt
 * nhau (đơn tách nhiều món) vẫn tạo hai đơn — chúng nhận ordinal 1 và 2.
 *
 * `ordinal` do client cấp, đúng mẫu assignSchema đã dùng cho idempotencyKey.
 * An toàn vì client vốn đã kiểm soát toàn bộ nội dung dòng, nên việc này không
 * mở thêm bề mặt nào.
 */
export function importIdempotencyKey(owner: string, raw: unknown, ordinal: number): string {
  const hash = createHash("sha256").update(canonicalRow(raw)).digest("hex").slice(0, 32);
  return `import:${owner}:${hash}:${ordinal}`;
}
```

- [ ] **Step 4: Chạy lại, phải xanh**

```bash
node --test apps/dashboard/src/modules/fulfillment/orders/import-key.test.ts
```

Expected: PASS — 10 tests.

- [ ] **Step 5: Nối vào `test:unit`**

Sửa `apps/dashboard/package.json:12` — thêm file mới vào cuối danh sách:

```json
    "test:unit": "node --test src/modules/fulfillment/orders/status.test.ts src/components/ds/status-tones.test.ts src/components/pages/orders/import-columns.test.ts src/modules/fulfillment/orders/import-key.test.ts",
```

Chạy: `npm run test:unit -w @gwprint/dashboard` → Expected: 32 pass, 0 fail.

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/src/modules/fulfillment/orders/import-key.ts apps/dashboard/src/modules/fulfillment/orders/import-key.test.ts apps/dashboard/package.json
git commit -m "feat(orders): derive the import key from content, not payload position

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: Ghép khoá mới vào `createOrders`

**Files:**
- Modify: `apps/dashboard/src/modules/fulfillment/orders/service/writes.ts:198-251`
- Modify: `apps/dashboard/src/modules/fulfillment/orders/writes.test.ts`

**Interfaces:**
- Consumes: `importIdempotencyKey` từ Task 1.
- Produces: `createOrders(actor, rows, ctx, owner?, ordinals?)` trả thêm
  `deduped: number`.

- [ ] **Step 1: Viết test hỏng trước (chạy trên DB tạm)**

Thêm vào cuối `apps/dashboard/src/modules/fulfillment/orders/writes.test.ts`.
Ba ca này là hồi quy trực tiếp của lỗi:

```ts
test("createOrders: sửa một dòng rồi gửi lại — chỉ dòng đó là mới", async () => {
  const rows = [row(), row(), row()];
  const ordinals = [1, 1, 1];

  const first = await createOrders(admin(), rows, ctx(), sellerId, ordinals);
  assert.equal(first.created, 3);
  first.results.forEach((r) => r.id && orderIds.push(r.id));

  // Seller sửa dòng giữa rồi gửi lại cả file — đúng luồng sửa-inline.
  const fixed = [rows[0], { ...(rows[1] as object), quantity: 7 }, rows[2]];
  const retry = await createOrders(admin(), fixed, ctx(), sellerId, [1, 1, 1]);
  retry.results.forEach((r) => r.id && orderIds.push(r.id));

  assert.equal(retry.deduped, 2, "hai dòng không đổi phải dedupe");
  assert.equal(
    retry.results.filter((r) => r.ok && !r.deduped).length,
    1,
    "đúng một đơn mới — dòng đã sửa",
  );
});

test("createOrders: xoá một dòng rồi gửi lại — không tạo đơn nào mới", async () => {
  const rows = [row(), row(), row()];
  const first = await createOrders(admin(), rows, ctx(), sellerId, [1, 1, 1]);
  assert.equal(first.created, 3);
  first.results.forEach((r) => r.id && orderIds.push(r.id));

  // Seller xoá dòng đầu trong Excel rồi upload lại. Với khoá cũ, cả hai dòng còn
  // lại đổi chỉ số và import lần nữa.
  const afterDelete = [rows[1], rows[2]];
  const retry = await createOrders(admin(), afterDelete, ctx(), sellerId, [1, 1]);
  retry.results.forEach((r) => r.id && orderIds.push(r.id));

  assert.equal(retry.deduped, 2, "cả hai dòng còn lại phải dedupe, không tạo mới");
});

test("createOrders: hai dòng giống hệt nhau vẫn tạo hai đơn", async () => {
  // Đơn tách nhiều món. Tính chất này phải sống sót qua thay đổi khoá.
  const one = row();
  const twins = [one, { ...one }];

  const res = await createOrders(admin(), twins, ctx(), sellerId, [1, 2]);
  res.results.forEach((r) => r.id && orderIds.push(r.id));

  assert.equal(res.created, 2);
  assert.equal(res.deduped, 0);
  assert.notEqual(res.results[0].id, res.results[1].id, "hai đơn riêng biệt");
});
```

- [ ] **Step 2: Xác nhận nó hỏng — và ghi nhận giới hạn máy**

```bash
npm run test:money -w @gwprint/dashboard
```

Expected trên máy CÓ Postgres: FAIL — `deduped` chưa tồn tại và `createOrders`
chưa nhận tham số thứ 5.

**Trên máy phát triển hiện tại lệnh này sẽ hỏng ngay ở `createdb: command not
found`** (không có Postgres client). Đó **không phải** test xanh. Ghi lại là chưa
xác minh được tại chỗ và để CI chạy. Đừng tuyên bố nó pass.

- [ ] **Step 3: Sửa `createOrders`**

Trong `writes.ts`, thay chữ ký và thân vòng lặp:

```ts
export async function createOrders(
  actor: Actor,
  rows: unknown[],
  ctx: AuditContext,
  owner: string = actor.id,
  /**
   * Với mỗi dòng, lần xuất hiện thứ mấy của nội dung đó TRONG FILE của seller.
   * Client tính trên toàn bộ file đã parse (xem contentOrdinals) và gửi kèm, vì
   * server chỉ thấy một lô 50 dòng và không tự đếm được.
   *
   * Thiếu thì lùi về `i + 1` — /api/v1 gửi một mảng độc lập, ở đó vị trí trong
   * mảng CHÍNH LÀ vị trí trong file.
   */
  ordinals?: number[],
) {
  const results: Array<{ column: number; ok: boolean; id?: number; deduped?: boolean; error?: string }> = [];
  for (const [i, raw] of rows.entries()) {
    try {
      // Khoá dẫn từ NỘI DUNG dòng cộng thứ tự xuất hiện của nội dung đó trong
      // file — không phải vị trí trong payload. Vị trí đổi bất cứ khi nào tập
      // dòng bị bỏ qua thay đổi (dòng không tra được SKU bị lọc ở client, rồi
      // cắt lô 50), nên sửa một dòng rồi upload lại từng làm xê dịch khoá của
      // mọi dòng sau nó và tạo đơn trùng ĐƯỢC BÁO LÀ THÀNH CÔNG.
      //
      // Hai dòng thật sự giống hệt nhau (đơn tách món) vẫn tạo hai đơn: chúng
      // nhận ordinal 1 và 2.
      const idempotencyKey = importIdempotencyKey(owner, raw, ordinals?.[i] ?? i + 1);
      const r = await createOrder(actor, raw, ctx, owner, idempotencyKey, false);
```

Thêm import ở đầu file:

```ts
import { importIdempotencyKey } from "../import-key.ts";
```

> Kiểm tra đường dẫn tương đối cho khớp vị trí thật của `writes.ts`
> (`orders/service/writes.ts` → `../import-key.ts`).

Và ở giá trị trả về, **thêm** `deduped` mà **không** đổi nghĩa của `created` —
`writes.test.ts` đang ghim "dedupe không phải thất bại":

```ts
  return {
    ok: true as const,
    created: results.filter((r) => r.ok).length,
    /** Trong số `created`, bao nhiêu dòng chỉ khớp lại đơn đã có. UI phải phân
     * biệt được, nếu không một lần upload lại sẽ báo "137 đơn mới" khi không tạo
     * gì cả. */
    deduped: results.filter((r) => r.ok && r.deduped).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  };
```

- [ ] **Step 4: Xác minh những gì xác minh được tại chỗ**

```bash
npx tsc --noEmit -p apps/dashboard/tsconfig.json
npm run test:unit -w @gwprint/dashboard
```

Expected: typecheck sạch; 32 unit test pass.

Test có DB: chạy `npm run test:money -w @gwprint/dashboard` trên CI hoặc máy có
Postgres. **Ghi rõ trong commit là chưa chạy tại chỗ nếu chưa chạy.**

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/src/modules/fulfillment/orders/service/writes.ts apps/dashboard/src/modules/fulfillment/orders/writes.test.ts
git commit -m "fix(orders): stop the importer duplicating rows a re-upload changed

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: Ép `orderBatchSchema` và nhận `ordinals` ở action

**Files:**
- Modify: `apps/dashboard/src/modules/fulfillment/orders/actions.ts:36-41`

**Interfaces:**
- Consumes: `createOrders(..., ordinals?)` từ Task 2.
- Produces: `createOrdersAction(rows: unknown[], ordinals?: number[])`.

Spec §4 yêu cầu xử lý code chết: `orderBatchSchema` (`schema.ts:56`) có comment
tuyên bố đang chặn ở 500 dòng nhưng **không call site nào**, trong khi
`createOrdersAction` nhận `rows: unknown[]` không kiểm và `createOrders` lặp mảng
dài bao nhiêu cũng được. Quyết định: **ép nó**, không xoá.

- [ ] **Step 1: Sửa action**

```ts
export async function createOrdersAction(rows: unknown[], ordinals?: number[]) {
  const actor = await requirePermission("orders.create");
  // orderBatchSchema tồn tại từ đầu nhưng chưa từng được gọi, nên cái trần 500
  // dòng mà comment của nó hứa hẹn chưa bao giờ có thật: client cắt lô 50, còn
  // server thì lặp mảng dài tuỳ ý dưới giới hạn body 1MB của server action —
  // hỏng ở đó là một lỗi mờ mịt, không phải một thông báo validate.
  //
  // Ép ở đây thay vì xoá schema: một cái trần rõ ràng, thất bại có tên.
  const parsed = orderBatchSchema.safeParse(rows);
  if (!parsed.success) return { ok: false as const, error: "batch-too-large" as const };

  return createOrders(actor, rows, await auditContext(actor), actor.id, ordinals);
}
```

> Đọc `actions.ts` để lấy đúng tên helper dựng `AuditContext` và đúng cách các
> action khác trong file trả lỗi — **theo mẫu sẵn có, đừng bịa**. Nếu file dùng
> `withValidation` cho action khác, giữ nguyên việc `createOrdersAction` **không**
> dùng nó (đó là chủ ý: importer cần lỗi theo từng dòng, không phải một lỗi
> chung).

Thêm `orderBatchSchema` vào import từ `./schema.ts`.

- [ ] **Step 2: Thêm khoá lỗi vào 7 locale**

Trong mỗi `apps/dashboard/src/lib/i18n/locales/<locale>/orders.json`, thêm cạnh
các khoá `err*` sẵn có:

```json
    "errBatchTooLarge": "Too many rows in one submission. Split the file and try again.",
```

Bản tiếng Việt: `"Quá nhiều dòng trong một lần gửi. Hãy tách file rồi thử lại."`
Sáu ngôn ngữ còn lại dịch tương ứng.

Nối vào map `errorMessages` ở nơi hiển thị lỗi import.

- [ ] **Step 3: Xác minh**

```bash
npx tsc --noEmit -p apps/dashboard/tsconfig.json
node -e "for (const l of ['en','zh','vi','ja','ko','fr','ar']) { const j = require('./apps/dashboard/src/lib/i18n/locales/'+l+'/orders.json'); if (!j.errBatchTooLarge) { console.error('THIEU khoa o', l); process.exit(1); } } console.log('7 locale du khoa')"
```

Expected: typecheck sạch; script in `7 locale du khoa`.

- [ ] **Step 4: Commit**

```bash
git add apps/dashboard/src/modules/fulfillment/orders/actions.ts apps/dashboard/src/lib/i18n/locales
git commit -m "fix(orders): make orderBatchSchema's promised 500-row cap real

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: Client tính ordinal và hiện `deduped`

**Files:**
- Modify: `apps/dashboard/src/components/pages/orders/import-dialog.tsx:110-150, 290-300`
- Modify: `apps/dashboard/src/lib/i18n/locales/*/orders.json` (7 file)

**Interfaces:**
- Consumes: `contentOrdinals` (Task 1), `createOrdersAction(rows, ordinals)` (Task 3),
  `createOrders` trả `deduped` (Task 2).
- Produces: không gì cho task sau.

- [ ] **Step 1: Tính ordinal trên TOÀN BỘ file, trước vòng lặp lô**

Trong `run()`, ngay trước `for (let start = 0; ...)`:

```ts
    // Dựng dòng ứng viên cho MỌI dòng đã parse — kể cả dòng sẽ không được gửi —
    // rồi đếm thứ tự trên toàn bộ file. Ordinal phải phản ánh vị trí trong FILE
    // của seller, không phải trong payload đã lọc và đã cắt lô, nếu không nó
    // chính là cái vị-trí-trong-payload mà thay đổi này sinh ra để loại bỏ.
    //
    // Dòng không tra được SKU không bao giờ dùng ordinal của nó và không thể
    // chiếm chỗ của dòng được gửi: nội dung giống hệt nhau thì tra SKU cũng ra
    // kết quả giống nhau.
    const candidates = rows.map((r, i) => ({
      ...r,
      quantity: Number(r.quantity),
      productVariantId: ids[i],
    }));
    const ordinals = contentOrdinals(candidates);
```

- [ ] **Step 2: Gửi kèm ordinal theo từng lô**

Trong thân vòng lặp, dựng thêm mảng ordinal song song với `payload`:

```ts
      const payload: Record<string, unknown>[] = [];
      const rowIndex: number[] = [];
      const batchOrdinals: number[] = [];

      slice.forEach((r, i) => {
        const abs = start + i;
        if ((ids[abs] ?? null) === null) {
          all.push({ column: abs, ok: false, error: t("orders.importNoSku") });
          return;
        }
        payload.push(candidates[abs]);
        rowIndex.push(abs);
        batchOrdinals.push(ordinals[abs]);
      });

      if (payload.length) {
        const res = await createOrdersAction(payload, batchOrdinals);
        res.results.forEach((r, i) =>
          all.push({ column: rowIndex[i], ok: r.ok, deduped: r.deduped, error: r.error }),
        );
      }
```

Mở rộng type `RowResult` ở đầu file:

```ts
type RowResult = { column: number; ok: boolean; deduped?: boolean; error?: string };
```

Thêm import:

```ts
import { contentOrdinals } from "@/modules/fulfillment/orders/import-key";
```

- [ ] **Step 3: Hiện `deduped` ở màn kết quả**

`created` hiện đang **gộp cả dòng dedupe**, nên upload lại một file báo "137 đơn
đã tạo" trong khi không tạo gì. Tách ra:

```ts
  const failed = results?.filter((r) => !r.ok) ?? [];
  const deduped = results?.filter((r) => r.ok && r.deduped).length ?? 0;
  const created = (results?.filter((r) => r.ok).length ?? 0) - deduped;
```

Và trong khối badge, thêm giữa `created` và `failed`:

```tsx
            {deduped > 0 && (
              <Badge variant="secondary">
                {t("orders.importDeduped", { count: deduped })}
              </Badge>
            )}
```

> `t(key, vars)` — **không** dùng `.replace("{count}", …)` cho chuỗi mới, dù các
> badge cạnh bên đang dùng. Ràng buộc toàn cục.

- [ ] **Step 4: Thêm khoá vào 7 locale**

Mỗi `locales/<locale>/orders.json`:

```json
    "importDeduped": "{count} already imported",
```

Tiếng Việt: `"{count} đã import trước đó"`. Sáu ngôn ngữ còn lại dịch tương ứng.

- [ ] **Step 5: Xác minh**

```bash
npx tsc --noEmit -p apps/dashboard/tsconfig.json
npm run test:unit -w @gwprint/dashboard
node -e "for (const l of ['en','zh','vi','ja','ko','fr','ar']) { const j = require('./apps/dashboard/src/lib/i18n/locales/'+l+'/orders.json'); if (!j.importDeduped) { console.error('THIEU khoa o', l); process.exit(1); } } console.log('7 locale du khoa')"
```

Expected: cả ba sạch.

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/src/components/pages/orders/import-dialog.tsx apps/dashboard/src/lib/i18n/locales
git commit -m "fix(orders): count a re-import as re-imported, not as created

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: Nâng `CopyButton` lên design system

**Files:**
- Create: `apps/dashboard/src/components/ds/copy-button.tsx`
- Modify: `apps/dashboard/src/components/ds/index.ts`
- Modify: `apps/dashboard/src/components/pages/profile/api-keys-panel.tsx:29-65`

**Interfaces:**
- Produces: `CopyButton({ value, label, copiedLabel?, size?, variant? })`.

- [ ] **Step 1: Tạo component**

Chép **nguyên vẹn** logic từ `api-keys-panel.tsx` — try/catch quanh
`navigator.clipboard`, timer giữ trong ref, dọn khi unmount. Đây là code đã trả
giá để học; đừng viết lại từ đầu.

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n";

/**
 * Chép một giá trị máy đọc (mã API, mã SKU) vào clipboard.
 *
 * Nâng lên từ api-keys-panel, nơi hai điều đã được học bằng lỗi thật:
 * navigator.clipboard là undefined ngoài secure context và có thể bị từ chối
 * quyền — không bọc thì cả hai hỏng IM LẶNG trong khi dấu tick vẫn hiện, và
 * người dùng bỏ đi tay không. Và timer sống lâu hơn nút khi dialog đóng giữa
 * chừng, nên phải dọn lúc unmount thay vì để nó set state lên component đã chết.
 */
export function CopyButton({
  value,
  label,
  size = "sm",
  variant = "outline",
}: {
  value: string;
  /** Tên khả truy cập. Bắt buộc — nút chỉ có icon. */
  label: string;
  size?: "sm" | "icon-sm";
  variant?: "outline" | "ghost";
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      aria-label={label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
        } catch {
          toast.error(t("common.copyFailed"));
          return;
        }
        setCopied(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
    </Button>
  );
}
```

> Namespace `common` **đã tồn tại** (`locales/en/common.json`, đã có khoá `copy`).
> Thêm `copyFailed` vào đó ở cả 7 locale. **Không tạo namespace mới** — thêm một
> namespace là 8 file và 14 sửa đổi trong `translations.ts`, cho một khoá thì
> không đáng.
>
> Tiếng Anh: `"copyFailed": "Couldn't copy. Select the text and copy it manually."`
> Tiếng Việt: `"Không chép được. Hãy bôi đen rồi chép thủ công."`

- [ ] **Step 2: Export từ DS**

Trong `components/ds/index.ts`, thêm theo đúng thứ tự alphabet đang có (sau
`ChartFrame`, trước `CraftCut`):

```ts
export { CopyButton } from "./copy-button";
```

- [ ] **Step 3: Thay bản cục bộ trong api-keys-panel**

Xoá `function CopyButton(...)` cục bộ, import từ `@/components/ds`, và truyền
`label` như cũ. Nếu chuỗi lỗi đổi từ `profile.api.copyFailed` sang
`common.copyFailed`, giữ khoá cũ trong file locale (còn chỗ khác dùng) hoặc xoá
nếu grep xác nhận không còn ai dùng.

- [ ] **Step 4: Xác minh**

```bash
npx tsc --noEmit -p apps/dashboard/tsconfig.json
bash apps/dashboard/scripts/check-ds-adherence.sh
```

Expected: typecheck sạch; script DS pass (nó **đang** pass — lỗi mới là của bạn).

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/src/components/ds apps/dashboard/src/components/pages/profile/api-keys-panel.tsx apps/dashboard/src/lib/i18n/locales
git commit -m "refactor(ds): promote CopyButton, secure-context guard and all

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: Catalog hiện mã SKU

**Files:**
- Modify: `apps/dashboard/src/components/pages/catalog/catalog-browser.tsx:36-43, 181-196, 218-232`
- Modify: `apps/dashboard/src/lib/i18n/locales/*/catalog.json` (7 file)

**Interfaces:**
- Consumes: `CopyButton` từ Task 5. `CatalogProduct.skus[].sku` đã có sẵn trong
  type (`catalog-browser.tsx:16`) — trang đã lấy nó từ server, chỉ chưa render.

- [ ] **Step 1: Thêm SKU vào ô tìm kiếm**

```ts
  const filtered = needle
    ? products.filter(
        (p) =>
          p.name.toLowerCase().includes(needle) ||
          p.key.toLowerCase().includes(needle) ||
          p.skus.some(
            (s) =>
              s.variantName.toLowerCase().includes(needle) ||
              (s.sku ?? "").toLowerCase().includes(needle),
          ),
      )
    : products;
```

- [ ] **Step 2: Render SKU + Copy trong panel biến thể (grid view)**

Thay thân `p.skus.map(...)` trong khối `openId === p.id`:

```tsx
                  {p.skus.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between gap-2 text-(length:--fs-meta)"
                    >
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-(--text-body)">{s.variantName}</span>
                        {s.sku && (
                          <span className="truncate font-mono text-(length:--fs-micro) tracking-(--ls-mono) text-(--text-muted)">
                            {s.sku}
                          </span>
                        )}
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        <span className="font-mono tracking-(--ls-mono) tabular-nums">
                          {money(s.price)}
                        </span>
                        {s.sku && (
                          <CopyButton
                            value={s.sku}
                            label={t("catalog.browse.copySku", { sku: s.sku })}
                            variant="ghost"
                            size="icon-sm"
                          />
                        )}
                      </span>
                    </div>
                  ))}
```

> Khối này là **anh em** của nút header, nằm ngoài nó — đúng như cấu trúc hiện
> tại. Đừng lồng nút Copy vào trong `<button>` header: tên khả truy cập của
> header sẽ nuốt luôn nó.

- [ ] **Step 3: Render SKU trong list view**

Trong pill của list view, thêm mã dưới tên biến thể:

```tsx
                    <span
                      key={s.id}
                      className="inline-flex items-center gap-1.5 rounded-(--radius-pill) bg-(--surface-inset) px-2.5 py-1 text-(length:--fs-meta) text-(--text-body)"
                    >
                      <span>{s.variantName}</span>
                      {s.sku && (
                        <span className="font-mono text-(length:--fs-micro) tracking-(--ls-mono) text-(--text-muted)">
                          {s.sku}
                        </span>
                      )}
                      <span className="font-mono tracking-(--ls-mono) tabular-nums">
                        {money(s.price)}
                      </span>
                    </span>
```

- [ ] **Step 4: Thêm khoá vào 7 locale**

Trong `catalog.json`, khối `browse`:

```json
    "copySku": "Copy SKU {sku}",
    "copied": "SKU copied",
```

Tiếng Việt: `"Chép mã SKU {sku}"` / `"Đã chép mã SKU"`.

- [ ] **Step 5: Xác minh trong trình duyệt**

Khởi động preview và kiểm thật, đừng chỉ typecheck:

1. `preview_start` với cấu hình dev của dashboard.
2. Vào `/catalog`, mở một sản phẩm, xác nhận mã SKU hiện dưới tên biến thể.
3. Bấm Copy, xác nhận đổi sang dấu tick rồi trở lại sau ~1.5s.
4. Gõ một mã SKU vào ô tìm kiếm, xác nhận nó lọc ra đúng sản phẩm.
5. `read_console_messages` — không có lỗi.
6. `resize_window` preset `mobile`, xác nhận pill không tràn ngang.

```bash
npx tsc --noEmit -p apps/dashboard/tsconfig.json
bash apps/dashboard/scripts/check-ds-adherence.sh
```

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/src/components/pages/catalog apps/dashboard/src/lib/i18n/locales
git commit -m "feat(catalog): show the SKU the spreadsheet import asks for

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 7: Tải danh sách SKU (CSV sinh ở client)

**Files:**
- Create: `apps/dashboard/src/components/pages/catalog/sku-list-csv.ts`
- Test: `apps/dashboard/src/components/pages/catalog/sku-list-csv.test.ts`
- Modify: `apps/dashboard/src/components/pages/catalog/catalog-browser.tsx` (hàng action)
- Modify: `apps/dashboard/package.json:12`
- Modify: `apps/dashboard/src/lib/i18n/locales/*/catalog.json` (7 file)

**Interfaces:**
- Consumes: type `CatalogProduct` (`catalog-browser.tsx:11-17`).
- Produces: `skuListCsv(products: CatalogProduct[]): string`.

- [ ] **Step 1: Viết test hỏng trước**

Tạo `sku-list-csv.test.ts`:

```ts
/**
 * Danh sách SKU seller tải về để dò mã khi điền template.
 *
 * Sinh ở client từ dữ liệu trang: trình duyệt chỉ có sản phẩm người xem được
 * phép đặt, ở giá của tier họ — nên bản CSV này không thể lộ thứ trang không
 * lộ. Viết một query export mới thì phải tự lặp lại luật scope, và đó chính là
 * hình dạng làm rò cả catalog.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { skuListCsv } from "./sku-list-csv.ts";

const product = (over = {}) => ({
  id: 1,
  name: "Gildan 5000",
  key: "gildan-5000",
  thumbnail: null,
  skus: [{ id: 10, variantName: "Black / L", sku: "G5000-BLK-L", price: "5.20" }],
  ...over,
});

test("một hàng tiêu đề cộng một dòng cho mỗi SKU", () => {
  const csv = skuListCsv([product()]);
  assert.deepEqual(csv.split("\n"), [
    "Product,Variant,SKU,Your price",
    "Gildan 5000,Black / L,G5000-BLK-L,5.20",
  ]);
});

test("dấu phẩy trong tên được bọc nháy", () => {
  // Tên sản phẩm thật có dấu phẩy; không bọc là lệch cột mọi dòng sau đó.
  const csv = skuListCsv([product({ name: "Mug, 11oz" })]);
  assert.equal(csv.split("\n")[1], '"Mug, 11oz",Black / L,G5000-BLK-L,5.20');
});

test("nháy kép trong tên được nhân đôi", () => {
  const csv = skuListCsv([product({ name: 'The "Big" One' })]);
  assert.equal(csv.split("\n")[1], '"The ""Big"" One",Black / L,G5000-BLK-L,5.20');
});

test("SKU chưa có mã bị bỏ — không có gì để chép vào template", () => {
  const csv = skuListCsv([
    product({ skus: [{ id: 10, variantName: "Black / L", sku: null, price: "5.20" }] }),
  ]);
  assert.equal(csv, "Product,Variant,SKU,Your price");
});

test("nhiều sản phẩm giữ nguyên thứ tự của trang", () => {
  const csv = skuListCsv([
    product(),
    product({ id: 2, name: "Mug", skus: [{ id: 20, variantName: "11oz", sku: "MUG-11", price: "3.00" }] }),
  ]);
  assert.equal(csv.split("\n").length, 3);
  assert.match(csv.split("\n")[2], /^Mug,11oz,MUG-11,3\.00$/);
});
```

- [ ] **Step 2: Chạy để chắc chắn nó hỏng**

```bash
node --test apps/dashboard/src/components/pages/catalog/sku-list-csv.test.ts
```

Expected: FAIL — `Cannot find module './sku-list-csv.ts'`.

- [ ] **Step 3: Viết implementation**

```ts
import type { CatalogProduct } from "./catalog-browser";

/** Bọc một ô theo RFC-4180 khi nó chứa dấu phẩy, nháy kép hoặc xuống dòng. */
function cell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

/**
 * Danh sách SKU, dạng CSV, để seller dò mã khi điền template đơn hàng.
 *
 * Dựng từ dữ liệu ĐÃ NẰM TRÊN TRANG. Trang đã lọc theo productScope và đã tính
 * giá theo tier của người xem ở server, nên bản CSV này không thể lộ thứ trang
 * không lộ — không có luật phân quyền nào được lặp lại ở đây để mà lặp sai.
 *
 * Tiêu đề để tiếng Anh và cố định: seller dán mã từ đây sang cột SKU của
 * template, mà template khớp tiêu đề bằng chuỗi tiếng Anh cứng.
 *
 * SKU chưa có mã bị bỏ hẳn: không có gì để chép, và một dòng trống chỉ làm người
 * ta tưởng mình đọc sót.
 */
export function skuListCsv(products: CatalogProduct[]): string {
  const lines = ["Product,Variant,SKU,Your price"];
  for (const p of products) {
    for (const s of p.skus) {
      if (!s.sku) continue;
      lines.push([cell(p.name), cell(s.variantName), cell(s.sku), cell(s.price)].join(","));
    }
  }
  return lines.join("\n");
}
```

- [ ] **Step 4: Chạy lại, phải xanh**

```bash
node --test apps/dashboard/src/components/pages/catalog/sku-list-csv.test.ts
```

Expected: PASS — 5 tests.

- [ ] **Step 5: Nối vào `test:unit`**

Thêm `src/components/pages/catalog/sku-list-csv.test.ts` vào cuối danh sách
`test:unit`, rồi `npm run test:unit -w @gwprint/dashboard` → Expected: 37 pass.

- [ ] **Step 6: Thêm nút tải vào hàng action của SearchShell**

Trong `catalog-browser.tsx`, trong `<Surface>` chứa `SearchField` và toggle
grid/list — **không** đưa vào `CatalogHeader` (`PageHeader` từ chối CTA theo
thiết kế):

```tsx
        <div className="flex shrink-0 gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              const url = URL.createObjectURL(
                new Blob([skuListCsv(products)], { type: "text/csv" }),
              );
              const a = document.createElement("a");
              a.href = url;
              a.download = "gwp-sku-list.csv";
              a.click();
              // Thu hồi ở tick SAU, không đồng bộ: Firefox và Safari chưa chắc
              // đã bắt đầu đọc blob khi click() trả về, và phá object URL dưới
              // chân chúng sẽ huỷ luôn lượt tải. Cùng lý do với downloadTemplate.
              setTimeout(() => URL.revokeObjectURL(url), 0);
            }}
          >
            <Download className="mr-1.5 size-4" />
            {t("catalog.browse.downloadSkus")}
          </Button>
          {/* … hai nút toggle grid/list sẵn có … */}
        </div>
```

Thêm import `Download` từ `lucide-react` và `skuListCsv` từ `./sku-list-csv`.

- [ ] **Step 7: Thêm khoá vào 7 locale**

```json
    "downloadSkus": "Download SKU list",
```

Tiếng Việt: `"Tải danh sách SKU"`.

- [ ] **Step 8: Xác minh trong trình duyệt**

1. Vào `/catalog`, bấm "Tải danh sách SKU".
2. Mở file tải về, xác nhận có tiêu đề và một dòng cho mỗi SKU có mã.
3. `read_console_messages` — không lỗi.

```bash
npx tsc --noEmit -p apps/dashboard/tsconfig.json
bash apps/dashboard/scripts/check-ds-adherence.sh
```

- [ ] **Step 9: Commit**

```bash
git add apps/dashboard/src/components/pages/catalog apps/dashboard/package.json apps/dashboard/src/lib/i18n/locales
git commit -m "feat(catalog): let a seller take the SKU list to their spreadsheet

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 8: Trần 100 sản phẩm của trang catalog

**Files:**
- Modify: `apps/dashboard/src/app/(protected)/catalog/page.tsx:20`

`listProducts` kẹp cứng `pageSize = Math.min(100, …)`
(`modules/catalog/products/service.ts:35`), và trang truyền `pageSize: 100`. Nên
seller thứ 101 sản phẩm trở đi **biến mất khỏi trang, im lặng** — và giờ cũng
biến mất khỏi danh sách SKU tải về.

Hôm nay catalog có **32 sản phẩm**, nên chưa ai bị. Nhưng nó sẽ hỏng không báo.

- [ ] **Step 1: Làm cho trần lộ ra thay vì im lặng**

Trong `catalog/page.tsx`, lấy cả `total` và so sánh:

```tsx
  const { rows, total } = await listProducts({ status: "ACTIVE", pageSize: 100 });
```

Truyền xuống `CatalogBrowser` một cờ `truncated={total > rows.length}`, và render
một `<Callout tone="attention">` phía trên lưới khi cờ bật:

```tsx
      {truncated && (
        <Callout tone="attention">{t("catalog.browse.truncated")}</Callout>
      )}
```

Khoá cho 7 locale:

```json
    "truncated": "Only the first 100 products are shown. Contact support if you need the full catalogue.",
```

Tiếng Việt: `"Chỉ hiện 100 sản phẩm đầu. Liên hệ hỗ trợ nếu bạn cần toàn bộ danh mục."`

> **Không** nâng trần trong `products/service.ts` ở task này. Cái kẹp đó bảo vệ
> mọi caller khác của `listProducts`, gồm cả bảng admin, và nâng nó là một quyết
> định riêng cần đo. Ở đây chỉ làm cho việc cắt cụt **nhìn thấy được** thay vì im
> lặng — đó là phần rẻ và đúng.

- [ ] **Step 2: Xác minh**

```bash
npx tsc --noEmit -p apps/dashboard/tsconfig.json
bash apps/dashboard/scripts/check-ds-adherence.sh
node -e "for (const l of ['en','zh','vi','ja','ko','fr','ar']) { const j = require('./apps/dashboard/src/lib/i18n/locales/'+l+'/catalog.json'); for (const k of ['copySku','copied','downloadSkus','truncated']) if (!j.browse?.[k]) { console.error('THIEU', k, 'o', l); process.exit(1); } } console.log('7 locale du 4 khoa')"
```

- [ ] **Step 3: Commit**

```bash
git add "apps/dashboard/src/app/(protected)/catalog/page.tsx" apps/dashboard/src/components/pages/catalog apps/dashboard/src/lib/i18n/locales
git commit -m "fix(catalog): say so when the product list is truncated at 100

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage (§4 P0.0 và §7 P0.1):**

| Yêu cầu spec | Task |
|---|---|
| §4 khoá dùng nội dung + ordinal trong file | 1, 2 |
| §4 `canonical()` sắp xếp khoá | 1 |
| §4 giữ tính chất hai dòng giống hệt → hai đơn | 1 (test), 2 (test) |
| §4 `createOrders` nhận ordinal tường minh | 2 |
| §4 bộc lộ `deduped`, không đổi nghĩa `created` | 2, 4 |
| §4 xử lý `orderBatchSchema` code chết | 3 |
| §4 cửa sổ khoá cũ phải ghi vào changelog | 2 (commit message) |
| §7 catalog render `s.sku` | 6 |
| §7 nút Copy là anh em, không lồng trong header | 6 |
| §7 nâng `CopyButton` lên `components/ds/` | 5 |
| §7 thêm `sku` vào needle tìm kiếm | 6 |
| §7 tải danh sách SKU, 4 cột, không lộ `salePrice` | 7 |
| §7 nút ở hàng action SearchShell, không ở PageHeader | 7 |
| §7 bỏ cột ảnh khỏi phạm vi | 7 (không có cột ảnh) |
| §7 trần `pageSize` 100 | 8 |
| §7 bỏ mục nhãn variant (session khác đã sửa) | — không cần task |

**Sai lệch có chủ ý:** §7 bảo dựng export bằng server; plan dựng ở client — lý do
ghi ở mục "Sai lệch có chủ ý" phía trên. **Spec phải được cập nhật sau khi duyệt
plan này**, để hai tài liệu không mâu thuẫn.

**Chưa phủ ở plan này (thuộc P0.2 / P0.3 / P1, plan sau):** template CSV, trang
`/orders/bulk`, màn Review, sửa inline, nhận `.xlsx`, quy tắc Google Drive §6.6.

**Type consistency:** `contentOrdinals` / `canonicalRow` / `importIdempotencyKey`
dùng đúng tên đó ở Task 1, 2 và 4. `skuListCsv` dùng đúng tên ở Task 7. `deduped`
là `boolean` trên từng dòng (`results[].deduped`) và `number` ở mức tổng hợp
(`createOrders().deduped`) — hai thứ khác nhau, tên giống nhau, **đã kiểm tra là
có chủ ý** và khớp với `createOrder` vốn đã trả `deduped: boolean` mỗi dòng.
