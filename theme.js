// Gives every page except the home page, and the emails, the shop's name and colors. Runs after build.js on each deploy.
// The pages and site.css in public/, and the email templates in api/_lib.js, are still written with the original
// name ("Collectors Page") and the original navy palette; this swaps both in the built copy, so the name and
// palette live in one place. To rename the shop or change a color, edit NAME or COLORS here.
// The home page (index.html) comes from the design and carries its own colors.
const fs = require('fs'), path = require('path');
const dir = process.argv[2] || 'public';
const NAME = { from: 'Collectors Page', to: 'JarFriends' };
const COLORS = {
  '#101726': '#0B1A13', // page background; in emails the header band, buttons and text
  '#172033': '#11261C', // cards
  '#2C3856': '#244536', // hairlines
  '#5A6788': '#4E7A63', // field and pill borders
  '#AEB5C8': '#A8BFB1', // quiet text
  '#DADDE8': '#D6E2DA', // secondary text
  '#5B6478': '#56695E'  // quiet text in emails
};
function paint(folder, keep) {
  let n = 0;
  for (const f of fs.readdirSync(folder)) {
    if (!keep(f)) continue;
    const p = path.join(folder, f);
    let s = fs.readFileSync(p, 'utf8');
    for (const k of Object.keys(COLORS)) s = s.replace(new RegExp(k, 'gi'), COLORS[k]);
    s = s.split(NAME.from).join(NAME.to);
    fs.writeFileSync(p, s);
    n++;
  }
  return n;
}
const pages = paint(dir, (f) => /\.(html|css)$/.test(f) && f !== 'index.html');
const code = fs.existsSync('api') ? paint('api', (f) => /\.js$/.test(f)) : 0;
console.log('Themed ' + pages + ' pages and ' + code + ' code files as ' + NAME.to + '.');
