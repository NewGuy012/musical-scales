import MusicalScales from "./MusicalScales.js";

export default function generateChromaticScale() {
    const chromaticScale = new MusicalScales();

    chromaticScale.insert("C");
    chromaticScale.insert("C#");
    chromaticScale.insert("D");
    chromaticScale.insert("D#");
    chromaticScale.insert("E");
    chromaticScale.insert("F");
    chromaticScale.insert("F#");
    chromaticScale.insert("G");
    chromaticScale.insert("G#");
    chromaticScale.insert("A");
    chromaticScale.insert("A#");
    chromaticScale.insert("B");

    chromaticScale.generateScales();
    chromaticScale.generateChords();

    return chromaticScale;
}
