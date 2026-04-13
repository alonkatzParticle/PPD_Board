"use client";

interface StatusBadgeProps {
  label: string;
  color: string; // hex color from Monday
}

// Determine if a hex color is light (use dark text) or dark (use light text)
function isLightColor(hex: string): boolean {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.55;
}

export function StatusBadge({ label, color }: StatusBadgeProps) {
  if (!label || label === "—") {
    return (
      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-zinc-800 text-zinc-500">
        —
      </span>
    );
  }

  const textColor = isLightColor(color) ? "#1a1a1a" : "#ffffff";

  return (
    <span
      className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold tracking-wide transition-all"
      style={{
        backgroundColor: `${color}25`, // 15% opacity background
        color: color,
        border: `1px solid ${color}40`,
      }}
      title={label}
    >
      <span
        className="w-1.5 h-1.5 rounded-full mr-1.5 flex-shrink-0"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  );
}
