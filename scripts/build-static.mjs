#!/usr/bin/env node
import { cp, mkdir, rm } from 'node:fs/promises';

const dist = new URL('../dist/', import.meta.url);
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(new URL('../index.html', import.meta.url), new URL('./index.html', dist));
await cp(new URL('../src/', import.meta.url), new URL('./src/', dist), { recursive: true });
await cp(new URL('../public/', import.meta.url), dist, { recursive: true });
console.log('Static site built to dist/');
