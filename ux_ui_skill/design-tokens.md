# Design Token Templates

Pick the template matching your tech stack. Customize colors to match the app's brand.

---

## CSS Custom Properties (Universal)

```css
:root {
  /* ========================
     SPACING SCALE
     Base unit: 4px
     ======================== */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;
  --space-16: 64px;
  --space-20: 80px;
  --space-24: 96px;

  /* ========================
     TYPOGRAPHY
     ======================== */
  --font-family-base: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-family-mono: 'JetBrains Mono', 'Fira Code', monospace;

  --text-xs: 0.75rem;    /* 12px */
  --text-sm: 0.8125rem;  /* 13px */
  --text-base: 0.875rem; /* 14px — standard for enterprise apps */
  --text-md: 1rem;       /* 16px */
  --text-lg: 1.125rem;   /* 18px */
  --text-xl: 1.25rem;    /* 20px */
  --text-2xl: 1.5rem;    /* 24px */
  --text-3xl: 1.875rem;  /* 30px */
  --text-4xl: 2.25rem;   /* 36px */

  --font-normal: 400;
  --font-medium: 500;
  --font-semibold: 600;
  --font-bold: 700;

  --leading-tight: 1.25;
  --leading-normal: 1.5;
  --leading-relaxed: 1.625;

  /* ========================
     COLORS — Brand
     ======================== */
  --color-primary-50: #eff6ff;
  --color-primary-100: #dbeafe;
  --color-primary-200: #bfdbfe;
  --color-primary-300: #93c5fd;
  --color-primary-400: #60a5fa;
  --color-primary-500: #3b82f6;  /* Main primary */
  --color-primary-600: #2563eb;
  --color-primary-700: #1d4ed8;
  --color-primary-800: #1e40af;
  --color-primary-900: #1e3a8a;

  /* ========================
     COLORS — Neutral/Gray
     ======================== */
  --color-gray-50: #f9fafb;
  --color-gray-100: #f3f4f6;
  --color-gray-200: #e5e7eb;
  --color-gray-300: #d1d5db;
  --color-gray-400: #9ca3af;
  --color-gray-500: #6b7280;
  --color-gray-600: #4b5563;
  --color-gray-700: #374151;
  --color-gray-800: #1f2937;
  --color-gray-900: #111827;

  /* ========================
     COLORS — Semantic / Status
     ======================== */
  --color-success: #16a34a;
  --color-success-light: #dcfce7;
  --color-success-dark: #166534;

  --color-warning: #d97706;
  --color-warning-light: #fef3c7;
  --color-warning-dark: #92400e;

  --color-error: #dc2626;
  --color-error-light: #fee2e2;
  --color-error-dark: #991b1b;

  --color-info: #2563eb;
  --color-info-light: #dbeafe;
  --color-info-dark: #1e40af;

  /* ========================
     SEMANTIC SURFACE COLORS
     ======================== */
  --bg-primary: #ffffff;
  --bg-secondary: var(--color-gray-50);
  --bg-tertiary: var(--color-gray-100);
  --bg-sidebar: #1a2332;  /* Dark sidebar variant */
  --bg-sidebar-active: rgba(255, 255, 255, 0.1);
  --bg-overlay: rgba(0, 0, 0, 0.5);

  --text-primary: var(--color-gray-900);
  --text-secondary: var(--color-gray-600);
  --text-muted: var(--color-gray-400);
  --text-inverse: #ffffff;
  --text-link: var(--color-primary-600);
  --text-link-hover: var(--color-primary-700);

  --border-default: var(--color-gray-200);
  --border-strong: var(--color-gray-300);
  --border-focus: var(--color-primary-500);

  /* ========================
     BORDER RADIUS
     ======================== */
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
  --radius-xl: 12px;
  --radius-2xl: 16px;
  --radius-full: 9999px;

  /* ========================
     SHADOWS / ELEVATION
     ======================== */
  --shadow-xs: 0 1px 2px rgba(0, 0, 0, 0.05);
  --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.1), 0 1px 2px rgba(0, 0, 0, 0.06);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
  --shadow-xl: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);

  /* ========================
     TRANSITIONS
     ======================== */
  --transition-fast: 150ms ease;
  --transition-normal: 250ms ease;
  --transition-slow: 350ms ease;

  /* ========================
     Z-INDEX SCALE
     ======================== */
  --z-dropdown: 100;
  --z-sticky: 200;
  --z-modal-backdrop: 300;
  --z-modal: 400;
  --z-popover: 500;
  --z-tooltip: 600;
  --z-toast: 700;

  /* ========================
     COMPONENT SIZING
     ======================== */
  --btn-height-sm: 32px;
  --btn-height-md: 40px;
  --btn-height-lg: 48px;

  --input-height-sm: 32px;
  --input-height-md: 40px;
  --input-height-lg: 48px;

  --table-header-height: 44px;
  --table-row-height: 52px;

  --sidebar-width: 260px;
  --sidebar-collapsed-width: 64px;

  --page-padding: var(--space-8);
  --content-max-width: 1400px;
  --card-padding: var(--space-6);
}
```

---

