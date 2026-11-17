import type { KeyMode } from "./circleOfFifths";
import {
	type InstrumentTab,
	type SongExample,
	hydrateSong,
} from "./songRuntime";

export interface SongCatalogEntry {
	id: string;
	title: string;
	composerOrSource: string;
	subtitle: string;
	instruments: InstrumentTab[];
	keySlot: number;
	keyMode: KeyMode;
	keyLabel: string;
	timeSignature: string;
	bpm: number;
	barCount: number;
	tuning?: number[];
	capo?: number;
	theorySummary: string;
}

export const SONG_CATALOG: SongCatalogEntry[] = [
	{
		id: "schubert-moment-musicaux-3",
		title: "Moment Musicaux No. 3",
		composerOrSource: "Franz Schubert · Op. 94, No. 3 (D. 780)",
		subtitle: "78-bar 'Air Russe' in F Minor with Picardy F Major coda",
		instruments: ["piano"],
		keySlot: 8,
		keyMode: "minor",
		keyLabel: "F Minor",
		timeSignature: "2/4",
		bpm: 80,
		barCount: 78,
		theorySummary:
			"Complete 78-bar piano miniature in F Minor (2/4, Allegro moderato): bounces over a crisp staccato oom-pah bass with playful grace-note appoggiaturas, brightens to relative A♭ Major (III) in Bar 19, surges through C7 and F7/A, and transforms F Minor into luminous F Major via a Picardy third in Bar 65.",
	},
	{
		id: "debussy-clair-de-lune",
		title: "Clair de lune",
		composerOrSource: "Claude Debussy · Suite bergamasque, L. 75",
		subtitle: "9/8 Impressionist moonlight sweep in D♭ Major",
		instruments: ["piano"],
		keySlot: 7,
		keyMode: "major",
		keyLabel: "D♭ Major",
		timeSignature: "9/8",
		bpm: 54,
		barCount: 72,
		theorySummary:
			"All 72 bars in D♭ Major: descending pentatonic thirds, lush I–IVmaj7–V13 harmonies, flowing 16th-note arpeggios, an enharmonic C♯ minor climax, and fading D♭/D♭m coda swells.",
	},
	{
		id: "cannonball-rag-guitar",
		title: "Cannonball Rag",
		composerOrSource: "Merle Travis · arr. Chris Murrin",
		subtitle: "Cut-time G major thumb-pick rag · [A]–[F] & Banjo Rolls",
		instruments: ["guitar"],
		keySlot: 1,
		keyMode: "major",
		keyLabel: "G Major",
		timeSignature: "2/2",
		bpm: 120,
		barCount: 58,
		theorySummary:
			"Transcribed directly from Chris Murrin's notation & TAB of Merle Travis's signature thumb-picking ragtime classic: opens with the iconic D3–C♯3–D3 A-string pickup, cycles through the circle-of-fifths hook (E7 → A9 → D9/A → G6), D4→D♯4→E4 blue slides ([B]), tritone-shifted E♭9/F9 harmony ([C]), 16-bar Scruggs-style open-e banjo rolls ([D]), walking bass ([E]), and a full-neck chromatic Ragtime descent into open G ([F]).",
	},
	{
		id: "amazing-grace-guitar",
		title: "Amazing Grace",
		composerOrSource: "Traditional · arr. Tommy Emmanuel",
		subtitle: "Fingerstyle E major (9/8) · Verse 1, Verse 2 & Bell Harmonics",
		instruments: ["guitar"],
		keySlot: 4,
		keyMode: "major",
		keyLabel: "E Major",
		timeSignature: "9/8",
		bpm: 63,
		barCount: 36,
		theorySummary:
			"Transcribed directly from the Tim Van Roy 9/8 E Major guitar score: opens with Verse 1's rubato chord-melody over E – Eaug/G♯ – Aadd9 – A♯°7 – B7/F♯ and C♯m7 – F♯m7 – C9♭5 – B7♯5, expands into Verse 2's richer bass fills and chromatic E6/E7 voicings, and closes cleanly with Verse 3's 12th-fret bell harmonics and Emaj9 cadence.",
	},
	{
		id: "massenet-meditation-thais",
		title: "Méditation (from Thaïs)",
		composerOrSource: "Jules Massenet · Act II Intermezzo",
		subtitle: "Complete 71-bar lyrical violin solo in D Major",
		instruments: ["violin"],
		keySlot: 2,
		keyMode: "major",
		keyLabel: "D Major",
		timeSignature: "4/4",
		bpm: 67,
		barCount: 71,
		theorySummary:
			"Complete 71-bar solo violin score in D Major (4/4): opens over 2 bars of D harp arpeggios before entering on F♯5 (sul A) → D5 → A4–D5–F♯5 → B5–C♯6–D6, modulates through C/E, B7, F Major, and A7♭9 cadenza, returns with descending-bass reprise (D7/C → G/B → D/A), slips in the famous C♯7 → D deceptive resolution and E♭7 tritone sub, and floats out on A6 and D6 natural harmonics.",
	},
	{
		id: "bach-cello-suite-1",
		title: "Cello Suite No. 1 — Prelude (BWV 1007)",
		composerOrSource: "J.S. Bach",
		subtitle: "Full 42-bar solo bariolage & harmonic journey in G Major",
		instruments: ["cello"],
		keySlot: 1,
		keyMode: "major",
		keyLabel: "G Major",
		timeSignature: "4/4",
		bpm: 96,
		barCount: 42,
		theorySummary:
			"Full 42-bar BWV 1007 Prelude: opens over an open G2 pedal (I–IV–V7–I), modulates through D Major (V) and Em (vi) to the Bar 22 fermata, climbs through open-A3 bariolage & chromatic passing tones, and resolves to G4.",
	},
	{
		id: "haydn-cello-concerto-2",
		title: "Cello Concerto No. 2 (I. Allegro moderato)",
		composerOrSource: "Joseph Haydn (Hob. VIIb:2)",
		subtitle: "I. Allegro moderato in D Major (4/4) · Exposition Highlights",
		instruments: ["cello"],
		keySlot: 2,
		keyMode: "major",
		keyLabel: "D Major",
		timeSignature: "4/4",
		bpm: 91,
		barCount: 28,
		theorySummary:
			"Transcribed cleanly from the First Movement (Allegro moderato, 4/4, D Major) Urtext & Klengel scores: opens with the stately orchestral main theme, introduces the singing Solo Cello (mf cantabile), modulates via E7 to the lyrical second theme and bariolage in A Major, sweeps through Rehearsal [A]'s virtuoso arpeggios, and resolves cleanly back to D Major.",
	},
];

