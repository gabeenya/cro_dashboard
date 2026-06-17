// 빌드 스크립트: 원본 파일을 "압축·난독화"하여 dist/ 폴더에 모은다.
// - 파일 이름(app.js, style.css 등)은 그대로 유지 → 서비스워커/매니페스트/HTML 연결이 깨지지 않음
// - app.js 의 전역 함수 이름은 보존 → index.html 의 onclick="함수()" 가 정상 작동
// 실행: npm run build

import { build } from 'esbuild';
import { minify as minifyHtml } from 'html-minifier-terser';
import { readFile, writeFile, mkdir, copyFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const OUT = 'dist';

// 1) dist 폴더 비우고 새로 만들기
await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

// 2) app.js 압축 (강한 압축)
//    minify:true → 공백 제거 + 문법 단순화 + 지역 변수 이름 뭉개기(a,b,c…)
//    전역 함수 이름(setDiv 등)은 외부(HTML onclick)에서 부르므로 esbuild가 그대로 보존함
await build({
  entryPoints: ['app.js'],
  outfile: `${OUT}/app.js`,
  bundle: false,
  minify: true,
  legalComments: 'none',
  charset: 'utf8',
});

// 3) style.css 압축
await build({
  entryPoints: ['style.css'],
  outfile: `${OUT}/style.css`,
  bundle: false,
  minify: true,
  charset: 'utf8',
});

// 4) HTML 압축 (내부 인라인 CSS/JS 포함). 전역 함수 보존을 위해 toplevel 망글 금지.
const htmlOpts = {
  collapseWhitespace: true,
  conservativeCollapse: true,
  removeComments: true,
  minifyCSS: true,
  minifyJS: { mangle: { toplevel: false } },
  keepClosingSlash: true,
  caseSensitive: true,
};
for (const f of ['index.html', 'login.html']) {
  const html = await readFile(f, 'utf8');
  const out = await minifyHtml(html, htmlOpts);
  await writeFile(`${OUT}/${f}`, out, 'utf8');
}

// 5) 그대로 복사할 정적 파일
for (const f of ['sw.js', 'manifest.json', 'favicon.svg']) {
  if (existsSync(f)) await copyFile(f, `${OUT}/${f}`);
}

console.log('빌드 완료 → dist/ 폴더에 압축본 생성됨');
