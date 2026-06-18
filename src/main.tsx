import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import DiagramViewer from "./components/DiagramViewer";
import "./index.css";

// Tiny hash router. Picks App or DiagramViewer based on the URL hash and
// re-renders when the hash changes so the corner button toggles the viewer
// without a full page reload.
function Root() {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return hash === "#viewer" ? <DiagramViewer /> : <App />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
