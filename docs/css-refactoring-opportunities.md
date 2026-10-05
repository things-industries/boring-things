# CSS refactoring opportunities

Style debt found during front-end reviews in files the reviewed change did not touch. Each entry names the files involved and the shared token, mixin or class that would replace the repeat. Remove an entry once the refactor lands.

## Hard-coded values in global partials

- `src/styles/_status.scss`: literal radii (`5px`, `4px`, `8px`, `24px`), font sizes (`10px`, `11px`, `12px`, `13px`) and paddings (`7px`, `3px 7px`, `9px 14px`, `13px 18px`, `10px`) on `status-badge`, `sample-label`, `filter-chip`, `error-banner`, `notice-banner` and `empty-state-inline`. Replace with `tokens.radius(...)`, `typography.role(...)` and `tokens.space(...)`.
- `src/styles/_layout.scss`: literal spacing (`38px`, `22px`, `65px`, `6px`, `30px`, `26px`), sizes (`60px` empty-state icon, `310px` detail sidebar), font sizes (`12px`, `18px`, `28px`) and radius (`14px`) on `page-section`, `empty-state`, `detail-layout` and `content-panel`. Replace with tokens and typography roles, or a `tokens.size(...)` entry where no spacing step fits.

## Breakpoints

- Bare `@media (max-width: 650px)` / `(max-width: 900px)` / `(min-width: 640px)` queries with three different breakpoint values: `src/styles/_status.scss`, `src/styles/_layout.scss`, `src/styles/_mixins.scss` (`thing-art-size`), `src/styles/typography/_base.scss`, `src/app/components/field/field.scss`, `src/app/components/activity/activity.scss`, `src/app/features/dashboard/dashboard.page.scss`, `src/app/features/things/thing.page.scss`, `src/app/features/things/import-panel.scss`. Add a breakpoint map to `_tokens.scss` and a `mixins.from(...)` / `mixins.below(...)` mixin, then settle on one set of breakpoint values.

## Stacking order

- Literal `z-index` values with no shared scale: `src/app/components/bottom-nav/bottom-nav.scss` (`10`). Add a `tokens.layer(...)` map (for example `raised`, `nav`, `toast`) so overlays stack against named layers.

## Card surfaces

- `src/app/features/chat/resource-card/resource-card.scss` (`.resource`) draws a bordered `radius(card)` card using the legacy `border` colour, and `src/app/features/dashboard/dashboard-skeleton/dashboard-skeleton.scss` (`.skeleton-card`) repeats the card radius. Move both to `bt-card-group` or a `mixins.card-surface` mixin when those screens are rebuilt.
