import { CELLO_TUNING, MAX_CELLO_SEMITONE } from "../theory/celloFingerboard";
import {
	BowedFingerboard,
	type BowedFingerboardSharedProps,
	type BowedLabelMode,
	type BowedOverlayMode,
} from "./BowedFingerboard";

export type CelloOverlayMode = BowedOverlayMode;
export type CelloLabelMode = BowedLabelMode;
export type CelloFingerboardProps = BowedFingerboardSharedProps;

const CELLO_SUBSCRIPTS = ["IV · C", "III · G", "II · D", "I · A"] as const;
const CELLO_OCTAVES = ["C2", "G2", "D3", "A3"] as const;
const CELLO_STRING_WIDTHS = [2.84, 2.36, 1.88, 1.4] as const;

export function CelloFingerboard(props: CelloFingerboardProps) {
	return (
		<BowedFingerboard
			instrumentSlug="cello"
			instrumentTitle="Cello"
			tuning={CELLO_TUNING}
			maxSemitone={MAX_CELLO_SEMITONE}
			stringSubscripts={CELLO_SUBSCRIPTS}
			stringOctaveLabels={CELLO_OCTAVES}
			stringWidths={CELLO_STRING_WIDTHS}
			{...props}
		/>
	);
}
