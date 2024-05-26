import generateChromaticScale from "./ChromaticScale.js";
import MusicalScales from "./MusicalScales.js";

const ChromaticScale = generateChromaticScale();
console.log(ChromaticScale.key);
ChromaticScale.updateKey("D");
console.log(ChromaticScale.key);

const scaleIntervals = MusicalScales.getScaleInterval("major");
const scale = MusicalScales.generateScale(ChromaticScale, scaleIntervals);
console.log(scale);

const chordIntervals = MusicalScales.getChordIntervals("major");
const chord = MusicalScales.generateChord(scale, chordIntervals);
console.log(chord);
