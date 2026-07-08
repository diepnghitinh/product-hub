# product-hub · Frontend

Vite + React + TypeScript SPA for the product-hub API. React Router + TanStack Query
+ Axios, styled with a hand-rolled **Linear dark** design system (`src/styles/tokens.css`).

## Conventions (carried from the product-os app)

- **UI abstraction layer** — build screens from `src/components/ui/*` (Button, Input, Select…), never raw elements.
- **One query pattern** — every API call goes through a TanStack Query hook in `src/features/<x>/api.ts` over the shared Axios client (`src/lib/api.ts`).
- **Flat DTO types** in `src/types/` mirror the backend responses; enums are **reused** from `src/types/enums.ts`.
- **i18n** — all user-facing copy comes from `src/i18n`.
- **Responsive** — every screen works down to mobile widths.
- Component reference gallery at **`/design-patterns`**.

## Getting started

```bash
cp .env.example .env      # point VITE_API_URL at the backend (default :3000/v1)
yarn                      # or npm install
yarn dev                  # → http://localhost:3001
```

The backend must be running (`../backend`, port 3000) for auth and data.
