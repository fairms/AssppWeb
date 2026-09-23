import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import ErrorBoundary from "./components/common/ErrorBoundary";
import { installPreloadErrorRecovery } from "./utils/recovery";
import "./index.css";

import "./i18n";

// Registered before the first render so a lazily imported route chunk that
// fails to load (a stale document after a deploy) recovers itself instead of
// leaving an empty page.
installPreloadErrorRecovery();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
);
