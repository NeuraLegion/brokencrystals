import { mkdirSync, copyFileSync } from 'fs';
import { dirname, resolve } from 'path';

const source = resolve('deploy/nginx.conf');
const destination = resolve('dist/nginx.conf');

mkdirSync(dirname(destination), { recursive: true });
copyFileSync(source, destination);
