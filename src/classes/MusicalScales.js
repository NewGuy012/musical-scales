import CircularDoublyLinkedList from "./CircularDoublyLinkedList.js";

class MusicalScales extends CircularDoublyLinkedList {
    constructor(key = "C") {
        super();
        this.key = key;
        this.majorScaleSteps = MusicalScales.getScaleSteps("major");
        this.minorScaleSteps = MusicalScales.getScaleSteps("minor");
    }

    updateKey(keyNew) {
        let temp = this.start;

        while (temp.value != keyNew && temp.next != this.start) {
            temp = temp.next;
        }

        this.start = temp;
        this.current = this.start;
        this.key = keyNew;
    }

    static getScaleInterval(scaleType) {
        const scaleInterval = {
            major: ["W", "W", "H", "W", "W", "W", "H"],
            minor: ["W", "W", "H", "W", "W", "W", "H"],
        };

        return scaleInterval[scaleType] ?? undefined;
    }

    static convertScale2Steps(scale) {
        const steps = scale.map((step) => {
            if (step === "W") {
                return 2;
            }
            return 1;
        });

        return steps;
    }

    static getScaleSteps(scaleType) {
        const scale = MusicalScales.getScaleInterval(scaleType);
        const steps = MusicalScales.convertScale2Steps(scale);
        return steps;
    }

    displayMajorScale() {
        return this.displaySteps(this.majorScaleSteps);
    }
}

function generateChromaticScale() {
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

    return chromaticScale;
}

const chromaticScale = generateChromaticScale();
chromaticScale.updateKey("C");
console.log(chromaticScale.displayMajorScale());
