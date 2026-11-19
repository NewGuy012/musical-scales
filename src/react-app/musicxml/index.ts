export { solveInstrumentStops } from "./ergonomicSolver";
export {
	detectKeyFromEvents,
	inferHarmonyForWindow,
	resolveExplicitChordSymbol,
} from "./harmonicAnalyzer";
export {
	compileMusicXml,
	inspectMusicXml,
	parseMusicXmlDocument,
	type MusicXmlImportOptions,
	type MusicXmlPartSummary,
} from "./musicXmlToIr";
export { isMxlBuffer, readMusicXmlTextFromBytes } from "./mxlUnpack";
export {
	compileScoreTrackToSongDocument,
	formatSongDocumentModule,
	linearizeRepeatedBars,
	type ScoreBarIR,
} from "./scoreCompiler";
export { parseXml, type XmlNode } from "./xmlParser";
