// The home page arrives from the design tool as a sheet of every design screen (home page, payment screen,
// chat, and so on), each in a fixed-size frame. Visitors should see only the home page, edge to edge.
// This adds styles to the page that hide the other screens and let the home page fill the window.
const fs = require('fs');
const path = require('path');
const file = path.join(process.argv[2] || 'public', 'index.html');
const mark = '.board iframe{display:block;border:0;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.12)}';
const extra = 'html{background:#0B1A13}body{padding:0;display:block}.board h2{display:none}.board:not(:first-of-type){display:none}.board iframe{width:100%!important;height:100vh!important;height:100dvh!important;box-shadow:none;background:#0B1A13}';
let html = fs.readFileSync(file, 'utf8');
if (html.indexOf(mark) < 0) { console.log('single.js: page layout not recognised, left as it is'); process.exit(0); }
fs.writeFileSync(file, html.split(mark).join(mark + extra));
console.log('single.js: home page only');
