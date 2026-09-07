/**
 * Khoá chống trùng thật — nội dung dòng băm bằng sha256 cộng ordinal trong
 * file. Cắt riêng khỏi import-key.test.ts vì hàm này cần node:crypto, chỉ chạy
 * được ở server (xem comment trong import-idempotency-key.ts).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { contentOrdinals } from "../import-key.ts";
import { importIdempotencyKey } from "./import-idempotency-key.ts";

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
