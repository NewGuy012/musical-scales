import { React, useState } from "react";
import Product from "./Product.tsx";
import generateChromaticScale from "../classes/ChromaticScale.js";

export default function StoreFront() {
    const [products, setProducts] = useState([]);
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [validation, setValidation] = useState("");

    function handleOnSubmit(event) {
        event.preventDefault();

        if (!name) {
            setValidation("Please enter a key");
            return;
        }

        const chromaticScale = generateChromaticScale();
        chromaticScale.updateKey(name);

        const validNotes = chromaticScale.display();

        if (!validNotes.includes(name)) {
            setValidation("Please enter a valid key");
            return;
        }

        const id = products.length + 1;
        const product = {
            id: id,
            name: name,
            description: description,
            majorScale: chromaticScale.majorScale,
            majorChord: chromaticScale.majorChord,
        };

        setProducts([...products, product]);
        setName("");
        setDescription("");
        setValidation("");
    }

    function handleDelete(id) {
        setProducts(products.filter((product) => product.id !== id));
    }

    return (
        <>
            <form onSubmit={handleOnSubmit}>
                <div>
                    <label htmlFor="enter-name">Key</label>
                    <input
                        id="enter-name"
                        type="text"
                        placeholder="Enter the key"
                        className="textfield"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                    />
                </div>
                <div>
                    <label htmlFor="enter-description">Description</label>
                    <input
                        id="enter-description"
                        type="text"
                        placeholder="Enter the description"
                        className="textfield"
                        value={description}
                        onChange={(event) => setDescription(event.target.value)}
                    />
                </div>
                <div className="form-footer">
                    <div className="validation-message">{validation}</div>
                    <input
                        type="submit"
                        className="btn btn-primary"
                        value="Generate"
                    />
                </div>
            </form>
            <div>{products.length === 0 && <p>Add your first scale</p>}</div>
            <ul className="store-front">
                {products.map((product, index) => (
                    <li key={product.id}>
                        <Product details={product} />
                        <button
                            className="btn-outline btn-delete"
                            onClick={() => handleDelete(product.id)}
                        >
                            Delete
                        </button>
                    </li>
                ))}
            </ul>
        </>
    );
}