## Tailwind Config Extension

```js
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eff6ff',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          900: '#1e3a8a',
        },
        sidebar: {
          DEFAULT: '#1a2332',
          active: 'rgba(255, 255, 255, 0.1)',
        },
        status: {
          success: { DEFAULT: '#16a34a', light: '#dcfce7' },
          warning: { DEFAULT: '#d97706', light: '#fef3c7' },
          error: { DEFAULT: '#dc2626', light: '#fee2e2' },
          info: { DEFAULT: '#2563eb', light: '#dbeafe' },
        },
      },
      spacing: {
        '4.5': '1.125rem', // 18px
        '13': '3.25rem',   // 52px — table row height
      },
      fontSize: {
        'xs': ['0.75rem', { lineHeight: '1rem' }],
        'sm': ['0.8125rem', { lineHeight: '1.25rem' }],
        'base': ['0.875rem', { lineHeight: '1.375rem' }],
      },
      boxShadow: {
        'card': '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)',
        'card-hover': '0 4px 12px rgba(0,0,0,0.1), 0 2px 4px rgba(0,0,0,0.06)',
      },
      borderRadius: {
        'card': '8px',
      },
    },
  },
};
```

---

## Angular Material Custom Theme

```scss
// _variables.scss
@use '@angular/material' as mat;

$brand-palette: (
  50: #eff6ff,
  100: #dbeafe,
  500: #3b82f6,
  700: #1d4ed8,
  900: #1e3a8a,
  contrast: (
    50: rgba(black, 0.87),
    500: white,
    900: white,
  )
);

$app-primary: mat.define-palette($brand-palette, 500);
$app-accent: mat.define-palette(mat.$amber-palette, A200, A100, A400);
$app-warn: mat.define-palette(mat.$red-palette);

$app-theme: mat.define-light-theme((
  color: (
    primary: $app-primary,
    accent: $app-accent,
    warn: $app-warn,
  ),
  typography: mat.define-typography-config(
    $font-family: 'Inter, sans-serif',
    $body-1: mat.define-typography-level(14px, 1.5, 400),
    $body-2: mat.define-typography-level(14px, 1.5, 500),
    $caption: mat.define-typography-level(12px, 1.33, 400),
    $button: mat.define-typography-level(14px, 1, 500),
  ),
  density: 0,
));

// Status colors — use as CSS vars or SCSS vars
$status-success: #16a34a;
$status-success-bg: #dcfce7;
$status-warning: #d97706;
$status-warning-bg: #fef3c7;
$status-error: #dc2626;
$status-error-bg: #fee2e2;
$status-info: #2563eb;
$status-info-bg: #dbeafe;

// Spacing scale
$space: (
  1: 4px, 2: 8px, 3: 12px, 4: 16px, 5: 20px,
  6: 24px, 8: 32px, 10: 40px, 12: 48px, 16: 64px,
);
```

---

## React Theme Object (styled-components / Emotion)

```ts
export const theme = {
  colors: {
    primary: { 50: '#eff6ff', 500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8', 900: '#1e3a8a' },
    gray: { 50: '#f9fafb', 100: '#f3f4f6', 200: '#e5e7eb', 300: '#d1d5db', 400: '#9ca3af', 500: '#6b7280', 600: '#4b5563', 700: '#374151', 800: '#1f2937', 900: '#111827' },
    status: {
      success: { main: '#16a34a', light: '#dcfce7', dark: '#166534' },
      warning: { main: '#d97706', light: '#fef3c7', dark: '#92400e' },
      error: { main: '#dc2626', light: '#fee2e2', dark: '#991b1b' },
      info: { main: '#2563eb', light: '#dbeafe', dark: '#1e40af' },
    },
    bg: { primary: '#ffffff', secondary: '#f9fafb', sidebar: '#1a2332' },
    text: { primary: '#111827', secondary: '#4b5563', muted: '#9ca3af', inverse: '#ffffff' },
    border: { default: '#e5e7eb', strong: '#d1d5db', focus: '#3b82f6' },
  },
  spacing: (n: number) => `${n * 4}px`,
  radii: { sm: '4px', md: '6px', lg: '8px', xl: '12px', full: '9999px' },
  shadows: {
    sm: '0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06)',
    md: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)',
    lg: '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)',
  },
  fontSizes: { xs: '0.75rem', sm: '0.8125rem', base: '0.875rem', md: '1rem', lg: '1.125rem', xl: '1.25rem', '2xl': '1.5rem', '3xl': '1.875rem' },
  fontWeights: { normal: 400, medium: 500, semibold: 600, bold: 700 },
  transitions: { fast: '150ms ease', normal: '250ms ease', slow: '350ms ease' },
  components: {
    button: { sm: { height: '32px', padding: '8px 12px', fontSize: '13px' }, md: { height: '40px', padding: '10px 16px', fontSize: '14px' }, lg: { height: '48px', padding: '12px 24px', fontSize: '16px' } },
    input: { height: '40px', padding: '10px 12px', fontSize: '14px' },
    table: { headerHeight: '44px', rowHeight: '52px', cellPadding: '12px 16px' },
  },
} as const;
```
