/**
 * Danh sách SKU seller tải về để dò mã khi điền template đơn hàng.
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
