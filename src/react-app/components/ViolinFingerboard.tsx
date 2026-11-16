import {
	MAX_VIOLIN_SEMITONE,
	VIOLIN_TUNING,
} from "../theory/violinFingerboard";
import {
	BowedFingerboard,
	type BowedFingerboardSharedProps,
	type BowedLabelMode,
	type BowedOverlayMode,
} from "./BowedFingerboard";

export type ViolinOverlayMode = BowedOverlayMode;
export type ViolinLabelMode = BowedLabelMode;
export type ViolinFingerboardProps = BowedFingerboardSharedProps;

const VIOLIN_SUBSCRIPTS = ["IV · G", "III · D", "II · A", "I · E"] as const;
const VIOLIN_OCTAVES = ["G3", "D4", "A4", "E5"] as const;
const VIOLIN_STRING_WIDTHS = [1.95, 1.65, 1.35, 1.08] as const;

export function ViolinFingerboard(props: ViolinFingerboardProps) {
	return (
		<BowedFingerboard
			instrumentSlug="violin"
			instrumentTitle="Violin"
			tuning={VIOLIN_TUNING}
			maxSemitone={MAX_VIOLIN_SEMITONE}
			stringSubscripts={VIOLIN_SUBSCRIPTS}
			stringOctaveLabels={VIOLIN_OCTAVES}
			stringWidths={VIOLIN_STRING_WIDTHS}
			{...props}
		/>
	);
}
