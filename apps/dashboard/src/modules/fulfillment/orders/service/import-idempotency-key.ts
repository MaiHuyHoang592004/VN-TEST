import { createHash } from "node:crypto";

import { canonicalRow } from "../import-key.ts";

/**
 * Khoá chống trùng cho một dòng import.
 *
 * Tách khỏi import-key.ts vì file đó phải an toàn để import-dialog.tsx
 * ("use client") dùng thẳng cho `contentOrdinals` — kéo node:crypto vào một
 * file mà client import là thứ Next.js từ chối build. File này chỉ có một nơi
 * gọi: createOrders (writes.ts), luôn chạy phía server.
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
