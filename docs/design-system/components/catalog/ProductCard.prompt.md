Buyer-facing product card — the catalog grid and "you may also like" rows.

```jsx
<ProductCard
  name="Custom Wood Ornament"
  price="$12.99"
  image={<img src="…" alt="Custom wood ornament" />}
/>
```

Rules: 1:1 image well in cream. Product name is BODY bold, not display — display type here would shout over the photography. Price is display face. One badge maximum. 4 across on desktop, 2 on tablet, 1 on mobile.

**DOMAIN-BOUND — ratings are off by default.** No reviews or ratings entity was found in the backend, so `rating` / `reviews` must stay unset until one is verified to exist. Do not pass placeholder values, and do not put star rows in mockups — a fabricated rating is a business claim, not a visual detail. The same applies to `price` (a string you supply; no pricing rule is implied) and to `badge` copy like "Bestseller", which implies an unverified merchandising rule.

Once reviews are confirmed:

```jsx
<ProductCard name="Custom Wood Ornament" price="$12.99" rating={4.8} reviews={214} image={…} />
```
