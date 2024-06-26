import React from "react";
import { createRoot } from "react-dom/client";
import App from "./components/App.tsx";
import "./index.css";

createRoot(document.querySelector("#root")).render(<App />);
