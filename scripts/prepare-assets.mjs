import { mkdir, readdir, copyFile, stat, rename, unlink } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = path.join(root, 'node_modules/@mediapipe/tasks-vision/wasm');
const destination = path.join(root, 'public/wasm');
await mkdir(destination, { recursive: true });
for (const name of await readdir(source)) {
  if (/\.(wasm|js)$/.test(name)) await copyFile(path.join(source, name), path.join(destination, name));
}
const model = path.join(root, 'public/models/hand_landmarker.task');
await mkdir(path.dirname(model), { recursive: true });
const exists = await stat(model).then(s => s.size === 7819105).catch(() => false);
if (!exists) {
  const temporary = model + '.download';
  try {
    execFileSync('curl', ['-fL', '--retry', '3', '--connect-timeout', '20', '--max-time', '180',
      'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task', '-o', temporary], { stdio: 'inherit' });
    if ((await stat(temporary)).size !== 7819105) throw new Error('手部识别模型大小校验失败');
    await rename(temporary, model);
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
}
console.log('手部模型与 MediaPipe WASM 已准备好（同源离线资源）。');
