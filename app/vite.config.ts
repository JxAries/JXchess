import { defineConfig } from 'vite';

// 多页面构建配置：每个 html 是一个独立页面入口，构建结果都在 dist 下平级输出。
export default defineConfig({
  base: './',
  // 一些编辑器/工具在保存文件时会先写进 `.名字.<pid>.<uuid>.tmpdir/` 再原子重命名。
  // Vite 的依赖扫描与 PostCSS 配置搜索会把这些目录当成真实文件读，
  // 读到半截内容就报错（曾导致整张 style.css 变成 HTTP 500、界面完全裸奔）。
  // 这里把这类临时目录排除掉，属于防御性设置，正常开发不受影响。
  server: {
    watch: {
      ignored: ['**/.*.tmpdir/**', '**/.*.tmpdir', '**/.~tmp*/**'],
    },
  },
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
