// Petites icônes au trait (24×24), dessinées en currentColor.
const PATHS = {
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </>
  ),
  locate: (
    <>
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </>
  ),
  layers: (
    <>
      <path d="M12 3 2 8.5 12 14l10-5.5L12 3Z" />
      <path d="M2 15.5 12 21l10-5.5" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6 6 18" />,
  sectors: (
    <>
      <path d="M4 7.5 10 4l7 2.5 3 8-6.5 5.5L5 17Z" />
      <path d="M10 4l1.5 8.5L20 14.5M11.5 12.5 5 17" />
    </>
  ),
};

export default function Icon({ name, size = 22 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
