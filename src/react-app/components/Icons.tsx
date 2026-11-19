import type { ReactNode } from "react";
import type { ChordQuality } from "../theory/circleOfFifths";

interface IconProps {
	size?: number;
}

function StrokeIcon({
	size,
	strokeWidth = 2,
	children,
}: {
	size: number;
	strokeWidth?: number;
	children: ReactNode;
}) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={strokeWidth}
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			{children}
		</svg>
	);
}

export function IconPlay({ size = 13 }: IconProps) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 16 16"
			fill="currentColor"
			aria-hidden="true"
		>
			<path d="M4.25 2.75a.75.75 0 0 1 1.14-.64l8 5a.75.75 0 0 1 0 1.28l-8 5a.75.75 0 0 1-1.14-.64v-10Z" />
		</svg>
	);
}

export function IconStop({ size = 12 }: IconProps) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 16 16"
			fill="currentColor"
			aria-hidden="true"
		>
			<rect x="3" y="3" width="10" height="10" rx="2" />
		</svg>
	);
}

export function IconSun({ size = 15 }: IconProps) {
	return (
		<StrokeIcon size={size}>
			<circle cx="12" cy="12" r="4" />
			<path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
		</StrokeIcon>
	);
}

export function IconMoon({ size = 15 }: IconProps) {
	return (
		<StrokeIcon size={size}>
			<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
		</StrokeIcon>
	);
}

export function IconVolume({ size = 14 }: IconProps) {
	return (
		<StrokeIcon size={size}>
			<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
			<path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
		</StrokeIcon>
	);
}

export function IconVolumeMute({ size = 14 }: IconProps) {
	return (
		<StrokeIcon size={size}>
			<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
			<line x1="22" y1="9" x2="16" y2="15" />
			<line x1="16" y1="9" x2="22" y2="15" />
		</StrokeIcon>
	);
}

export function IconKeyboard({ size = 15 }: IconProps) {
	return (
		<StrokeIcon size={size}>
			<rect x="2" y="5" width="20" height="14" rx="2" />
			<path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M8 13h8" />
		</StrokeIcon>
	);
}

export function IconPin({ size = 13 }: IconProps) {
	return (
		<StrokeIcon size={size}>
			<path d="M12 17v5" />
			<path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
		</StrokeIcon>
	);
}

export function IconRotate({ size = 13 }: IconProps) {
	return (
		<StrokeIcon size={size}>
			<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
			<path d="M21 3v5h-5" />
		</StrokeIcon>
	);
}

export function IconSwap({ size = 13 }: IconProps) {
	return (
		<StrokeIcon size={size}>
			<path d="m16 3 4 4-4 4" />
			<path d="M20 7H4" />
			<path d="m8 21-4-4 4-4" />
			<path d="M4 17h16" />
		</StrokeIcon>
	);
}

export function IconRotateCcw({ size = 13 }: IconProps) {
	return (
		<StrokeIcon size={size} strokeWidth={2.1}>
			<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
			<path d="M3 3v5h5" />
		</StrokeIcon>
	);
}

export function IconMusic({ size = 13 }: IconProps) {
	return (
		<StrokeIcon size={size}>
			<path d="M9 18V5l12-2v13" />
			<circle cx="6" cy="18" r="3" />
			<circle cx="18" cy="16" r="3" />
		</StrokeIcon>
	);
}

export function IconCircleWheel({ size = 14 }: IconProps) {
	return (
		<StrokeIcon size={size}>
			<circle cx="12" cy="12" r="9" />
			<circle cx="12" cy="12" r="3.5" />
			<path d="M12 3v5.5M19.79 16.5l-4.76-2.75M4.21 16.5l4.76-2.75" />
		</StrokeIcon>
	);
}

export function IconNeighbors({ size = 14 }: IconProps) {
	return (
		<StrokeIcon size={size}>
			<circle cx="12" cy="12" r="2.5" />
			<path d="m6.5 7.5-4 4.5 4 4.5" />
			<path d="m17.5 7.5 4 4.5-4 4.5" />
		</StrokeIcon>
	);
}

