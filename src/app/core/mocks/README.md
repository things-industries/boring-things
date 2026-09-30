# Frontend mocks

Temporary fills for data or behaviour the API does not provide yet. Each mock is removed when its Backend issue is delivered.

- One file per missing capability, named `<capability>.mock.ts`.
- The file starts with a header comment naming the issue: `// Mock for #<issue>: <capability>. Remove when #<issue> is delivered.`
- Mocks fill gaps in view models only. Feature code maps API responses to view models and fills the missing values from the mock.
- Record each mock in the Mocks table of `docs/plans/poc-frontend-progress.md` when it is added, and remove the row when it is deleted.
