Action-confirmation feedback that doesn't block the flow the way a Modal would. The screen owns the toasts array and its own auto-dismiss timer; `ToastStack` only renders it.

```jsx
const [toasts, setToasts] = React.useState([]);
const toast = (message, tone="success") => {
  const id = Date.now();
  setToasts(t => [...t, {id, tone, message}]);
  setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3000);
};
toast("Đã lưu thay đổi");
<ToastStack toasts={toasts} onDismiss={id => setToasts(t => t.filter(x => x.id !== id))} />
```

Rules: one `<ToastStack>` per screen, mounted once near the root. `tone="success"` for a completed action, `attention`/`critical` for a failed one — never `primary`-styled or Action Blue, toasts are neutral chrome, not a brand moment. Keep the message to one short clause.
