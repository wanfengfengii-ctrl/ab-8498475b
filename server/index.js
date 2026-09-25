import { createApp } from './app.mjs';

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '0.0.0.0';

const app = createApp();
const server = app.listen(PORT, HOST, () => {
  console.log(`[fixture-planner]  listening on http://${HOST}:${PORT}`);
});

// Graceful shutdown (important for the one-shot verify container).
function shutdown(signal) {
  console.log(`[fixture-planner] ${signal} received, closing...`);
  server.close(() => process.exit(0));
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export { app, server };
