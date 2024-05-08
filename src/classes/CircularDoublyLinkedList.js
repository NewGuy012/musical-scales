class Node {
    constructor(value) {
        this.value = value;
        this.next = null;
        this.prev = null;
    }
}

export default class CircularDoublyLinkedList {
    constructor() {
        this.start = null;
        this.current = null;
        this.head = null;
        this.tail = null;
        this.length = 0;
    }

    insert(value) {
        if (this.length === 0) {
            const node = new Node(value);

            node.next = node;
            node.prev = node;

            this.head = node;
            this.tail = node;
            this.length++;

            this.start = node;
            this.current = this.start;
        } else {
            const node = new Node(value);

            node.prev = this.tail;
            node.next = this.head;

            this.head.prev = node;
            this.tail.next = node;
            this.tail = node;
            this.length++;
        }
    }

    display() {
        const A = [];

        let temp = this.start;

        while (temp.next != this.start) {
            console.log(temp.value);
            A.push(temp.value);

            temp = temp.next;
        }
        console.log(temp.value);
        A.push(temp.value);

        return A;
    }

    displayStep() {
        const A = [];

        // console.log(this.current.value);
        A.push(this.current.value);

        this.current = this.current.next;

        return A;
    }

    displaySteps(steps) {
        const A = [];

        // console.log(this.current.value);
        A.push(this.current.value);

        steps.forEach((step) => {
            for (let ii = 0; ii < step; ii++) {
                this.current = this.current.next;
            }

            // console.log(this.current.value);
            A.push(this.current.value);
        });

        return A;
    }
}
