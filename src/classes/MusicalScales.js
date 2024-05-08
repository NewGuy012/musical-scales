import CircularDoublyLinkedList from "./CircularDoublyLinkedList.js";

export default class MusicalScales extends CircularDoublyLinkedList {
    constructor(key = "C") {
        super();
        this.key = key;
        this.majorScaleSteps = MusicalScales.getScaleSteps("major");
        this.minorScaleSteps = MusicalScales.getScaleSteps("minor");
        this.majorScale = undefined;
        this.minorScale = undefined;

        this.majorChordIntervals = MusicalScales.getChordIntervals("major");
        this.minorChordIntervals = MusicalScales.getChordIntervals("minor");
        this.majorChord = undefined;
        this.minorChord = undefined;
    }

    static getScaleInterval(scaleType) {
        const scaleInterval = {
            major: ["W", "W", "H", "W", "W", "W", "H"],
            minor: ["W", "H", "W", "W", "H", "W", "W"],
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

    static getChordIntervals(scaleType) {
        const scaleInterval = {
            major: [1, 3, 5],
            minor: [1, 3, 5],
        };

        return scaleInterval[scaleType] ?? undefined;
    }

    updateKey(keyNew) {
        let temp = this.start;

        while (temp.value != keyNew && temp.next != this.start) {
            temp = temp.next;
        }

        this.start = temp;
        this.current = this.start;
        this.key = keyNew;

        this.generateScales();
        this.generateChords();
    }

    generateScales() {
        this.majorScale = this.displaySteps(this.majorScaleSteps);
        this.minorScale = this.displaySteps(this.minorScaleSteps);
    }

    generateChords() {
        this.majorChord = this.majorChordIntervals.map((index) => {
            return this.majorScale[index - 1];
        });

        this.minorChord = this.minorChordIntervals.map((index) => {
            return this.minorScale[index - 1];
        });
    }
}
