# Tester's guide — Homunculus 2

Thank you for testing! Here is everything you need. It takes 5 minutes.

## 1. Install

Open the page of the [latest version](https://github.com/VasahTS/Project-Homunculus/releases/latest) and, under *Assets*, download the file for your system:

- **Windows:** **`Homunculus_…_x64-setup.exe`**. Open it. Windows may show **"Windows protected your PC"** — that is because the app does not have a paid Microsoft signature yet. Click **More info → Run anyway**. Homunculus is then in the Start menu.
- **Linux (Debian, Ubuntu…), recommended:** **`Homunculus_…_amd64.AppImage`**. Make it executable (right-click → Properties → "Allow executing", or `chmod +x Homunculus_*.AppImage`) and open it. It updates itself.
- **Linux, installed by the system:** **`Homunculus_…_amd64.deb`** → `sudo apt install ./Homunculus_…_amd64.deb`. New versions are installed the same way (the app tells you and opens the download page).

## 2. Get started

1. **Settings → Connections**: pick the service (OpenRouter, OpenAI or a local server), paste your key and pick the model. **Test Connection** checks that everything is right.
   The key is kept by the system's keychain (Windows Credential Manager; on Linux, GNOME Keyring or KWallet), not in a file.
2. **Characters**: import a SillyTavern card (PNG or JSON) or create a character, and click **+ New Chat**.

## 3. Updates

When a new version is out, a quiet bar shows at the top of the app: **"Homunculus 0.2.0 is ready"**.

- **What's New** shows what changed.
- **Update & Restart** downloads, installs and reopens the app by itself (it takes less than a minute).
- **Later** hides the bar until the next time you open the app.
- On a Linux `.deb` the button is **Download**: it opens the page with the new `.deb`; install it over the old one.

Your chats, characters and keys are **not touched** by an update. In **Settings → About** you can see your version and look for updates right away.

## 4. Found a problem? Have an idea?

Open an [issue](https://github.com/VasahTS/Project-Homunculus/issues/new/choose) and pick **Bug** or **Idea**. The form asks what matters.
What helps the most:

- the **version** (Settings → About) and your **system** (Windows / Linux);
- **what you did**, step by step, and what you expected to happen;
- a **screenshot** (Windows: Win + Shift + S, then Ctrl + V inside the issue).

You do not need to know anything about programming. One sentence and a screenshot are already worth a lot.

> ⚠️ **Never paste your API key** in an issue or in a screenshot. Issues are public.
