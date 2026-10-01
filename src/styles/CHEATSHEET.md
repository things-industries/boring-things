# Shared styles

The Boring Things design system. `styles.scss` emits the global stylesheet once. Components import `tokens`, `typography` and `mixins` with `@use`; these modules emit no CSS by themselves.

## Layout

One file per style scope, or one folder when a scope needs several files.

| Path                     | Contents                                                                                      | Emits CSS |
| ------------------------ | --------------------------------------------------------------------------------------------- | --------- |
| `_core.scss`             | Page structure: `:root` properties, `html`/`body`, box sizing, `[hidden]`, `.visually-hidden` | Yes       |
| `_tokens.scss`           | `tokens.*` functions and space, radius, shadow, icon-size and size maps                       | No        |
| `colors/_palette.scss`   | Shade scales                                                                                  | No        |
| `colors/_theme.scss`     | Colour sets                                                                                   | No        |
| `colors/_legacy.scss`    | Colours used by screens built before the colour sets                                          | No        |
| `colors/_utilities.scss` | `.text-*` and `.bg-*` classes                                                                 | Yes       |
| `typography/_index.scss` | Type roles, `role()` mixin, `$font-family`                                                    | No        |
| `typography/_base.scss`  | Headings, paragraphs, eyebrow                                                                 | Yes       |
| `_buttons.scss`          | Button classes                                                                                | Yes       |
| `_icons.scss`            | `ng-icon` defaults and icon size classes                                                      | Yes       |
| `_forms.scss`            | Labels, inputs, selects, textareas, details                                                   | Yes       |
| `_layout.scss`           | Page sections, grids, panels, empty states                                                    | Yes       |
| `_status.scss`           | Badges, chips, samples, errors, notices                                                       | Yes       |
| `_toasts.scss`           | `ngx-toastr` container, toast and close button (replaces the library stylesheet)              | Yes       |
| `_mixins.scss`           | Shared mixins                                                                                 | No        |

Component styles use tokens only: no literal colours, font sizes, weights, spacing, radii, shadows or icon sizes.

## Colours

`tokens.color(name)` accepts a colour-set token or a palette shade. Prefer a set token; use a shade directly when no set token fits. Every set token and every shade has a `.text-<name>` and a `.bg-<name>` class (`.text-primary-muted`, `.bg-accent-subtle`, `.bg-green-100`). Prefer the class in templates when the element needs no other styles.

### Colour sets

Each set has four tokens, and optionally a fifth. The element decides where each is used (text, border, fill).

| Token                  | Meaning                                         |
| ---------------------- | ----------------------------------------------- |
| `<set>`                | Main shade                                      |
| `<set>-muted`          | Softer shade                                    |
| `<set>-subtle`         | Light tint                                      |
| `<set>-contrast`       | Colour to use on `<set>`                        |
| `<set>-contrast-muted` | Secondary text on `<set>`, where a set needs it |

| Set       | Base          | `-muted`      | `-subtle`     | `-contrast` | Typical use                                      |
| --------- | ------------- | ------------- | ------------- | ----------- | ------------------------------------------------ |
| `primary` | `neutral-900` | `neutral-500` | `neutral-100` | `white`     | Text, primary buttons; muted text; neutral fills |

| `secondary` | `neutral-200` | `neutral-100` | `neutral-50` | `neutral-900` | Dividers and outlines; fills; page background |
| `accent` | `green-600` | `green-400` | `green-100` | `white` | Links and positive status; accent buttons; green badges |
| `info` | `blue-600` | `blue-400` | `blue-50` | `white` | Informational icons; blue badges and notices |
| `danger` | `red-700` | `red-500` | `red-50` | `white` | Errors; error fills |
| `warning` | `amber-600` | `amber-400` | `amber-100` | `white` | Warnings; warning fills |

`primary-contrast-muted` (`neutral-300`) is the secondary text colour on a `primary` fill, such as a toast message or a promo card detail line. Other sets have no `-contrast-muted` token yet.

### Palette

`white` is `#ffffff`. `neutral-950` is `#172126`.

| Hue       | 50        | 100                            | 200       | 300       | 400       | 500       | 600       | 700       | 800       | 900       |
| --------- | --------- | ------------------------------ | --------- | --------- | --------- | --------- | --------- | --------- | --------- | --------- |
| `neutral` | `#f2f4f2` | `.text-neutral`, `.bg-neutral` | `#d9dfdb` | `#c8d0cd` | `#9fa8a5` | `#76817d` | `#626d6c` | `#4e5a5a` | `#3b4649` | `#273238` |
| `green`   | `#f0f9f4` | `.text-green`, `.bg-green`     | `#bee5d1` | `#9bd7b9` | `#79c9a1` | `#5eab85` | `#438d69` | `#367456` | `#295c43` | `#1c4330` |
| `blue`    | `#e4f0f6` | `.text-blue`, `.bg-blue`       | `#b2d1e1` | `#91bcd4` | `#70a8c6` | `#4f93b8` | `#427d9d` | `#356783` | `#285268` | `#1b3c4e` |
| `red`     | `#fff0e9` | `.text-red`, `.bg-red`         | `#efc9ba` | `#dbac9c` | `#c88f7e` | `#b47261` | `#a05543` | `#893f2f` | `#6b3023` | `#4c2118` |
| `amber`   | `#fdf5ea` | `.text-amber`, `.bg-amber`     | `#e7d1b4` | `#d3b793` | `#c09d71` | `#ac8350` | `#98692e` | `#7d5625` | `#62431c` | `#463014` |

