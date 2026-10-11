// Build step: the owner no longer gets a hidden copy of every email sent to a buyer (invoice, payment received,
// shipped, reminders). The owner's own notices (new order, new offer, messages, Discord) are separate and stay.
// To get the copies back for testing, set EMAIL_COPY_OWNER to "on" in the site's settings.
const fs = require('fs');
const f = 'api/_lib.js', s = fs.readFileSync(f, 'utf8');
const at = "if (owner && owner.toLowerCase() !== to.toLowerCase()) body.bcc = [owner];";
if (s.split(at).length !== 2) throw new Error('patchquiet: expected one match in ' + f);
fs.writeFileSync(f, s.replace(at, () => "if ((process.env.EMAIL_COPY_OWNER || '').trim().toLowerCase() === 'on' && owner && owner.toLowerCase() !== to.toLowerCase()) body.bcc = [owner];"));
