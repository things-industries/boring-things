# Shared styles

The Boring Things design system. `styles.scss` emits the global stylesheet once. Components import `tokens`, `typography` and `mixins` with `@use`; these modules emit no CSS by themselves.

## Layout

One folder per style scope. A new scope gets a new folder.

| Path                     | Contents                                                                                      | Emits CSS |
| ------------------------ | --------------------------------------------------------------------------------------------- | --------- |
| `_core.scss`             | Page structure: `:root` properties, `html`/`body`, box sizing, `[hidden]`, `.visually-hidden` | Yes       |
| `tokens/`                | `tokens.*` functions and space, radius, shadow, icon-size and size maps                       | No        |
| `colors/_palette.scss`   | Shade scales                                                                                  | No        |
| `colors/_theme.scss`     | Semantic colour roles                                                                         | No        |
| `colors/_legacy.scss`    | Roles used by screens built before the current theme                                          | No        |
| `colors/_utilities.scss` | `.text-*` and `.bg-*` classes                                                                 | Yes       |
| `typography/_index.scss` | Type roles, `role()` mixin, `$font-family`                                                    | No        |
| `typography/_base.scss`  | Headings, paragraphs, eyebrow                                                                 | Yes       |
| `buttons/`               | Button classes                                                                                | Yes       |
| `icons/`                 | `ng-icon` defaults and icon size classes                                                      | Yes       |
| `forms/`                 | Labels, inputs, selects, textareas, details                                                   | Yes       |
| `layout/`                | Page sections, grids, panels, empty states                                                    | Yes       |
| `status/`                | Badges, chips, samples, errors, notices                                                       | Yes       |
| `_mixins.scss`           | Shared mixins                                                                                 | No        |

Component styles use tokens only: no literal colours, font sizes, weights, spacing, radii, shadows or icon sizes.

## Colours

`tokens.color(name)` accepts a theme role or a palette shade. Prefer a theme role; use a shade directly when no role fits (for example a specific border or button background). In templates, prefer the utility class when the element needs no other styles.

### Palette

`white` is `#ffffff`. `neutral-950` is `#172126`.

| Hue       | 50        | 100                            | 200       | 300       | 400       | 500       | 600       | 700       | 800       | 900       |
| --------- | --------- | ------------------------------ | --------- | --------- | --------- | --------- | --------- | --------- | --------- | --------- |
| `neutral` | `#f2f4f2` | `.text-neutral`, `.bg-neutral` | `#d9dfdb` | `#c8d0cd` | `#9fa8a5` | `#76817d` | `#626d6c` | `#4e5a5a` | `#3b4649` | `#273238` |
| `green`   | `#f0f9f4` | `.text-green`, `.bg-green`     | `#bee5d1` | `#9bd7b9` | `#79c9a1` | `#5eab85` | `#438d69` | `#367456` | `#295c43` | `#1c4330` |
| `blue`    | `#e4f0f6` | `.text-blue`, `.bg-blue`       | `#b2d1e1` | `#91bcd4` | `#70a8c6` | `#4f93b8` | `#427d9d` | `#356783` | `#285268` | `#1b3c4e` |
| `red`     | `#fff0e9` | `.text-red`, `.bg-red`         | `#efc9ba` | `#dbac9c` | `#c88f7e` | `#b47261` | `#a05543` | `#893f2f` | `#6b3023` | `#4c2118` |
| `amber`   | `#fdf5ea` | `.text-amber`, `.bg-amber`     | `#e7d1b4` | `#d3b793` | `#c09d71` | `#ac8350` | `#98692e` | `#7d5625` | `#62431c` | `#463014` |

### Theme

