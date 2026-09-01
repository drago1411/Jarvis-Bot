# JARVIS — Global Coding Rules

These rules apply to ALL agents (jarvis, designer, debugger, deployer) at all times.
Every file generated, every command run, every commit made must follow these standards.

---

## Language & Stack

- **TypeScript** by default for all JS/TS projects. Avoid plain `.js` files unless it's a config file.
- **Vite** for simple sites and SPAs. **Next.js** for full-stack apps with routing/API needs.
- **Vanilla CSS** with CSS custom properties for styling. No Tailwind unless explicitly requested.
- **No jQuery** — use native DOM APIs.
- **ESM modules** (`import`/`export`) — no CommonJS `require()` in TypeScript files.

---

## Code Style

- **2-space indentation** for all files (HTML, CSS, JS/TS, JSON).
- **Single quotes** for strings in JS/TS.
- **Trailing commas** in multi-line objects and arrays.
- **Semicolons**: yes, always.
- **Max line length**: 100 characters.
- **Arrow functions** for all callbacks and anonymous functions.
- **`const` by default**, `let` only when reassignment is needed. Never `var`.

---

## TypeScript Rules

- **No `any` type** — always be explicit. Use `unknown` if type is truly unknown.
- **All functions must be typed** — parameters and return types explicitly declared.
- **Interfaces over types** for object shapes (unless union types are needed).
- **JSDoc comments** on all exported functions and classes:
  ```typescript
  /**
   * Fetches user data from the API.
   * @param userId - The unique user identifier
   * @returns Promise resolving to User object
   */
  async function getUser(userId: string): Promise<User> { ... }
  ```

---

## File & Folder Naming

- **Components**: PascalCase (`HeroSection.ts`, `NavBar.ts`)
- **Utilities/helpers**: camelCase (`formatDate.ts`, `apiClient.ts`)
- **CSS files**: kebab-case (`main-styles.css`, `hero-section.css`)
- **Config files**: lowercase with dots (`vite.config.ts`, `tsconfig.json`)
- **No spaces in filenames** — ever.

---

## Logging & Debugging

- **No `console.log`** in production/committed code. Use a logger utility.
- Use `console.warn` for warnings, `console.error` for errors (acceptable in utilities).
- All async operations must have `try/catch` with meaningful error messages.

---

## Git & Version Control

- **Conventional commits** — always:
  - `feat: add hero section to homepage`
  - `fix: correct mobile nav overflow`
  - `chore: update dependencies`
  - `docs: add README setup instructions`
  - `style: reformat CSS variables`
  - `refactor: extract NavBar into component`
- **One logical change per commit** — don't mix feature + fix in one commit.
- **Never commit**:
  - `.env` files
  - `node_modules/`
  - API keys or secrets
  - Build output (`dist/`, `.next/`, `out/`)

---

## Security

- **No hardcoded secrets** — use `.env` files and environment variables.
- **Always add `.env` to `.gitignore`** before creating it.
- **Sanitize user input** — never trust user-provided data directly in DOM or SQL.
- **HTTPS only** for all external API calls.

---

## HTML/Accessibility

- **Semantic HTML5** — use `<header>`, `<main>`, `<nav>`, `<section>`, `<footer>`, `<article>`.
- **One `<h1>` per page** — clear heading hierarchy (`h1` → `h2` → `h3`).
- **Alt text** on all `<img>` elements.
- **ARIA labels** on icon buttons and interactive elements without visible text.
- **Focus styles** — never `outline: none` without a custom focus indicator.
- **Color contrast** — minimum WCAG AA (4.5:1 for text, 3:1 for UI components).

---

## CSS Rules

- **CSS custom properties in `:root`** for all design tokens:
  ```css
  :root {
    --color-bg: #0d0d0d;
    --color-surface: #1a1a1a;
    --color-accent: hsl(210, 100%, 56%);
    --font-sans: 'Inter', sans-serif;
    --radius-md: 8px;
    --shadow-lg: 0 20px 60px rgba(0, 0, 0, 0.5);
  }
  ```
- **Mobile-first** — base styles are for mobile, media queries for larger screens.
- **Transitions** on interactive elements: `transition: all 0.2s ease`.
- **No magic numbers** — use CSS variables for all repeated values.

---

## Project Structure (standard Vite project)

```
project-name/
├── index.html
├── vite.config.ts
├── tsconfig.json
├── package.json
├── .env.example        ← template with empty values
├── .gitignore
├── src/
│   ├── main.ts         ← entry point
│   ├── styles/
│   │   └── main.css    ← CSS with custom properties
│   ├── components/     ← reusable UI components
│   └── utils/          ← helper functions
└── public/             ← static assets
```

---

## Output folder

All projects built by JARVIS go in: `D:\Jarvis\workbench\projects\<project-name>\`
