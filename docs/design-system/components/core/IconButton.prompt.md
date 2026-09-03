Single-icon button for toolbars, nav bars and table row actions.

```jsx
<IconButton label="Notifications" badge={3}><Bell size={18} /></IconButton>
<IconButton label="Filter" variant="outline"><SlidersHorizontal size={18} /></IconButton>
<IconButton label="Add funds" variant="filled" shape="circle"><Plus size={18} /></IconButton>
```

Rules: `label` is mandatory. On touch surfaces use `size="lg"` (44px). Row-action icon buttons are `ghost` `sm` and appear on row hover; never crowd more than three into a table cell.
