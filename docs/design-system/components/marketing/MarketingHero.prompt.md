The landing-page hero — the loudest GWP moment, used once per marketing page.

```jsx
<MarketingHero
  lines={["Good wood.","Great products."]}
  accentLine="Made personal."
  copy="The all-in-one fulfillment platform for personalized products. Create, sell, and deliver with ease."
  actions={<><Button variant="primary" shape="pill" size="lg">Start for free</Button>
             <Button variant="cream" shape="pill" size="lg">Explore products</Button></>}
  trust={["No setup fees","Global fulfillment","Quality guaranteed"]}
  media={<img src="assets/…" alt="Personalized wood ornament, framed photo and photo mug" />}
/>
```

**Colour rule:** headline lines are CREAM on the open sky field and the accent line lifts to WHITE — the hero should feel light first. Supporting copy and proof phrases stay navy. `accentTone="action"` puts the accent word in Action Blue, but only on pale sky or cream where it clears contrast.

Rules: exactly one accent line, and it's the emotional one ("Made personal."). Headline lines are authored breaks, not wraps. Photography, not illustration, in marketing heroes. One hero per page, one yellow moment per page at most.
