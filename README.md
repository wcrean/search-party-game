# Search Party v1.2.1

This version is designed to run directly on GitHub Pages without npm, Vite, Webpack, or any other build tool.

## What changed in v1.1

- Replaced package-style Firebase imports with full browser-safe HTTPS imports
- Pinned the Firebase browser SDK to version 11.10.0
- Simplified Firestore initialization
- Added a visible startup diagnostic message
- Added clearer browser console errors
- Kept the same multiplayer lobby, question, scoring, and scoreboard flow

## Replace the older files

Upload these files to the root of your GitHub repository and replace the existing copies:

- `index.html`
- `styles.css`
- `app.js`
- `firebase-config.js`
- `questions.js`
- `firestore.rules`
- `README.md`

Suggested commit comment:

> Fix Firebase browser imports and add startup diagnostics

## Add your Firebase configuration

Open `firebase-config.js`.

In Firebase Console, go to:

**Project settings → General → Your apps → SDK setup and configuration**

Paste your actual values into the existing object.

The file must begin with:

```js
export const firebaseConfig = {
```

Do not use imports such as:

```js
import { initializeApp } from "firebase/app";
```

Those package imports require a build system and will not work directly on GitHub Pages.

## Enable Anonymous Authentication

In Firebase Console:

**Build → Authentication → Sign-in method → Anonymous → Enable → Save**

## Publish Firestore rules

In Firebase Console:

**Build → Firestore Database → Rules**

Replace the rules shown there with the complete contents of `firestore.rules`, then click **Publish**.

## Enable GitHub Pages

In GitHub:

**Settings → Pages → Deploy from a branch → main → /(root) → Save**

## After uploading

GitHub Pages may briefly show the previous version.

Use one of these methods:

- Wait until the latest deployment shows a green check mark under **Actions**
- Open the site in a private/incognito tab
- Add `?v=11` to the end of the URL once to bypass an old cached copy

## Confirm the fix

Open the published site on a computer and press:

**F12 → Console**

You should no longer see:

```text
Failed to resolve module specifier "firebase/app"
```

The browser should instead load Firebase from URLs beginning with:

```text
https://www.gstatic.com/firebasejs/
```

## Test on two phones

1. Open the GitHub Pages site on Phone 1.
2. Create a game.
3. Open the same site on Phone 2.
4. Join with the room code.
5. Confirm both names appear.
6. Start the game.
7. Answer on both phones.
8. Reveal the answer.
9. Confirm the scoreboard updates.

## Question-bank note

The included questions remain starter content for application testing. Their answer rankings should be verified before the game is presented as using current Google search data.


## v1.2 startup fix

Version 1.2 fixes an authentication-startup bug in v1.1. Authentication is now completed directly inside the main startup `try/catch`, so an authentication error will display on screen instead of leaving the spinner running indefinitely.

For an existing v1.1 deployment, replacing only `app.js` is sufficient. Keep your current `firebase-config.js`, because it contains your real Firebase values.

Suggested commit comment:

> Fix Firebase authentication startup hang


## v1.2.1 packaging update

This package contains the complete current file set, including a corrected
`firebase-config.js` template with no npm-style imports.

For future releases and patches, use the complete ZIP as the source of truth.
After downloading, copy your real Firebase values into `firebase-config.js`
before deploying.

Suggested commit comment:

> Package complete Search Party v1.2.1 release files
