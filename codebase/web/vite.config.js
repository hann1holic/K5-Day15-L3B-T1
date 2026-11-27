import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const certFile = fileURLToPath(new URL("../../certs/dev.crt", import.meta.url));
const keyFile = fileURLToPath(new URL("../../certs/dev.key", import.meta.url));

export default defineConfig({
  server: {
    host: "0.0.0.0",
    https: existsSync(certFile) && existsSync(keyFile)
      ? { cert: readFileSync(certFile), key: readFileSync(keyFile) }
      : undefined,
  },
});
