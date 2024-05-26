import CircularDoublyLinkedList from "./CircularDoublyLinkedList.js";

export default class MusicalScales extends CircularDoublyLinkedList {
    constructor(key = "C") {
        super();
        this.key = key;
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
        const scaleIntervals = {
            major: ["W", "W", "H", "W", "W", "W", "H"],
            minor: ["W", "H", "W", "W", "H", "W", "W"],
            fifths: ["WWH", "WWH", "WWH", "WWH", "WWH", "WWH"],
            fourths: ["WW", "WW", "WW", "WW", "WW", "WW"],
        };

        const scaleInterval = scaleIntervals[scaleType] ?? undefined;

        const scaleSteps = scaleInterval.map((scaleStep) => {
            switch (scaleStep) {
                case "W":
                    return 2;
                case "H":
                    return 1;
                case "WWH":
                    return 5;
                case "WW":
                    return 4;
            }
        });

        return scaleSteps;
    }

    static getChordIntervals(chordType) {
        const chordIntervals = {
            major: [1, 3, 5],
            minor: [1, 3, 5],
            seventh: [1, 3, 5, 7],
            // minor_seventh: [1, 3, 5, b7],
            major_seventh: [1, 3, 5, 7],
            // augmented: [1, 3, "#5"],
            // diminished: [1, b3, b5],
            // diminished_seventh: [1, b3, b5, bb7],
            sus_fourth: [1, 4, 5],
            sus_second: [1, 2, 5],
        };

        return chordIntervals[chordType] ?? undefined;
    }

    static generateScale(Scale, scaleIntervals) {
        const output = Scale.displaySteps(scaleIntervals);
        return output;
    }

    static generateChord(scale, chordIntervals) {
        const A = [];

        chordIntervals.forEach((interval) => {
            const note = scale[interval - 1];
            A.push(note);
        });

        return A;
    }
}
