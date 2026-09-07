/**
 * Thứ tự dòng theo nội dung — phần THUẦN của khoá chống trùng, dùng được ở cả
 * client và server.
 *
 * Khoá cũ (writes.ts trước khi sửa) nhúng VỊ TRÍ của dòng trong payload đã gửi
 * — mà payload đã bị lọc bỏ dòng không tra được SKU và bị cắt theo lô 50. Nên
 * sửa một dòng rồi upload lại làm xê dịch khoá của mọi dòng sau nó, và tạo đơn
 * trùng được báo là thành công.
 *
 * Khoá mới dùng nội dung + thứ tự xuất hiện của chính nội dung đó TRONG FILE —
 * hai hàm ở đây tính đúng thứ tự đó. Phần ghép thứ tự này với sha256 thành khoá
 * thật (importIdempotencyKey) nằm ở service/import-idempotency-key.test.ts,
 * vì nó cần node:crypto và chỉ chạy được ở server.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { canonicalRow, contentOrdinals } from "./import-key.ts";

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
