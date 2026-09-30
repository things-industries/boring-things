# Shared styles

`styles.scss` emits the shared base stylesheet once. Components import token, typography and mixin modules with `@use`; these modules emit no CSS by themselves. Values follow the [Boring Things POC Figma file](https://www.figma.com/design/SV6xV538vbD2Vn5f1EF1rR/Boring-Things-POC?node-id=0-1); alignment rules are in [`docs/plans/poc-frontend.md`](../../docs/plans/poc-frontend.md#design-alignment).

Component styles use tokens only: no literal colours, font sizes, weights, spacing, radii, shadows or icon sizes.

## Colours

Read with `tokens.color(name)`. In templates, prefer the utility class when the element needs no other styles.

### Text and icons

| Role               | Value     | Class               | Use                              |
| ------------------ | --------- | ------------------- | -------------------------------- |
| `text-primary`     | `#273238` | `.text-primary`     | Headings, body, values           |
| `text-muted`       | `#76817d` | `.text-muted`       | Subtitles, meta lines, labels    |
| `text-neutral-200` | `#c8d0cd` | `.text-neutral-200` | Faint text, placeholders on dark |
| `text-green-600`   | `#438d69` | `.text-green-600`   | Links, positive status           |
| `icon-muted`       | `#76817d` | `.icon-muted`       | Secondary icons                  |

### Surfaces

Each surface has a `-contrast` role for its foreground. The `.bg-*` class sets both.

| Role                | Value       | Contrast  | Class           | Use                                  |
| ------------------- | ----------- | --------- | --------------- | ------------------------------------ |
| `surface-primary`   | `#273238`   | `#ffffff` | `.bg-primary`   | Primary buttons, promo card          |
| `surface-accent`    | `#79c9a1`   | `#273238` | `.bg-accent`    | Accent buttons, highlights           |
| `surface-green-100` | `#e0f3e9`   | `#438d69` | `.bg-green-100` | Green icon badges, status tiles      |
| `surface-blue-50`   | `#e4f0f6`   | `#273238` | `.bg-blue-50`   | Blue icon badges, notices            |
| `surface-secondary` | `#e3e8e5`   | `#273238` | `.bg-secondary` | Neutral icon badges, secondary fills |
| `surface-canvas`    | `#f2f4f2`   | `#273238` | `.bg-canvas`    | Inset areas on white cards           |
| `surface-white`     | `#ffffff`   | `#273238` | `.bg-white`     | Cards, sheets, rows                  |
| `surface-chip`      | `#17212614` | `#273238` | `.bg-chip`      | Category chips                       |
| `background-canvas` | `#f2f4f2`   | —         | set on `:root`  | Page background                      |

### Borders

| Role                 | Value     | Use                           |
| -------------------- | --------- | ----------------------------- |
| `border-primary`     | `#273238` | Secondary outline buttons     |
| `border-muted`       | `#76817d` | Strong dividers, inputs       |
| `border-accent`      | `#79c9a1` | Accent outlines, focus accent |
| `border-neutral-100` | `#d9dfdb` | Row dividers, card outlines   |

### Legacy roles

Screens not yet migrated use legacy roles from `$legacy-colors` in `_tokens.scss` (for example `text`, `primary`, `border`, `surface`, `danger`, category artwork roles). Core legacy roles alias the Figma roles above. Do not use legacy roles in new work; each is removed once no screen uses it.

## Typography

`@include typography.role(name)` sets size, weight, line height and letter spacing. Font: Inter (`typography.$font-family`).

| Role      | Size | Weight | Use                               |
| --------- | ---- | ------ | --------------------------------- |
| `display` | 32px | 700    | Sign-in and Add Thing headlines   |
| `title`   | 26px | 700    | Page and Thing titles             |
| `section` | 17px | 700    | Section headers                   |
| `body`    | 14px | 400    | Default text, row titles          |
| `label`   | 12px | 500    | Field labels, links, small button |
| `caption` | 11px | 400    | Meta lines, subtitles, badges     |
| `micro`   | 9px  | 600    | Date tile month only              |

`typography.tabular-numerals` aligns figures. Legacy roles `heading` and `eyebrow` remain for unmigrated screens.

## Spacing, radii, shadows and sizes

- `tokens.space(name)`: `0` 0, `half` 2px (tight text stacks only), `1` 4, `2` 8, `3` 12, `4` 16, `5` 20, `6` 24, `7` 32, `8` 40, `9` 48, `10` 64 pixels.
- `tokens.radius(name)`: `tile` 12px (tiles, chips, event cards), `card` 18px (cards), `sheet` 28px (Thing sheet), `pill` 999px (buttons, badges). `control` (9px) is legacy.
- `tokens.shadow(name)`: `raised` (promo card), `floating` (controls over images), `sheet` (sheet over hero).
- `tokens.icon-size(name)`: `sm` 16px, `md` 20px, `lg` 24px.
- `tokens.size(name)`: `control-sm` 32px, `control-md` 44px, `control-lg` 52px, `list-row` 58px, `key-value-row` 39px.

Unknown keys fail Sass compilation. CSS custom properties are emitted through `tokens.properties` on `:root`.

## Mixins

- `mixins.icon-size(sm|md|lg)`: sets the `ng-icon` size for descendants. Classes `.icon-sm`, `.icon-md` and `.icon-lg` do the same in templates.
- `mixins.list-row`: flex row with the list-row minimum height.
- `mixins.key-value-row`: flex row with the key/value minimum height.
- `mixins.skeleton`: placeholder surface and radius.
- `mixins.visually-hidden`: accessible offscreen content; `.visually-hidden` is available globally.
- Legacy: `mixins.category-art`, `mixins.thing-art-size`.

## Buttons

Combine one style with an optional size. Use on `<button>` for actions and `<a>` for navigation.

| Class               | Look                                  |
| ------------------- | ------------------------------------- |
| `.button-primary`   | Dark pill, white text                 |
| `.button-secondary` | Outline pill, primary border and text |
| `.button-accent`    | Green accent pill, dark text          |
| `.button-link`      | Green text link, no padding           |
| `.button-sm`        | 32px high, label text, small icons    |
| `.button-lg`        | 52px high, wider padding              |

Default pill height is 44px with body text and medium icons.

Legacy button classes remain for unmigrated screens: `button`, `secondary`, `quiet`, `small`, `danger-button`.

## Legacy shared classes

- Layout: `section`, `section-title`, `panel`, `things-grid`, `activity-grid`, `detail-layout`, `full-width`.
- Status: `badge`, `warning`, `sample`, `error`, `notice`, `muted`.

Page and component styles live beside their templates.
