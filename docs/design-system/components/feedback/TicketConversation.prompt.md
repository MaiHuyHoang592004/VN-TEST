The support ticket thread on the Tickets screen.

```jsx
<TicketConversation
  header={<><span>#9567 · Order #10429</span><StatusBadge status="in_progress" /></>}
  messages={[
    { from:"seller",  author:"Jane Cooper",   time:"10:00 AM", body:"I received the order but one item is missing." },
    { from:"support", author:"Support Agent", time:"10:04 AM", body:"We're very sorry about that. Let us check this for you." },
  ]}
  composer={<div style={{display:"flex",gap:"var(--space-2)"}}>
    <Input placeholder="Type your reply…" containerStyle={{flex:1}} />
    <Button variant="primary">Send Reply</Button>
  </div>} />
```

Rules: support replies are sky bubbles on the right; the seller is white on the left. Thread background is the palest cream so both bubbles read. Support copy is warm and accountable — "We're very sorry about that", not "Ticket acknowledged".
