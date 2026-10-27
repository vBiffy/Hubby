// A single stroke system keeps navigation readable at touchscreen sizes.
// Inline SVG inherits the theme color and avoids platform-dependent emoji rendering.
const paths = {
  home: 'M3 11 12 3l9 8M5 10v11h5v-7h4v7h5V10',
  calendar: 'M5 5h14v16H5zM5 10h14M8 3v4m8-4v4M8 14h2m4 0h2m-8 4h2',
  chores: 'M9 5h11v16H4V5h2m3-2h6v4H9zM8 14l3 3 5-6',
  notes: 'M5 3h14v18H5zM8 8h8M8 12h8m-8 4h5',
  groceries: 'm3 4 2 1 3 12h11l2-9H6M9 21h.01M18 21h.01M11 5v6m4-6v6',
  weather:
    'M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M5.6 18.4 7 17m10-10 1.4-1.4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  sports:
    'M7 3h10v6a5 5 0 0 1-10 0V3Zm0 2H3v3a4 4 0 0 0 5 4m9-7h4v3a4 4 0 0 1-5 4m-4 2v5m-4 2h8m-6-2h4',
  settings: 'M4 7h16M4 17h16M8 4v6m8 4v6',
};

export function NavigationIcon({ name }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={paths[name] || paths.home} />
    </svg>
  );
}
