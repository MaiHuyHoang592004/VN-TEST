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
