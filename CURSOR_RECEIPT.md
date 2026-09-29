# CURSOR_RECEIPT

Wired Typing Kids to the shared MRJ sign-in. No second login. No GitHub push.

## Files changed

- `index.html` — shared door stylesheet and scripts load before `app.js`
- `app.js` — removed the student name box; lessons wait for `mrj-auth-ready`; scores use `event.detail.id` only and are not posted when that id is empty
- `app.css` — removed the unused name-box style
- `CURSOR_RECEIPT.md` — this file
