import {
	ChordQuality,
	READABLE_CHROMATIC,
	getPianoBadgeClass,
	handleSvgButtonKeyDown,
	mod12,
} from "../theory/circleOfFifths";

interface PianoKeyboardProps {
	activeMidiNotes: number[];
	activeSongMidi?: number[] | null;
	activeQuality?: ChordQuality;
	scalePitchClasses: number[];
	activeNoteNamesByMidi?: Record<number, string>;
	onPlayNote: (midi: number) => void;
}

const WHITE_PCS = [0, 2, 4, 5, 7, 9, 11] as const;
const BLACK_KEY_OFFSETS = [
	{ pc: 1, afterWhiteIndex: 0 },
	{ pc: 3, afterWhiteIndex: 1 },
	{ pc: 6, afterWhiteIndex: 3 },
	{ pc: 8, afterWhiteIndex: 4 },
	{ pc: 10, afterWhiteIndex: 5 },
] as const;

export function PianoKeyboard({
	activeMidiNotes,
	activeSongMidi = null,
	activeQuality = "major",
	scalePitchClasses,
	activeNoteNamesByMidi = {},
	onPlayNote,
}: PianoKeyboardProps) {
	const whiteKeyWidth = 30;
	const whiteKeyHeight = 82;
	const blackKeyWidth = 18;
	const blackKeyHeight = 49;

	const whiteKeys: { midi: number; x: number; pc: number; octave: number }[] =
		[];
	const blackKeys: { midi: number; x: number; pc: number; octave: number }[] =
		[];

	for (let octave = 0; octave < 2; octave++) {
		const baseMidi = 60 + octave * 12;
		WHITE_PCS.forEach((pc, wIdx) => {
			whiteKeys.push({
				midi: baseMidi + pc,
				x: (octave * 7 + wIdx) * whiteKeyWidth,
				pc,
				octave: 4 + octave,
			});
		});
		BLACK_KEY_OFFSETS.forEach(({ pc, afterWhiteIndex }) => {
			blackKeys.push({
				midi: baseMidi + pc,
				x:
					(octave * 7 + afterWhiteIndex + 1) * whiteKeyWidth -
					blackKeyWidth / 2,
				pc,
				octave: 4 + octave,
			});
		});
	}

	const totalWidth = whiteKeys.length * whiteKeyWidth;
	const activeSet = new Set(activeMidiNotes);
	const rawSongMidi = activeSongMidi ?? [];
	const hasInRangeSongNote = rawSongMidi.some((m) => m >= 60 && m <= 83);
	const songMidiSet = new Set(
		hasInRangeSongNote
			? rawSongMidi
			: rawSongMidi.map((m) => (m >= 84 ? 72 : 60) + mod12(m)),
	);
	const scaleSet = new Set(scalePitchClasses);
	const qualityClass = getPianoBadgeClass(activeQuality);

	const renderKey = (
		key: { midi: number; x: number; pc: number; octave: number },
		isBlack: boolean,
	) => {
		const isActive = activeSet.has(key.midi);
		const isSongHit = songMidiSet.has(key.midi);
		const inScale = scaleSet.has(key.pc);
		const label =
			activeNoteNamesByMidi[key.midi] ?? READABLE_CHROMATIC[mod12(key.pc)];
		const width = isBlack ? blackKeyWidth : whiteKeyWidth;
		const height = isBlack ? blackKeyHeight : whiteKeyHeight;
		const centerX = key.x + width / 2;
		const markerY = height - (isBlack ? 10 : 12);

		return (
			<g
				key={key.midi}
				role="button"
				tabIndex={0}
				aria-label={`Piano key ${label}${key.octave}`}
				className={`piano-key ${isBlack ? "piano-black" : "piano-white"} ${
					isActive ? `is-active ${qualityClass}` : ""
				} ${isSongHit ? `is-song-hit ${qualityClass}` : ""}`}
				onClick={() => onPlayNote(key.midi)}
				onKeyDown={(e) => handleSvgButtonKeyDown(e, () => onPlayNote(key.midi))}
			>
				<rect
					x={isBlack ? key.x : key.x + 0.75}
					y={0.75}
					width={isBlack ? width : width - 1.5}
					height={isBlack ? height : height - 1.5}
					rx={isBlack ? 3 : 4}
					className="piano-key-rect"
				/>
				{isActive || isSongHit ? (
					<text
						x={centerX}
						y={markerY}
						textAnchor="middle"
						className={`piano-note-label${isBlack ? " piano-note-label-black" : ""}`}
					>
						{label}
					</text>
				) : inScale ? (
					<circle
						cx={centerX}
						cy={markerY}
						r={isBlack ? 2.5 : 3}
						className={`piano-scale-dot${isBlack ? " piano-scale-dot-black" : ""}`}
					/>
				) : null}
				{!isBlack && key.pc === 0 && !isActive && !isSongHit && (
					<text
						x={centerX}
						y={height - 23}
						textAnchor="middle"
						className="piano-octave-tag"
					>
						C{key.octave}
					</text>
				)}
			</g>
		);
	};

	return (
		<div className="piano-wrap">
			<svg
				viewBox={`0 0 ${totalWidth} ${whiteKeyHeight + 2}`}
				className="piano-svg"
				role="group"
				aria-label="Interactive two-octave piano keyboard C4 to B5"
			>
				{whiteKeys.map((key) => renderKey(key, false))}
				{blackKeys.map((key) => renderKey(key, true))}
			</svg>
			<div className="piano-legend" aria-label="Piano keyboard legend">
				<span className="legend-chip">
					<span className={`legend-dot is-primary ${qualityClass}`} />
					<span>Active chord</span>
				</span>
				<span className="legend-chip">
					<span className="legend-dot is-piano-scale" />
					<span>Key scale note</span>
				</span>
				<span className="piano-legend-hint">Click any key to play (C4–B5)</span>
			</div>
		</div>
	);
}
