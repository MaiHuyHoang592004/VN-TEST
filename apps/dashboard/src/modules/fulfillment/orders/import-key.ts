/**
 * Thuần, không phụ thuộc runtime — an toàn để import từ CẢ client lẫn server.
 * import-dialog.tsx ("use client") import contentOrdinals thẳng từ đây để tính
 * thứ tự trước khi gửi lên server; phần cần node:crypto (importIdempotencyKey)
 * cố ý nằm ở file riêng, service/import-idempotency-key.ts, để file này không
 * bao giờ kéo một Node builtin vào bundle trình duyệt.
 */

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
