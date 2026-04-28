import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
  },
  resolve: {
    // 项目目录是 Junction，真实路径有空格会导致 Vite 编译失败
    preserveSymlinks: true,
  },
});
