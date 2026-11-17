export * from "./songRuntime";
import { BACH_CELLO_SUITE_1_SPEC } from "./bachCelloSuite1";
import { CANNONBALL_RAG_SPEC } from "./cannonballRag";
import { DEBUSSY_CLAIR_DE_LUNE_SPEC } from "./debussyClairDeLune";
import { HAYDN_CELLO_CONCERTO_2_SPEC } from "./haydnCelloConcerto2";
import { MASSENET_MEDITATION_SPEC } from "./massenetMeditation";
import { SCHUBERT_MOMENT_MUSICAUX_3_SPEC } from "./schubertMomentMusicaux3";
import {
	type InstrumentTab,
	type SongExample,
	hydrateSong,
} from "./songRuntime";
import { TOMMY_AMAZING_GRACE_SPEC } from "./tommyAmazingGrace";

export const SONG_EXAMPLES: SongExample[] = [
	hydrateSong(SCHUBERT_MOMENT_MUSICAUX_3_SPEC),
	hydrateSong(DEBUSSY_CLAIR_DE_LUNE_SPEC),
	hydrateSong(CANNONBALL_RAG_SPEC),
	hydrateSong(TOMMY_AMAZING_GRACE_SPEC),
	hydrateSong(MASSENET_MEDITATION_SPEC),
	hydrateSong(BACH_CELLO_SUITE_1_SPEC),
	hydrateSong(HAYDN_CELLO_CONCERTO_2_SPEC),
];

export function getSongsForInstrument(
	instrument: InstrumentTab,
): SongExample[] {
	return SONG_EXAMPLES.filter((song) => song.instruments.includes(instrument));
}
