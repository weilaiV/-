import { createApp } from "./app.mjs";
const port = Number(process.env.PORT || 3001);
const host = process.env.HOST || "127.0.0.1";
const app = createApp({
  databasePath: process.env.DATABASE_PATH || "./data/keran.sqlite",
  production: process.env.NODE_ENV === "production",
  publicOrigin: process.env.PUBLIC_ORIGIN,
  setupToken: process.env.SETUP_TOKEN,
});
app.server.listen(port, host, () =>
  console.log(`科然数智 API: http://${host}:${port}`),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    app.server.close(() => {
      app.close();
      process.exit(0);
    });
  });
