import { cn } from "@/lib/utils";

const GRID = 5;

function hash(value: string): number {
  // FNV-1a, 32 bit
  let result = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 0x01000193);
  }
  return result >>> 0;
}

/** Deterministic, horizontally mirrored identicon derived from a token. */
export function SessionIcon({
  token,
  className,
}: {
  token: string;
  className?: string;
}) {
  const bits = hash(token);
  const hue = hash(token + ":hue") % 360;
  const cells: Array<{ x: number; y: number }> = [];
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < Math.ceil(GRID / 2); x++) {
      if (((bits >>> (y * 3 + x)) & 1) === 0) continue;
      cells.push({ x, y });
      if (x !== GRID - 1 - x) cells.push({ x: GRID - 1 - x, y });
    }
  }

  return (
    <svg
      viewBox={`-1 -1 ${GRID + 2} ${GRID + 2}`}
      className={cn("size-8 rounded-full", className)}
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      <rect
        x={-1}
        y={-1}
        width={GRID + 2}
        height={GRID + 2}
        fill={`oklch(0.93 0.05 ${hue})`}
      />
      {cells.map(({ x, y }) => (
        <rect
          key={`${x}-${y}`}
          x={x}
          y={y}
          width={1}
          height={1}
          fill={`oklch(0.52 0.16 ${hue})`}
        />
      ))}
    </svg>
  );
}