### Legacy roles

`colors/_legacy.scss` keeps colour names used by screens built before the current colour sets (for example `danger`, `destructive`, `badge`, `sample-banner` and category artwork roles), each mapped to a palette shade. Do not use them in new work; each is removed once no screen uses it.

## Typography

`@include typography.role(name)` sets size, weight, line height and letter spacing. Font: Inter (`typography.$font-family`).

| Role      | Size | Weight | Use                                |
| --------- | ---- | ------ | ---------------------------------- |
| `display` | 32px | 700    | Sign-in and Add Thing headlines    |
| `title`   | 26px | 700    | Page and Thing titles              |
| `section` | 17px | 700    | Section headers                    |
| `body`    | 14px | 400    | Default text, row titles           |
| `label`   | 12px | 500    | Field labels, links, small buttons |
| `caption` | 11px | 400    | Meta lines, subtitles, badges      |
| `micro`   | 9px  | 600    | Date tile month only               |

`typography.weight(regular|medium|semibold|bold)` overrides a role's weight where the design uses a role at another weight. `typography.tabular-numerals` aligns figures. Legacy roles `heading` and `eyebrow` remain for screens built before the current type scale.

## Spacing, radii, shadows and sizes

- `tokens.space(name)`: `0` 0, `half` 2px (tight text stacks only), `1` 4, `2` 8, `3` 12, `4` 16, `5` 20, `6` 24, `7` 32, `8` 40, `9` 48, `10` 64 pixels.
- `tokens.radius(name)`: `tile` 12px (tiles, chips, event cards), `card` 18px (cards), `sheet` 28px (sheets), `pill` 999px (buttons, badges). `control` (9px) is legacy.
- `tokens.shadow(name)`: `raised` (call-to-action cards), `floating` (controls over images), `sheet` (sheet over an image).
- `tokens.icon-size(name)`: `sm` 16px, `md` 20px, `lg` 24px, `artwork` 96px (category artwork in the hero).
- `tokens.size(name)`: `control-sm` 32px, `control-md` 44px, `control-lg` 52px, `list-row` 58px, `icon-badge` 36px, `thumbnail-sm` 40px, `thumbnail-md` 48px, `key-value-row` 39px, `hero` 400px, `hero-overlap` 104px (sheet over the hero image), `top-bar` 60px, `bottom-nav` 64px, `content-max` 480px (page column width).

Unknown keys fail Sass compilation. CSS custom properties are emitted through `tokens.properties` on `:root`; set tokens resolve to their palette variable.

## Mixins

- `mixins.icon-size(sm|md|lg)`: sets the `ng-icon` size for descendants. Classes `.icon-sm`, `.icon-md` and `.icon-lg` do the same in templates.
- `mixins.list-row`: flex row with the list-row minimum height.
- `mixins.key-value-row`: flex row with the key/value minimum height.
- `mixins.skeleton`: placeholder surface and radius.
- `mixins.skeleton-line`: a skeleton text line; `mixins.skeleton-circle($size)`: a round skeleton, such as an icon badge.
- `mixins.viewport-page`: page host that fills the viewport above the bottom nav, with a `bt-top-bar` over a `bt-scroll-container`. Only the container scrolls.
- `mixins.page-gutter`: inline padding that centres content in the page column on a full-width element.
- `mixins.hero-backdrop`: fixed image area at the top of a `viewport-page`, behind its top bar and content (`bt-hero`).
- `mixins.hero-scrim`: dark-to-clear gradient at the top of the hero, behind the top bar controls.
- `mixins.hero-sheet`: white sheet that scrolls over the `hero-backdrop` (`bt-sheet`, the Thing skeleton). Its scroll container needs no top padding.
- `mixins.visually-hidden`: accessible offscreen content.
- Legacy: `mixins.category-art`, `mixins.thing-art-size`.

## Buttons

Combine one style with an optional size. Use on `<button>` for actions and `<a>` for navigation.

| Class               | Look                               |
| ------------------- | ---------------------------------- |
| `.button-primary`   | Dark pill, white text              |
| `.button-secondary` | Outline pill in `primary`          |
| `.button-accent`    | Green accent pill, dark text       |
| `.button-link`      | Accent text link, no padding       |
| `.button-danger`    | Red pill, white text               |
| `.button-sm`        | 32px high, label text, small icons |
| `.button-lg`        | 52px high, wider padding           |

Default pill height is 44px with body text and medium icons. Legacy button modifiers are nested under `button, .button` and only apply there: `.secondary`, `.quiet`, `.small`, `.danger`, `.danger-button`.

## Legacy shared classes

- Layout: `page-section`, `page-section-title`, `content-panel`, `things-grid`, `activity-grid`, `detail-layout`, `grid-full-width`, `empty-state`, `empty-state-icon`.
- Status: `status-badge` (with `.warning`), `sample-label`, `filter-chip` (with `.active`), `error-banner`, `notice-banner`, `empty-state-inline`.
- Text: `eyebrow`, `hint-text` (on `small`).

Page and component styles live beside their templates.
