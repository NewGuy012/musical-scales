import MusicalScales from "./MusicalScales.js";

export default function generateChromaticScale() {
    const ChromaticScale = new MusicalScales();

    ChromaticScale.insert("C");
    ChromaticScale.insert("C#");
    ChromaticScale.insert("D");
    ChromaticScale.insert("D#");
    ChromaticScale.insert("E");
    ChromaticScale.insert("F");
    ChromaticScale.insert("F#");
    ChromaticScale.insert("G");
    ChromaticScale.insert("G#");
    ChromaticScale.insert("A");
    ChromaticScale.insert("A#");
    ChromaticScale.insert("B");

    return ChromaticScale;
}