export function IconChords({ size = 14 }: IconProps) {
	return (
		<StrokeIcon size={size}>
			<polygon points="12 3 3 8 12 13 21 8 12 3" />
			<path d="m3 12.5 9 5 9-5" />
			<path d="m3 17 9 5 9-5" />
		</StrokeIcon>
	);
}

export function IconChevronDown({ size = 14 }: IconProps) {
	return (
		<StrokeIcon size={size}>
			<path d="m6 9 6 6 6-6" />
		</StrokeIcon>
	);
}

export function IconSliders({ size = 15 }: IconProps) {
	return (
		<StrokeIcon size={size}>
			<line x1="4" y1="21" x2="4" y2="14" />
			<line x1="4" y1="10" x2="4" y2="3" />
			<line x1="12" y1="21" x2="12" y2="12" />
			<line x1="12" y1="8" x2="12" y2="3" />
			<line x1="20" y1="21" x2="20" y2="16" />
			<line x1="20" y1="12" x2="20" y2="3" />
			<line x1="2" y1="14" x2="6" y2="14" />
			<line x1="10" y1="8" x2="14" y2="8" />
			<line x1="18" y1="16" x2="22" y2="16" />
		</StrokeIcon>
	);
}

export function IconUpload({ size = 13 }: IconProps) {
	return (
		<StrokeIcon size={size}>
			<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
			<polyline points="17 8 12 3 7 8" />
			<line x1="12" y1="3" x2="12" y2="15" />
		</StrokeIcon>
	);
}

export function IconX({ size = 12 }: IconProps) {
	return (
		<StrokeIcon size={size}>
			<line x1="18" y1="6" x2="6" y2="18" />
			<line x1="6" y1="6" x2="18" y2="18" />
		</StrokeIcon>
	);
}

export function getQualityClass(
	quality: ChordQuality,
): "q-major" | "q-minor" | "q-dim" {
	if (quality === "minor") return "q-minor";
	if (quality === "diminished") return "q-dim";
	return "q-major";
}

export function handleSvgButtonKeyDown(
	e: { key: string; preventDefault: () => void },
	action: () => void,
): void {
	if (e.key === "Enter" || e.key === " ") {
		e.preventDefault();
		action();
	}
}

export function SegmentedControl<T extends string | number>({
	ariaLabel,
	options,
	value,
	onChange,
	className = "",
}: {
	ariaLabel: string;
	options: ReadonlyArray<{ value: T; label: string; title?: string }>;
	value: T;
	onChange: (value: T) => void;
	className?: string;
}) {
	return (
		<div
			className={`segmented-control${className ? ` ${className}` : ""}`}
			role="group"
			aria-label={ariaLabel}
		>
			{options.map((opt) => {
				const isActive = opt.value === value;
				return (
					<button
						key={String(opt.value)}
						type="button"
						className={`seg-btn${isActive ? " is-active" : ""}`}
						aria-pressed={isActive}
						onClick={() => onChange(opt.value)}
						title={opt.title}
					>
						{opt.label}
					</button>
				);
			})}
		</div>
	);
}

export function SequencePlayButton({
	isPlaying,
	idleLabel,
	onClick,
	title,
}: {
	isPlaying: boolean;
	idleLabel: string;
	onClick: () => void;
	title?: string;
}) {
	return (
		<button
			type="button"
			className={`pill-action-btn pill-action-sm${isPlaying ? " is-playing" : ""}`}
			onClick={onClick}
			title={title}
		>
			{isPlaying ? (
				<>
					<IconStop size={10} /> Stop
				</>
			) : (
				<>
					<IconPlay size={10} /> {idleLabel}
				</>
			)}
		</button>
	);
}

export function SongHitMarker({
	cx,
	cy,
	radius,
	isHarmonic,
}: {
	cx: number;
	cy: number;
	radius: number;
	isHarmonic: boolean;
}) {
	return isHarmonic ? (
		<polygon
			points={`${cx},${cy - radius} ${cx + radius},${cy} ${cx},${cy + radius} ${cx - radius},${cy}`}
			className="song-hit-harmonic"
		/>
	) : (
		<circle cx={cx} cy={cy} r={radius} className="song-hit-halo" />
	);
}
