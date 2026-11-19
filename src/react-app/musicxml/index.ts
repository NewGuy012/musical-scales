export { solveInstrumentStops, type SolvedStop } from "./ergonomicSolver";
export {
	detectKeyFromEvents,
	inferHarmonyForWindow,
	parseExplicitKeyOption,
	resolveExplicitChordSymbol,
	resolveKeySignatureFromRootPc,
	type DetectKeyOptions,
	type InferredHarmony,
	type KeySignatureResolution,
} from "./harmonicAnalyzer";
export {
	compileMusicXml,
	inspectMusicXml,
	parseMusicXmlDocument,
	type ImportedMusicXmlResult,
	type MusicXmlImportOptions,
	type MusicXmlInspection,
	type MusicXmlPartSummary,
} from "./musicXmlToIr";
export { isMxlBuffer, readMusicXmlTextFromBytes } from "./mxlUnpack";
export {
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
