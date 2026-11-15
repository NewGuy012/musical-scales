import { ChordQuality, mod12 } from "../theory/circleOfFifths";

interface PianoKeyboardProps {
	activeMidiNotes: number[];
	activeLabel?: string;
	activeQuality?: ChordQuality;
	scalePitchClasses: number[];
	activeNoteNamesByMidi?: Record<number, string>;
	onPlayNote: (midi: number) => void;
}

const WHITE_PCS = [0, 2, 4, 5, 7, 9, 11] as const;
const BLACK_KEY_OFFSETS: { pc: number; afterWhiteIndex: number }[] = [
	{ pc: 1, afterWhiteIndex: 0 },
	{ pc: 3, afterWhiteIndex: 1 },
	{ pc: 6, afterWhiteIndex: 3 },
	{ pc: 8, afterWhiteIndex: 4 },
	{ pc: 10, afterWhiteIndex: 5 },
];

const FALLBACK_NOTE_NAMES = [
	"C",
	"C♯",
	"D",
	"E♭",
	"E",
	"F",
	"F♯",
	"G",
	"A♭",
	"A",
	"B♭",
	"B",
];

export function PianoKeyboard({
	activeMidiNotes,
	activeLabel,
	activeQuality = "major",
	scalePitchClasses,
	activeNoteNamesByMidi = {},
	onPlayNote,
}: PianoKeyboardProps) {
	const whiteKeyWidth = 30;
	const whiteKeyHeight = 104;
	const blackKeyWidth = 18;
	const blackKeyHeight = 62;

	const whiteKeys: { midi: number; x: number; pc: number; octave: number }[] =
		[];
	const blackKeys: { midi: number; x: number; pc: number; octave: number }[] =
		[];

	for (let octave = 0; octave < 2; octave++) {
		const baseMidi = 60 + octave * 12;
		WHITE_PCS.forEach((pc, wIdx) => {
			const globalWhiteIdx = octave * 7 + wIdx;
			whiteKeys.push({
				midi: baseMidi + pc,
				x: globalWhiteIdx * whiteKeyWidth,
				pc,
				octave: 4 + octave,
			});
		});
		BLACK_KEY_OFFSETS.forEach(({ pc, afterWhiteIndex }) => {
			const globalWhiteIdx = octave * 7 + afterWhiteIndex;
			blackKeys.push({
				midi: baseMidi + pc,
				x: (globalWhiteIdx + 1) * whiteKeyWidth - blackKeyWidth / 2,
				pc,
				octave: 4 + octave,
			});
		});
	}

	const totalWidth = whiteKeys.length * whiteKeyWidth;
	const activeSet = new Set(activeMidiNotes);
	const scaleSet = new Set(scalePitchClasses);
	const qualityClass =
		activeQuality === "minor"
			? "piano-active-minor"
			: activeQuality === "diminished"
				? "piano-active-dim"
				: "piano-active-major";

	return (
		<div className="piano-wrap">
			<div className="piano-header">
				<span className="piano-title">
					Piano Voicing{" "}
					{activeLabel && (
						<span className={`piano-badge ${qualityClass}`}>
							{activeLabel}
						</span>
					)}
				</span>
				<span className="piano-hint">
					Dots show scale notes · Click any key to play
				</span>
			</div>

			<svg
				viewBox={`0 0 ${totalWidth} ${whiteKeyHeight + 2}`}
				className="piano-svg"
				role="group"
				aria-label="Interactive two-octave piano keyboard C4 to B5"
			>
				{/* White Keys */}
				{whiteKeys.map((key) => {
					const isActive = activeSet.has(key.midi);
					const inScale = scaleSet.has(key.pc);
					const label =
						activeNoteNamesByMidi[key.midi] ??
						FALLBACK_NOTE_NAMES[mod12(key.pc)];

					return (
						<g
							key={key.midi}
							role="button"
							tabIndex={0}
							aria-label={`Piano key ${label}${key.octave}`}
							className={`piano-key piano-white ${
								isActive ? `is-active ${qualityClass}` : ""
							}`}
							onClick={() => onPlayNote(key.midi)}
							onKeyDown={(e) => {
								if (e.key === "Enter" || e.key === " ") {
									e.preventDefault();
									onPlayNote(key.midi);
								}
							}}
						>
							<rect
								x={key.x + 0.75}
								y={0.75}
								width={whiteKeyWidth - 1.5}
								height={whiteKeyHeight - 1.5}
								rx={4}
								className="piano-key-rect"
							/>
							{isActive ? (
								<text
									x={key.x + whiteKeyWidth / 2}
									y={whiteKeyHeight - 14}
									textAnchor="middle"
									className="piano-note-label"
								>
									{label}
								</text>
							) : inScale ? (
								<circle
									cx={key.x + whiteKeyWidth / 2}
									cy={whiteKeyHeight - 14}
									r={3}
									className="piano-scale-dot"
								/>
							) : null}
							{key.pc === 0 && !isActive && (
								<text
									x={key.x + whiteKeyWidth / 2}
									y={whiteKeyHeight - 28}
									textAnchor="middle"
									className="piano-octave-tag"
								>
									C{key.octave}
								</text>
							)}
						</g>
					);
				})}

				{/* Black Keys */}
				{blackKeys.map((key) => {
					const isActive = activeSet.has(key.midi);
					const inScale = scaleSet.has(key.pc);
					const label =
						activeNoteNamesByMidi[key.midi] ??
						FALLBACK_NOTE_NAMES[mod12(key.pc)];

					return (
						<g
							key={key.midi}
							role="button"
							tabIndex={0}
							aria-label={`Piano key ${label}${key.octave}`}
							className={`piano-key piano-black ${
								isActive ? `is-active ${qualityClass}` : ""
							}`}
							onClick={() => onPlayNote(key.midi)}
							onKeyDown={(e) => {
								if (e.key === "Enter" || e.key === " ") {
									e.preventDefault();
									onPlayNote(key.midi);
								}
							}}
						>
							<rect
								x={key.x}
								y={0.75}
								width={blackKeyWidth}
								height={blackKeyHeight}
								rx={3}
								className="piano-key-rect"
							/>
							{isActive ? (
								<text
									x={key.x + blackKeyWidth / 2}
									y={blackKeyHeight - 11}
									textAnchor="middle"
									className="piano-note-label piano-note-label-black"
								>
									{label}
								</text>
							) : inScale ? (
								<circle
									cx={key.x + blackKeyWidth / 2}
									cy={blackKeyHeight - 11}
									r={2.5}
									className="piano-scale-dot piano-scale-dot-black"
								/>
							) : null}
						</g>
					);
				})}
			</svg>
		</div>
	);
}
