Ticket list — the Tickets screen's left rail and the dashboard's Recent Tickets block.

```jsx
<SupportPanel title="Tickets" activeId="#9567" onSelect={select}
  items={[{ id:"#9567", reference:"Order #10429", subject:"Missing item in order", time:"10m ago",
            badge:<StatusBadge status="in_progress" size="sm" /> }]}
  footer={<a href="#">View all tickets</a>} />
```

Rules: the selected item is marked by a 3px Action Blue left edge plus a pale sky fill — this is the one sanctioned left-accent pattern in the system, and it is a selection state, not decoration. Ticket and order references are mono.