export function getCatalogEntriesForInstrument(
	instrument: InstrumentTab,
): SongCatalogEntry[] {
	return SONG_CATALOG.filter((entry) => entry.instruments.includes(instrument));
}

export function createCatalogStubSong(entry: SongCatalogEntry): SongExample {
	return {
		id: entry.id,
		title: entry.title,
		composerOrSource: entry.composerOrSource,
		subtitle: entry.subtitle,
		instruments: entry.instruments,
		keySlot: entry.keySlot,
		keyMode: entry.keyMode,
		keyLabel: entry.keyLabel,
		timeSignature: entry.timeSignature,
		bpm: entry.bpm,
		...(entry.tuning ? { tuning: entry.tuning } : {}),
		...(entry.capo ? { capo: entry.capo } : {}),
		theorySummary: entry.theorySummary,
		barCount: entry.barCount,
		steps: [],
	};
}

export function getCatalogStubSongsForInstrument(
	instrument: InstrumentTab,
): SongExample[] {
	return getCatalogEntriesForInstrument(instrument).map(createCatalogStubSong);
}

const songCache = new Map<string, Promise<SongExample>>();

/**
 * Dynamically imports and hydrates a single repertoire song on demand so Vite
 * code-splits individual scores out of the main application bundle.
 */
export function loadSongById(id: string): Promise<SongExample> {
	const cached = songCache.get(id);
	if (cached) return cached;

	const pending = (async (): Promise<SongExample> => {
		switch (id) {
			case "schubert-moment-musicaux-3": {
				const mod = await import("./schubertMomentMusicaux3");
				return hydrateSong(mod.SCHUBERT_MOMENT_MUSICAUX_3_SPEC);
			}
			case "debussy-clair-de-lune": {
				const mod = await import("./debussyClairDeLune");
				return hydrateSong(mod.DEBUSSY_CLAIR_DE_LUNE_SPEC);
			}
			case "cannonball-rag-guitar": {
				const mod = await import("./cannonballRag");
				return hydrateSong(mod.CANNONBALL_RAG_SPEC);
			}
			case "amazing-grace-guitar": {
				const mod = await import("./tommyAmazingGrace");
				return hydrateSong(mod.TOMMY_AMAZING_GRACE_SPEC);
			}
			case "massenet-meditation-thais": {
				const mod = await import("./massenetMeditation");
				return hydrateSong(mod.MASSENET_MEDITATION_SPEC);
			}
			case "bach-cello-suite-1": {
				const mod = await import("./bachCelloSuite1");
				return hydrateSong(mod.BACH_CELLO_SUITE_1_SPEC);
			}
			case "haydn-cello-concerto-2": {
				const mod = await import("./haydnCelloConcerto2");
				return hydrateSong(mod.HAYDN_CELLO_CONCERTO_2_SPEC);
			}
			default:
				throw new Error(`Unknown song catalog ID: "${id}"`);
		}
	})();

	songCache.set(id, pending);
	return pending;
}
