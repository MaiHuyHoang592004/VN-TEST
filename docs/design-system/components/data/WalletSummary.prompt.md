The Wallet summary strip — four figures plus the money actions.

```jsx
<WalletSummary
  items={[
    { label:"Available Balance", amount:"$2,485.50", tone:"action" },
    { label:"Pending Balance",   amount:"$1,250.00", tone:"progress" },
    { label:"Total Payouts",     amount:"$18,650.20", tone:"success" },
    { label:"Total Fees",        amount:"$862.45" },
  ]}
  actions={<><Button variant="primary" size="sm">Add Funds</Button><Button variant="secondary" size="sm">Request Payout</Button></>}
/>
```

Rules: amounts are mono, never display type — money must line up. Four tiles maximum. Never invent a balance type the backend doesn't report.
