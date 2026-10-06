import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Compatibilité avec la configuration héritée de Create React App :
  // on garde les variables REACT_APP_* déjà déclarées sur Vercel
  // et le dossier de sortie « build ».
  envPrefix: ["VITE_", "REACT_APP_"],
  build: { outDir: "build" },
  server: { port: 3000 },
  test: { include: ["src/**/*.test.js"] },
});
