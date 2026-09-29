# Shared styles

`styles.scss` emits the shared base stylesheet once. Components import token/mixin modules with `@use`; these modules emit no CSS by themselves.

## Tokens

- `tokens.color(name)`: semantic colour roles from `_tokens.scss`. Core roles include `text`, `text-muted`, `text-placeholder`, `primary`, `primary-contrast`, `background`, `surface`, `surface-subtle`, `border`, `error` and `error-contrast`.
- Artwork roles preserve category colours: `thing-art`, `insurance-art`, `vehicle-art` and `membership-art`, each with a contrast role.
- Other fills include `badge`, `warning`, `sensitive`, `notice`, `upload`, `hint` and `destructive`. Use each fill's `-contrast` role for its foreground.
- `tokens.space(0..10)`: 0, 4, 8, 12, 16, 20, 24, 32, 40, 48 and 64 pixels.
- `tokens.radius(control|card|pill)`: control, card and pill radii.
- Unknown keys fail Sass compilation. Add reusable values to the maps; CSS custom properties are emitted through `tokens.properties` in the root rule.

Text roles generate matching global classes, including `text-muted` and `text-placeholder`.

## Typography and mixins

- `typography.role(display|title|heading|body|caption|eyebrow)` sets size and weight.
- `typography.tabular-numerals` aligns figures.
- `mixins.skeleton` supplies the placeholder surface and radius.
- `mixins.category-art` applies category colours within artwork components.
- `mixins.thing-art-size` shares artwork heights between cards and their loading skeletons.
- `mixins.visually-hidden` provides accessible offscreen content; `.visually-hidden` is available globally.

## Shared classes

- Buttons: `button`, `secondary`, `quiet`, `small`, `danger-button`.
- Layout: `section`, `section-title`, `panel`, `things-grid`, `activity-grid`, `detail-layout`, `full-width`.
- Status: `badge`, `warning`, `sample`, `error`, `notice`, `muted`.

Page and component styles live beside their templates. Keep shared grids and panels global so loading skeletons use the same layout. Add an overlay partial only when an overlay implementation needs one.
