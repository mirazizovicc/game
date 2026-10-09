import type { PublicOption } from "@/lib/domain/view";
import { CheckIcon, CrossIcon, Shape } from "./Shapes";

export type TileState = "idle" | "selected" | "locked" | "correct" | "wrong" | "dim";

const COLORS = [
  "bg-opt-a text-white",
  "bg-opt-b text-white",
  "bg-opt-c text-ink-950",
  "bg-opt-d text-white",
] as const;

const LETTERS = ["A", "B", "C", "D"] as const;

interface OptionTileProps {
  position: number;
  option: PublicOption;
  state: TileState;
  /** "host" is sized for a projector; "player" for a phone. */
  size: "host" | "player";
  onSelect?: (optionId: string) => void;
  /** Reveal statistics (aggregate only). */
  count?: number;
  total?: number;
}

export function OptionTile({ position, option, state, size, onSelect, count, total }: OptionTileProps) {
  const interactive = onSelect !== undefined && state === "idle";
  const color = COLORS[position % 4];
  const fade = state === "dim" || state === "locked" || state === "wrong" ? "opacity-60" : "";
  const ring =
    state === "correct"
      ? "ring-[6px] ring-good scale-[1.02]"
      : state === "selected"
        ? "ring-[6px] ring-ivory"
        : "ring-0";
  const text = size === "host" ? "text-[min(2.5vw,4.4vh)] leading-tight" : "text-lg leading-snug";
  const pad = size === "host" ? "px-[2vw] py-[1.4vh] gap-[1.6vw]" : "px-4 py-4 gap-3";
  const percent = total && count !== undefined && total > 0 ? Math.round((count / total) * 100) : 0;

  const label = `Option ${LETTERS[position % 4]}: ${option.text}${state === "correct" ? " (correct answer)" : ""}${state === "selected" ? " (your answer)" : ""}`;

  const body = (
    <>
      <span className="relative z-10 flex shrink-0 flex-col items-center">
        <Shape index={position} className={size === "host" ? "size-[min(4vw,7vh)]" : "size-7"} />
      </span>
      <span className={`relative z-10 flex-1 text-left font-display font-bold ${text}`}>
        <span className="sr-only">{LETTERS[position % 4]}. </span>
        {option.text}
      </span>
      {count !== undefined && (
        <span className="relative z-10 shrink-0 text-right font-display font-extrabold tabular-nums">
          <span className={size === "host" ? "block text-[min(3.4vw,6vh)] leading-none" : "block text-2xl leading-none"}>{count}</span>
          <span className={size === "host" ? "block text-[min(1.2vw,2.2vh)] font-bold" : "block text-xs font-bold"}>{percent}%</span>
        </span>
      )}
      {state === "correct" && (
        <span className="relative z-10 grid shrink-0 place-items-center rounded-full bg-good p-1.5 text-ink-950">
          <CheckIcon className={size === "host" ? "size-[min(3vw,5vh)]" : "size-6"} />
        </span>
      )}
      {state === "selected" && (
        <span className="relative z-10 shrink-0 rounded-full bg-ivory px-3 py-1 text-xs font-extrabold uppercase tracking-wide text-ink-950">Your answer</span>
      )}
      {state === "wrong" && (
        <span className="relative z-10 grid shrink-0 place-items-center rounded-full bg-ivory p-1.5 text-bad">
          <CrossIcon className={size === "host" ? "size-[min(3vw,5vh)]" : "size-6"} />
        </span>
      )}
      {/* Distribution bar: a thin strip along the bottom edge so it never alters text contrast. */}
      {count !== undefined && (
        <span aria-hidden className="absolute bottom-0 left-0 h-2 bg-current transition-[width] duration-700 sm:h-3" style={{ width: `${percent}%` }} />
      )}
    </>
  );

  const classes = `relative flex w-full items-center overflow-hidden rounded-[1.1rem] shadow-card transition-[opacity,transform,box-shadow] duration-200 ${color} ${fade} ${ring} ${pad}`;

  if (interactive) {
    return (
      <button type="button" aria-label={label} onClick={() => onSelect(option.id)} className={`${classes} min-h-20 cursor-pointer active:scale-[0.98]`}>
        {body}
      </button>
    );
  }
  return (
    <div role="group" aria-label={label} className={`${classes} ${size === "player" ? "min-h-20" : "min-h-0"}`}>
      {body}
    </div>
  );
}
