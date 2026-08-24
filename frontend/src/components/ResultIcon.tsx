/// Animated success/failure confirmation icon - the circle draws itself,
/// then the checkmark (or X) draws inside it. Pure SVG + CSS keyframes
/// (see index.css's .result-icon-* classes), no animation library.
export default function ResultIcon({ variant }: { variant: "success" | "failure" }) {
  const isSuccess = variant === "success";
  const color = isSuccess ? "#059669" : "#dc2626"; // emerald-600 / red-600
  const bg = isSuccess ? "#ECFDF5" : "#FEF2F2";

  // Circle circumference for r=36 -> 2*pi*36 ~= 226.2
  const circleLength = 226.2;
  const markLength = isSuccess ? 48 : 40;

  return (
    <div
      className="h-24 w-24 rounded-full flex items-center justify-center result-icon"
      style={{ backgroundColor: bg }}
    >
      <svg viewBox="0 0 80 80" className="h-20 w-20">
        <circle
          cx="40"
          cy="40"
          r="36"
          fill="none"
          stroke={color}
          strokeWidth="4"
          strokeLinecap="round"
          className="result-icon-circle"
          style={{ ["--circle-length" as string]: circleLength }}
        />
        {isSuccess ? (
          <path
            d="M24 41 L35 52 L57 28"
            fill="none"
            stroke={color}
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="result-icon-mark"
            style={{ ["--mark-length" as string]: markLength }}
          />
        ) : (
          <path
            d="M28 28 L52 52 M52 28 L28 52"
            fill="none"
            stroke={color}
            strokeWidth="5"
            strokeLinecap="round"
            className="result-icon-mark"
            style={{ ["--mark-length" as string]: markLength }}
          />
        )}
      </svg>
    </div>
  );
}
