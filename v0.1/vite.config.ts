import { defineConfig } from 'vite';

// 多页面构建配置：每个 html 是一个独立页面入口，构建结果都在 dist 下平级输出。
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        index: 'index.html',
        review: 'review.html',
        editor: 'editor.html',
      },
    },
  },
});
