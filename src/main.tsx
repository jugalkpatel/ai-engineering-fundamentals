import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import DiagramViewer from "./components/DiagramViewer";
import "./index.css";

// Standalone viewer mode for human scoring during evals. Selected at the
// root so we don't open an agent connection or run any chat hooks when in
// viewer mode. Reachable via /#viewer or the corner button in the main app.
const Root = window.location.hash === "#viewer" ? DiagramViewer : App;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
