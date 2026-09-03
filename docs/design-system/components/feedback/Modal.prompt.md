Centred, for content with no side to slide in from. If it has more than two fields or represents a record (an order, a product), use `Drawer` instead — GWP's default is the side panel, not the dialog box.

```jsx
<Modal open={helpOpen} onClose={()=>setHelpOpen(false)} title="Phím tắt" width={420}>
  <ShortcutRow keys="j / k" label="Xuống / lên một dòng" />
</Modal>
<Modal open={!!zoom} onClose={()=>setZoom(null)} width={420}
  footer={<Button variant="secondary" size="sm" onClick={()=>setZoom(null)}>Đóng</Button>}>
  <img src={zoom?.src} style={{width:"100%",display:"block"}} />
</Modal>
```

Rules: keep it short — a shortcut legend, one image, a yes/no confirmation. Anything with a form longer than two fields belongs in `Drawer`. Escape and the scrim both close it.
