interface KeySignatureStaffProps {
	accidentalsCount: number;
	accidentals: string[];
}

// 5-line treble staff coordinates (top line F5 = 14, bottom line E4 = 38, spacing = 6px)
const STAFF_LINES = [14, 20, 26, 32, 38] as const;

// Canonical treble clef vertical positions for sharps (F#, C#, G#, D#, A#, E#, B#)
const SHARP_Y = [14, 23, 11, 20, 29, 17, 26] as const;

// Canonical treble clef vertical positions for flats (Bb, Eb, Ab, Db, Gb, Cb, Fb)
const FLAT_Y = [26, 17, 29, 20, 32, 23, 35] as const;

export function KeySignatureStaff({
	accidentalsCount,
	accidentals,
}: KeySignatureStaffProps) {
	const isSharps = accidentalsCount > 0;
	const count = Math.abs(accidentalsCount);
	const yPositions = isSharps ? SHARP_Y : FLAT_Y;
	const symbol = isSharps ? "♯" : "♭";

	return (
		<div
			className="staff-badge"
			title={
				accidentals.length > 0
					? `Key signature: ${accidentals.join(", ")}`
					: "Key signature: no sharps or flats"
			}
		>
			<svg
				viewBox="0 0 132 50"
				className="staff-svg"
				role="img"
				aria-label={
					accidentals.length > 0
						? `Treble clef key signature showing ${accidentals.join(", ")}`
						: "Treble clef key signature with no sharps or flats"
				}
			>
				{STAFF_LINES.map((y) => (
					<line key={y} x1="6" y1={y} x2="126" y2={y} className="staff-line" />
				))}

				{/* Crisp vector Treble (G) Clef centered on the G4 line (y=32) */}
				<path
					d="M 19.5 34.5 C 22.8 34.5 24.5 31.8 23.8 29.2 C 23.1 26.8 20.4 25.8 18.1 26.8 C 15.3 28.0 14.3 31.5 15.8 34.5 C 17.4 37.6 22.0 38.4 24.6 35.8 C 27.0 33.4 26.8 28.2 23.8 25.4 C 21.3 23.1 17.5 21.8 16.9 18.6 C 16.3 15.4 18.8 11.4 21.1 9.6 C 22.2 12.2 21.9 16.8 19.2 19.8 C 17.6 21.5 17.8 25.0 18.6 30.8 L 19.7 39.2 C 20.0 42.0 18.4 44.2 16.1 44.4 C 14.2 44.5 13.0 43.2 13.3 41.7 C 13.6 40.4 15.0 40.0 16.0 40.9"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.6"
					strokeLinecap="round"
					strokeLinejoin="round"
					className="staff-clef-path"
					aria-hidden="true"
				/>

				{count === 0 ? (
					<text x="72" y="29" className="staff-natural" textAnchor="middle">
						♮ natural
					</text>
				) : (
					Array.from({ length: count }).map((_, idx) => (
						<text
							key={idx}
							x={39 + idx * 11.5}
							y={yPositions[idx] + 1}
							textAnchor="middle"
							dominantBaseline="central"
							className={
								isSharps
									? "staff-accidental staff-sharp"
									: "staff-accidental staff-flat"
							}
						>
							{symbol}
						</text>
					))
				)}
			</svg>
		</div>
	);
}
