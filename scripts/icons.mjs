import sharp from 'sharp'
import fs from 'node:fs'
const svg = fs.readFileSync('public/favicon.svg')
const out = [['icon-192.png',192],['icon-512.png',512],['apple-touch-icon.png',180]]
for (const [n,s] of out) await sharp(svg).resize(s,s).png().toFile('public/'+n)
// maskable: fons ple amb marge de seguretat
const mask = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#2f5d46"/><g transform="translate(64 64) scale(.75)">${fs.readFileSync('public/favicon.svg','utf8').replace(/<\/?svg[^>]*>/g,'').replace(/<rect width="512"[^>]*\/>/,'')}</g></svg>`
await sharp(Buffer.from(mask)).resize(512,512).png().toFile('public/icon-maskable-512.png')
console.log('icones generades')
