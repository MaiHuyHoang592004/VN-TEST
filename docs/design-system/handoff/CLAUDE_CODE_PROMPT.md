# Prompt để chạy Claude Code — dựng toàn bộ FE

Chuẩn bị 1 lần: tải project design system này về, giải nén cạnh `FE-VN/` thành `gwp-design-system/`, rồi mở Claude Code ở folder cha (thấy được cả hai). Copy `handoff/TARGET_CLAUDE.md` → `FE-VN/CLAUDE.md` trước khi bắt đầu.

```
../
  FE-VN/                 ← FE build ở đây
  gwp-design-system/     ← design system (source of truth)
```

---

## PROMPT 0 — kickoff (dán 1 lần, đầu session đầu tiên)

```
Bạn sẽ dựng toàn bộ frontend GWP Fulfillment trong ./FE-VN từ design system ở
./gwp-design-system. Design system là source of truth cho MỌI thứ về hình thức;
backend đã attach là source of truth cho ý nghĩa dữ liệu. Không tự sáng tác cả hai.

BƯỚC 1 — đọc trước khi viết một dòng code, theo đúng thứ tự này:
  gwp-design-system/CLAUDE_CODE_HANDOFF.md
  gwp-design-system/SKILL.md
  gwp-design-system/readme.md
  gwp-design-system/handoff/APP_SCAFFOLD.md
  gwp-design-system/handoff/API_CLIENT.md
  gwp-design-system/handoff/AUTH_AND_ROLES.md
  gwp-design-system/handoff/BUILD_PLAN.md
  gwp-design-system/handoff/routes.json
  gwp-design-system/STATES.md · I18N.md · ICONS.md · RESPONSIVE.md · A11Y.md
  gwp-design-system/BE_ALIGNMENT.md · BACKEND_GAPS.md · BACKEND_ASKS.md
  gwp-design-system/DOMAIN_RESOLVED.md · types/domain.d.ts
  gwp-design-system/examples/golden-path/README.md
Xong thì tóm tắt cho tôi 10 dòng: 2 app + 1 app public, tổng số route, thứ tự
7 phase, và 6 hazard backend. Nếu bất kỳ file trên thiếu — dừng và báo, đừng đoán.

BƯỚC 2 — thực thi handoff/BUILD_PLAN.md từ Phase 0. Mỗi phase là một hoặc nhiều
PR-sized commit; commit nào cũng phải build + typecheck + lint sạch trước khi sang
bước sau. Sau mỗi phase, in ra checklist acceptance criteria của phase đó kèm
trạng thái từng dòng, rồi DỪNG cho tôi xem trước khi sang phase tiếp.

LUẬT TUYỆT ĐỐI (vi phạm là làm lại):
1. Mọi màu/font/radius/shadow chỉ đến từ handoff/gwp.theme.css. Không hex inline,
   không thêm màu mới, không sửa tay file theme.
2. Không đọc `theme`/`color` từ metadata.ts của backend (GET /api/metadata) — đó là
   palette cũ đã bỏ. Màu status chỉ từ STATUS_TONES / --status-*.
3. Không port gì từ FE Metronic cũ về mặt hình thức, không dùng tokens.css graphite
   cũ. FE cũ chỉ là nguồn CONTRACT (field, route, role), không phải nguồn visual.
4. Không cài UI kit (Metronic/shadcn/MUI/Ant/Chakra/Bootstrap), không CSS-in-JS,
   không MSW hay bất kỳ mock layer nào. Nối backend thật từ ngày đầu.
5. Không dịch enum tiếng Việt (TICKET_REASON, ORDER_STATUS, tên route kho).
6. Không bịa order state, role, quy tắc SKU/BOM, semantic ví, quy tắc giá, hay bất
   kỳ con số API không trả. Render placeholder đã ghi sẵn + ghi thêm dòng vào
   BACKEND_ASKS.md. Thà thiếu còn hơn sai.
7. Không zero-fill chuỗi dữ liệu chart. Không prefetch/retry/gọi 2 lần API scan.
8. Màn nào cũng phải có đủ loading / empty / error / no-permission theo STATES.md.
9. Dưới 1024px chưa được thiết kế — đừng tự nghĩ layout mobile.
10. Screen dựng từ component trong packages/ds, không viết markup rời.

Khi nguồn xung đột, ưu tiên: readme.md + SKILL.md → file HTML của màn + README của
surface → handoff/routes.json → BE_ALIGNMENT.md + types/domain.d.ts → FE cũ (chỉ
contract) → hết. Không có nguồn thứ bảy.

Bắt đầu bằng Phase 0.
```

---

## PROMPT 1 — vòng lặp mỗi màn (dán khi vào Phase 3 trở đi)

Dùng lại nguyên văn cho từng màn, chỉ đổi tên màn:

```
Dựng màn <TÊN MÀN, ví dụ SellerOrders>.

Đọc trước: entry của nó trong handoff/routes.json (route, roles, shell, components,
domainBound) · file HTML gốc trong ui_kits/ · đúng section của nó trong README của
surface đó · ảnh tham chiếu trong screenshots/reference/ · endpoint của nó trong
BE_ALIGNMENT.md §3 · shape dữ liệu trong types/domain.d.ts · states trong STATES.md.

Rồi trước khi code, nói cho tôi 6 dòng:
  - route + roles + shell
  - endpoint nào, param gì, trả shape gì
  - component nào trong packages/ds sẽ dùng (thiếu cái nào thì báo, đừng tự tạo mới)
  - field nào là domainBound và sẽ render placeholder ra sao
  - filter/pagination convention của màn này (page-size options riêng, URL state)
  - có hazard backend nào chạm vào màn này không

Code xong thì chạy VERIFY.md so với ảnh tham chiếu, và tự tick "Definition of done"
trong CLAUDE_CODE_HANDOFF.md, dán kết quả ra. Cái nào không đạt thì nói thẳng.
```

---

## PROMPT 2 — sửa khi verify lệch

```
So màn <TÊN MÀN> với screenshots/reference/<file>.png. Với mỗi lệch: nói lệch cái gì,
token/component nào lẽ ra phải dùng, rồi sửa. Không "cải tiến" thiết kế, không đổi
spacing/màu/size chỗ tôi không hỏi. Nếu bạn cho rằng bản reference sai, báo tôi —
đừng tự đổi.
```

---

## PROMPT 3 — chốt cuối, quét toàn bộ

```
Audit toàn bộ FE-VN:
1. Mọi route trong handoff/routes.json có app=seller|admin đã tồn tại và tới được từ
   nav bởi ít nhất một role được phép? Liệt kê route nào thiếu.
2. Grep tìm hex màu hard-code, font-family hard-code, px magic number ngoài theme.
3. Grep tìm mock data, fixture, MSW, TODO còn sót trong đường dữ liệu.
4. Grep tìm chỗ đọc theme/color từ metadata.
5. Mọi screen có đủ 4 state chưa (STATES.md)?
6. Role gate của route nào không khớp roles trong routes.json?
7. Field domainBound nào đã bị âm thầm biến thành dữ liệu thật?
Xuất một bảng: vấn đề · file · mức độ. Chưa sửa gì, chờ tôi quyết.
```
