# Releasing Homunculus (and sending versions to the tester)

For Daniel. Author: CLAUDE, 2026-10-29 (D-037, D-038). Repository: <https://github.com/VasahTS/Project-Homunculus>.
Step 1 is **once only**; after that, every new version is step 2.

## Branches

- **`dev`** — daily work. Claude and CODEX work here; every Push runs the tests.
- **`main`** — what the tester gets. It only receives `dev` when it is good to ship.

## Step 1 — Link the folder and set up the updater (once)

1. Double-click **`Set up updater.bat`**. It:
   - links this folder to GitHub, on the `dev` branch (your files stay where they are);
   - creates the key that signs the versions and opens the GitHub page to store it.
2. On the page that opened (**New secret**):
   - **Name:** `TAURI_SIGNING_PRIVATE_KEY`
   - **Secret:** Ctrl+V (the black window already copied it)
   - **Add secret**
3. **Keep a copy** of the folder `C:\Users\danie\.homunculus` (USB stick or cloud). It holds the secret key. If it is lost, people who already installed the app stop getting automatic updates.
4. In **GitHub Desktop**: **File → Add local repository…** → the project folder → **Add repository**.
   Summary: **Set up the updater** → **Commit to dev** → **Push origin**.

## Step 2 — Publish a version (every time)

1. (Optional) In `CHANGELOG.md`, a `## 0.2.0` section with what changed — it is the text of the in-app "What's New". Claude can write it.
2. Bring `dev` into `main`, in GitHub Desktop:
   **Current branch → main** → **Branch → Merge into current branch… → dev → Merge** → **Push origin** → switch back to **dev**.
3. On the website: [Actions → Publish release](https://github.com/VasahTS/Project-Homunculus/actions/workflows/release.yml) → **Run workflow** → *Use workflow from:* **main** → type the version (`0.1.0` the first time, then `0.1.1`, `0.2.0`…) → **Run workflow**.
4. Wait for the green ✓ (the first time takes about 25 minutes; after that, about 10–15). It runs the tests, builds the Windows installer and the Linux `.deb` and AppImage at the same time, signs them, publishes them in [Releases](https://github.com/VasahTS/Project-Homunculus/releases) and brings the version number to `dev`.
5. In GitHub Desktop (on `dev`): **Fetch origin → Pull origin**.

Whoever has the app installed sees the bar **"Homunculus 0.2.0 is ready"** the next time they open it (or within 6 hours, if it is open). On a Linux `.deb` the bar says **"is out"** and **Download** opens the release page.

### Which number to use

- Fixes only: the last number (`0.1.0` → `0.1.1`).
- Something new: the middle one (`0.1.1` → `0.2.0`).
- Never repeat or go back to a number — the workflow refuses.

## What each release contains

| File | For | Updates |
|---|---|---|
| `Homunculus_X_x64-setup.exe` | Windows | by itself, from the app |
| `Homunculus_X_amd64.AppImage` | any Linux (Debian, Ubuntu…) — make it executable and run it | by itself, from the app |
| `Homunculus_X_amd64.deb` | Debian / Ubuntu (`sudo apt install ./Homunculus_X_amd64.deb`) | the app opens the download page; install the new `.deb` over the old one |
| `latest.json` + `.sig` files | the in-app updater | — |

## Step 3 — Send it to the tester

Send the link to the [tester's guide](https://github.com/VasahTS/Project-Homunculus/blob/main/docs/TESTING.md). It explains how to install, update and report problems (through [Issues](https://github.com/VasahTS/Project-Homunculus/issues)).

## If something goes wrong

- **Red ✗ in Actions:** click it and then the red step. Homunculus' messages start with ✖ and say what to do. If it is not clear, send the screenshot to Claude.
- **"The secret TAURI_SIGNING_PRIVATE_KEY is missing":** redo step 1, item 2.
- **"The public key is missing from tauri.conf.json":** `main` does not have the "Set up the updater" commit yet — do step 2, item 2.
- **"Pick the main branch":** in Run workflow, *Use workflow from* must be **main**.
- **The tests failed:** nothing was published; the tester sees nothing. Ask Claude to look.
- **GitHub Desktop asks for a Pull before the Push:** **Pull origin**, then **Push origin**.

## Everything else stays the same

- `Open Homunculus.bat` (running from the code) and your portable play version do not change and do not look for updates.
- `Build installer.bat` still works for a local Windows installer, without the updater files.
