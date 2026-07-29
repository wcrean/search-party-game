# Search Party

A phone-first multiplayer search-prediction party game built with plain HTML, CSS, JavaScript, Firebase Authentication, and Cloud Firestore.

## Version 1 features

- Create a room with a five-character code
- Join from multiple smartphones
- Anonymous Firebase sign-in
- Real-time lobby and player list
- Multiple-choice rounds
- Host-controlled answer reveal
- Automatic scoring
- Live scoreboard
- Play-again flow
- Shareable room link
- Reconnect support through Firebase local persistence

## 1. Add your Firebase configuration

Open `firebase-config.js`.

In Firebase Console, go to:

**Project settings → General → Your apps → SDK setup and configuration**

Copy the values from your Firebase configuration object into `firebase-config.js`.

Do not remove this line:

```js
export const firebaseConfig = {
```

## 2. Enable Anonymous Authentication

In Firebase Console:

**Build → Authentication → Sign-in method → Anonymous → Enable → Save**

## 3. Create Firestore

In Firebase Console:

**Build → Firestore Database → Create database**

Choose a region close to your players.

## 4. Publish the included Firestore rules

Open the file `firestore.rules` in this repository.

Then in Firebase Console:

**Build → Firestore Database → Rules**

Replace the existing rules with the contents of `firestore.rules`, then click **Publish**.

These rules are suitable for this first prototype. They require signed-in anonymous users, reserve game controls for the host, and prevent players from changing their own scores.

## 5. Upload the files to GitHub

Upload all files to the root of your repository:

- `index.html`
- `styles.css`
- `app.js`
- `firebase-config.js`
- `questions.js`
- `firestore.rules`
- `README.md`

Suggested commit comment:

> Add first working Search Party multiplayer prototype

## 6. Enable GitHub Pages

In GitHub:

**Settings → Pages → Deploy from a branch → main → /(root) → Save**

After GitHub publishes the site, its URL should resemble:

`https://YOUR-GITHUB-USERNAME.github.io/search-party-game/`

## 7. Test on two phones

1. Open the GitHub Pages URL on Phone 1.
2. Tap **Create Game**.
3. Enter a nickname and create a room.
4. On Phone 2, open the same URL.
5. Tap **Join Game**.
6. Enter the room code and another nickname.
7. Confirm both players appear.
8. Start the game.
9. Answer on both phones.
10. Reveal the answer and confirm scores update.

For a realistic test, turn Wi-Fi off on both phones and use cellular data.

## Important question-bank note

The included 25 questions are starter content for testing the application. Their rankings are not represented as live or verified Google autocomplete results. Before sharing the game publicly, replace or verify each answer and update its `sourceNote`.

Questions live in `questions.js`.

## Scoring

Each correct multiple-choice answer is worth **3 points**.

## Troubleshooting

### The page says to add Firebase configuration

Edit `firebase-config.js` and paste the values from Firebase Console.

### Anonymous authentication error

Enable Anonymous sign-in under Firebase Authentication.

### “Firebase blocked this action”

Publish the included `firestore.rules`.

### The room does not update between phones

Check:

- Both phones have internet service
- Both use the published GitHub Pages URL, not a local file
- Firestore is enabled
- Anonymous authentication is enabled
- The Firestore rules were published

### A player refreshes or closes the browser

The app stores the room code and nickname locally. Firebase Authentication also uses local browser persistence, so the phone should return to the active room.

## Next planned version

- Freeform autocomplete guesses
- Similar-answer scoring
- Anonymous creativity voting
- Custom question packs
- Host-selectable categories
- Better room cleanup
- App Check and production hardening
