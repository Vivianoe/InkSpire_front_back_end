# Inkspire

Inkspire is a Next.js (App Router) project for creating and reviewing reading tasks with scaffold suggestions.

## Requirements

- Node.js 18 or newer
- npm (bundled with Node)

## Quick Start

```bash
npm install
cd my-app
npm run dev
```

The dev server defaults to `http://localhost:3000` (or the next available port).

## Scripts

- `npm run dev` – start the development server
- `npm run build` – create a production build
- `npm start` – serve the production build
- `npm run lint` – run ESLint

## Project Layout

```
src/
  app/              Next.js routes, layouts, styles
  components/       Reusable UI elements (Navigation, PdfPreview, etc.)
public/             Static assets
```

## Tech Notes

- Styling combines CSS Modules with a small Tailwind setup (see `tailwind.config.ts`)
- PDF previews rely on `pdfjs-dist`
- MSW is configured for local API mocking during development
