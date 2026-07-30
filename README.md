# Search Party 2.0

Search Party 2.0 is a clean rebuild designed to run directly on GitHub Pages.

## Complete release files

- `index.html`
- `styles.css`
- `app.js`
- `firebase-service.js`
- `firebase-config.js`
- `questions.js`
- `firestore.rules`
- `README.md`

Your actual Firebase web configuration is already included in `firebase-config.js`.

## What changed

- Clean modular architecture
- Browser-native Firebase CDN imports
- No npm, Vite, Webpack, or build step
- Direct anonymous authentication during startup
- Visible startup error screen
- Create and join rooms
- Live player list
- Multiple-choice rounds
- Answer tracking
- Host-controlled reveal
- Automatic scoring
- Final scoreboard
- Shareable room URL
- Complete current file set

## Deploy

Replace all files in the root of the GitHub repository with the contents of this ZIP.

The repository root should directly show:

```text
index.html
styles.css
app.js
firebase-service.js
firebase-config.js
questions.js
firestore.rules
README.md
```

Suggested commit comment:

> Rebuild Search Party with clean Firebase 2.0 architecture

## Firebase Authentication

In Firebase Console:

**Build → Authentication → Sign-in method → Anonymous → Enabled**

## Firestore rules

In Firebase Console:

**Build → Firestore Database → Rules**

Replace the editor contents with `firestore.rules`, then click **Publish**.

## GitHub Pages

In GitHub:

**Settings → Pages → Deploy from a branch → main → /(root) → Save**

After the deployment finishes, hard-refresh with **Ctrl+Shift+R** or open the site in an incognito window.

## Test

1. Open the site on Phone 1 and create a room.
2. Open the site on Phone 2 and join using the room code.
3. Confirm both players appear.
4. Start the game.
5. Submit answers from both phones.
6. Reveal the result.
7. Confirm the scores update.
8. Complete the rounds and view final results.

## Question data

The included question rankings are placeholder content for testing the game mechanics. They should be researched and verified before presenting them as current Google search rankings.
