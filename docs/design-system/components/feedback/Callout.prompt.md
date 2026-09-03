The note banner for a caveat, a confirmation, or an unconfirmed-with-backend flag. One component instead of a local `SourceNote()` per screen.

```jsx
<Callout tone="info">Ba trong năm nhóm trên seller tự xử được, vì backend cho phép đúng hai hành động edit và update_info_customer.</Callout>
<Callout tone="attention">Chưa xác nhận với backend — dựng theo mô tả nghiệp vụ, cần đọc entity trước khi nối API.</Callout>
<Callout tone="success" icon={<CheckCircle2 size={15} />}>Đã gửi yêu cầu sửa địa chỉ cho 3 đơn.</Callout>
```

Rules: `tone` reuses the seven status tones — `info`/`neutral` for a plain note, `attention` for "not yet confirmed" (never `critical`, which reads as an error and this isn't one), `success` for a completed-action confirmation. One callout per point; stack them rather than combining unrelated caveats into one block.
