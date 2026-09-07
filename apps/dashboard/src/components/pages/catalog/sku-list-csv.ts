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
