import express from "express";
import { createServer } from "http";
import path from "path";
import fs from "fs";
import { config } from "./config.js";
import { httpsRedirect } from "./middleware/httpsRedirect.js";
import { accessAuth } from "./middleware/accessAuth.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { setupWsProxy } from "./services/wsProxy.js";
import authRoutes from "./routes/auth.js";
import searchRoutes from "./routes/search.js";
import downloadRoutes from "./routes/downloads.js";
import packageRoutes from "./routes/packages.js";
import installRoutes from "./routes/install.js";
import settingsRoutes from "./routes/settings.js";
import bagRoutes from "./routes/bag.js";
import sapAssetRoutes from "./routes/sapAssets.js";

const app = express();

// Middleware
app.use(httpsRedirect);
app.use(express.json({ limit: "50mb" }));

// API routes
app.use("/api", accessAuth);
app.use("/api", authRoutes);
app.use("/api", searchRoutes);
app.use("/api", downloadRoutes);
app.use("/api", packageRoutes);
app.use("/api", installRoutes);
app.use("/api", settingsRoutes);
app.use("/api", bagRoutes);
app.use("/api", sapAssetRoutes);

// Serve static frontend files.
//
// Vite writes hashed, content-addressed bundles under assets/, so those can be
// cached indefinitely. Everything else — index.html above all — must be
// revalidated on every navigation. A browser that reuses a previous build's
// HTML asks for chunk names the new build no longer ships, the dynamic import
// 404s, and the page goes blank until the cache expires.
const publicDir = path.resolve(import.meta.dirname, "../public");
app.use(
  express.static(publicDir, {
    setHeaders(res, filePath) {
      if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      } else {
        res.setHeader("Cache-Control", "no-cache, must-revalidate");
      }
    },
  }),
);

// SPA fallback: serve index.html for non-API routes
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api")) {
    return next();
  }
  const indexPath = path.join(publicDir, "index.html");
  if (fs.existsSync(indexPath)) {
    // `cacheControl: false` stops send() from overwriting the header below
    // with its own `public, max-age=0`.
    res.setHeader("Cache-Control", "no-cache, must-revalidate");
    res.sendFile(indexPath, { cacheControl: false });
  } else {
    next();
  }
});

// Error handler (must be last)
app.use(errorHandler);

// Create HTTP server
const server = createServer(app);

// WebSocket proxy for Apple TCP connections
setupWsProxy(server);

// Ensure data directory exists
fs.mkdirSync(config.dataDir, { recursive: true });

server.listen(config.port, () => {
  console.log(`Server listening on port ${config.port}`);
  console.log(`Data directory: ${path.resolve(config.dataDir)}`);
});

export { app, server };
