export { solveInstrumentStops, type SolvedStop } from "./ergonomicSolver";
export {
	detectKeyFromEvents,
	inferHarmonyForWindow,
	resolveExplicitChordSymbol,
	resolveKeySignatureFromRootPc,
	type InferredHarmony,
} from "./harmonicAnalyzer";
export {
	compileMusicXml,
	inspectMusicXml,
	type ImportedMusicXmlResult,
	type MusicXmlImportOptions,
	type MusicXmlInspection,
	type MusicXmlPartSummary,
} from "./musicXmlToIr";
export { isMxlBuffer, readMusicXmlTextFromBytes } from "./mxlUnpack";
export {
	buildTempoConverter,
	compileScoreTrackToSongDocument,
	formatSongDocumentModule,
	linearizeRepeatedBars,
	type CompileScoreOptions,
	type ScoreBarIR,
	type ScoreNoteIR,
	type ScoreTempoEvent,
	type ScoreTrackIR,
} from "./scoreCompiler";
export { parseXml, type XmlNode } from "./xmlParser";