| Role                     | Shade               | Class                                                        | Use                                |
| ------------------------ | ------------------- | ------------------------------------------------------------ | ---------------------------------- |
| `text`                   | `neutral-900`       | `.text-default`                                              | Default text                       |
| `text-muted`             | `neutral-500`       | `.text-muted`                                                | Subtitles, meta lines, labels      |
| `text-subtle`            | `neutral-300`       | `.text-subtle`                                               | Faint text                         |
| `text-accent`            | `green-600`         | `.text-accent`                                               | Links, positive status             |
| `text-inverse`           | `white`             | `.text-inverse`                                              | Text on dark fills                 |
| `text-danger`            | `red-700`           | `.text-danger`                                               | Errors                             |
| `text-warning`           | `amber-600`         | `.text-warning`                                              | Warnings                           |
| `background`             | `neutral-50`        | `.text-background`, `.bg-background`                         | Page background                    |
| `surface`                | `white`             | `.text-surface`, `.bg-surface`                               | Cards, sheets, rows                |
| `surface-muted`          | `neutral-100`       | `.text-surface-muted`, `.bg-surface-muted`                   | Neutral fills, neutral icon badges |
| `tint`                   | `neutral-950` at 8% | `.text-tint`, `.bg-tint`                                     | Translucent chip fill              |
| `primary`                | `neutral-900`       | `.text-primary`, `.bg-primary`                               | Primary buttons, dark cards        |
| `primary-contrast`       | `white`             | `.text-primary-contrast`, `.bg-primary-contrast`             | Foreground on `primary`            |
| `accent`                 | `green-400`         | `.bg-accent`                                                 | Accent buttons, highlights         |
| `accent-contrast`        | `neutral-900`       | `.text-accent-contrast`, `.bg-accent-contrast`               | Foreground on `accent`             |
| `accent-subtle`          | `green-100`         | `.text-accent-subtle`, `.bg-accent-subtle`                   | Green icon badges, status tiles    |
| `accent-subtle-contrast` | `green-600`         | `.text-accent-subtle-contrast`, `.bg-accent-subtle-contrast` | Foreground on `accent-subtle`      |
| `info-subtle`            | `blue-50`           | `.text-info-subtle`, `.bg-info-subtle`                       | Blue icon badges, notices          |
| `danger-subtle`          | `red-50`            | `.text-danger-subtle`, `.bg-danger-subtle`                   | Error fills                        |
| `warning-subtle`         | `amber-100`         | `.text-warning-subtle`, `.bg-warning-subtle`                 | Warning fills                      |
| `border`                 | `neutral-200`       | `.text-border`, `.bg-border`                                 | Dividers, card outlines            |
| `border-muted`           | `neutral-500`       | `.text-border-muted`, `.bg-border-muted`                     | Strong dividers, inputs            |
| `border-strong`          | `neutral-900`       | `.text-border-strong`, `.bg-border-strong`                   | Outline buttons                    |
| `border-accent`          | `green-400`         | `.text-border-accent`, `.bg-border-accent`                   | Accent outlines                    |
| `skeleton`               | `neutral-200`       | `.text-skeleton`, `.bg-skeleton`                             | Loading placeholders               |

Every palette shade and theme role has a `.text-*` and a `.bg-*` class (`.text-green-600`, `.bg-neutral-100`, `.bg-accent`). Roles named `text-*` are the exception: they give the class of the same name (`.text-accent` is the `text-accent` role), so `accent` only has `.bg-accent`. The default `text` role is `.text-default`. `.bg-*` also sets the role's `-contrast` colour as the foreground when one exists.

### Legacy roles

`colors/_legacy.scss` keeps role names used by screens built before the current theme (for example `danger`, `destructive`, `badge`, `sample-banner` and category artwork roles), each mapped to a palette shade. Do not use them in new work; each is removed once no screen uses it.

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

`typography.tabular-numerals` aligns figures. Legacy roles `heading` and `eyebrow` remain for screens built before the current type scale.

## Spacing, radii, shadows and sizes

- `tokens.space(name)`: `0` 0, `half` 2px (tight text stacks only), `1` 4, `2` 8, `3` 12, `4` 16, `5` 20, `6` 24, `7` 32, `8` 40, `9` 48, `10` 64 pixels.
- `tokens.radius(name)`: `tile` 12px (tiles, chips, event cards), `card` 18px (cards), `sheet` 28px (sheets), `pill` 999px (buttons, badges). `control` (9px) is legacy.
- `tokens.shadow(name)`: `raised` (call-to-action cards), `floating` (controls over images), `sheet` (sheet over an image).
- `tokens.icon-size(name)`: `sm` 16px, `md` 20px, `lg` 24px.
- `tokens.size(name)`: `control-sm` 32px, `control-md` 44px, `control-lg` 52px, `list-row` 58px, `key-value-row` 39px.

Unknown keys fail Sass compilation. CSS custom properties are emitted through `tokens.properties` on `:root`; theme roles resolve to their palette variable.

## Mixins

- `mixins.icon-size(sm|md|lg)`: sets the `ng-icon` size for descendants. Classes `.icon-sm`, `.icon-md` and `.icon-lg` do the same in templates.
- `mixins.list-row`: flex row with the list-row minimum height.
- `mixins.key-value-row`: flex row with the key/value minimum height.
- `mixins.skeleton`: placeholder surface and radius.
- `mixins.visually-hidden`: accessible offscreen content.
- Legacy: `mixins.category-art`, `mixins.thing-art-size`.

## Buttons

Combine one style with an optional size. Use on `<button>` for actions and `<a>` for navigation.

| Class               | Look                                      |
| ------------------- | ----------------------------------------- |
| `.button-primary`   | Dark pill, white text                     |
| `.button-secondary` | Outline pill, strong border, default text |
| `.button-accent`    | Green accent pill, dark text              |
| `.button-link`      | Accent text link, no padding              |
| `.button-sm`        | 32px high, label text, small icons        |
| `.button-lg`        | 52px high, wider padding                  |

Default pill height is 44px with body text and medium icons. Legacy button classes remain for screens built before the current system: `button`, `secondary`, `quiet`, `small`, `danger-button`.

## Legacy shared classes

- Layout: `section`, `section-title`, `panel`, `things-grid`, `activity-grid`, `detail-layout`, `full-width`, `empty`.
- Status: `badge`, `warning`, `sample`, `chip`, `error`, `notice`, `muted`, `danger`.

Page and component styles live beside their templates.
