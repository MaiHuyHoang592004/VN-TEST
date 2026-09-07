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
