// Homunculus 2 — Settings v2 sections: General, Chat, Data, and the Pictures & Reading group of Appearance (D-082).
// Built from the approved canvas draft "Homunculus 2 — Settings & card reading" (11/03). CLAUDE, 2026-11-03.
import { useEffect, useRef, useState } from "react";
import { isDesktop } from "../db.ts";
import { setPrefs, usePrefs, type AppPrefs, type ReplySound } from "../prefs.ts";
import { playSound, SOUND_LABELS } from "../sounds.ts";
import { askSystemNotifications } from "../systemNotify.ts";
import { Button, Group, Row, Segmented, Switch } from "./kit.tsx";
import { MessageLookRows } from "./MessageLookSection.tsx";
import { useSendKey } from "./ux.tsx";

const set = (patch: Partial<AppPrefs>) => void setPrefs(patch);

function Range({ label, value, min, max, step, shown, onChange, disabled = false }: {
  label: string; value: number; min: number; max: number; step: number; shown: string; onChange: (v: number) => void; disabled?: boolean;
}) {
  return (
    <span className="settings-range">
      <input type="range" aria-label={label} min={min} max={max} step={step} value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} />
      <output>{shown}</output>
    </span>
  );
}

// ------------------------------------------------------------------ General
export function GeneralSection() {
  const p = usePrefs();
  const [sendKey, setSendKey] = useSendKey();
  const file = useRef<HTMLInputElement>(null);
  const [fileError, setFileError] = useState("");
  const [notifyNote, setNotifyNote] = useState("");
  const chooseFile = async (f: File | undefined) => {
    setFileError("");
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) { setFileError("That file is bigger than 2 MB. Pick a short sound."); return; }
    if (!/^audio\//.test(f.type) && !/\.(mp3|wav|ogg|m4a|flac)$/i.test(f.name)) { setFileError("That isn't a sound file (mp3, wav, ogg, m4a)."); return; }
    const url = await new Promise<string>((ok, fail) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => fail(r.error); r.readAsDataURL(f); });
    await setPrefs({ customSound: url, customSoundName: f.name, replySound: "custom" });
    playSound("custom", p.soundVolume, url);
  };
  const sounds: ReplySound[] = ["off", "chime", "soft-click", "bell", "drop", "arpeggio", "low-gong", "pop", ...(p.customSound ? ["custom" as const] : [])];
  return (
    <div className="settings-page" data-testid="settings-general-body">
      <Group icon="play" title="Starting and sending" help="What you see when the app opens, and how a message goes out.">
        <Row label="Open at" help="Where the app starts.">
          <select aria-label="Open at" value={p.openAt} onChange={(e) => set({ openAt: e.target.value as AppPrefs["openAt"] })}>
            <option value="last">Last chat</option><option value="stories">Stories</option><option value="characters">Characters</option><option value="card-browser">Card Browser</option>
          </select>
        </Row>
        <Row label="Send messages with" help="For the chat and the Assistant. The other key makes a new line.">
          <Segmented small label="Send Messages With" value={sendKey} onChange={setSendKey}
            options={[{ value: "enter", label: "Enter" }, { value: "ctrl-enter", label: "Ctrl+Enter" }]} />
        </Row>
      </Group>
      <Group icon="clock" title="When a reply is ready" help="Useful when you write in one chat while another one answers.">
        <Row label="Show “Reply ready”" help="A small notice with Open, when the chat that answered is not on screen.">
          <Switch label="Show Reply ready" checked={p.replyNotice} onChange={(replyNotice) => set({ replyNotice })} />
        </Row>
        <Row label="Sound" help="Plays when a reply finishes, in any chat.">
          <select aria-label="Reply sound" data-testid="reply-sound" value={p.replySound}
            onChange={(e) => { if (e.target.value === "+file") { file.current?.click(); return; } const replySound = e.target.value as ReplySound; set({ replySound }); playSound(replySound, p.soundVolume, p.customSound); }}>
            {sounds.map((x) => <option key={x} value={x}>{x === "off" ? "No sound" : x === "custom" ? `Your file: ${p.customSoundName || "sound"}` : SOUND_LABELS[x]}</option>)}
            <option value="+file">Choose a File…</option>
          </select>
          <input ref={file} type="file" accept="audio/*,.mp3,.wav,.ogg,.m4a" hidden aria-label="Sound file" onChange={(e) => { void chooseFile(e.target.files?.[0]); e.target.value = ""; }} />
        </Row>
        {fileError && <Row><span className="danger-text" role="alert">{fileError}</span></Row>}
        <Row label="Volume">
          <Range label="Sound volume" value={p.soundVolume} min={0} max={100} step={5} shown={`${p.soundVolume}%`} disabled={p.replySound === "off"} onChange={(soundVolume) => set({ soundVolume })} />
          <Button small variant="bordered" disabled={p.replySound === "off"} data-testid="sound-test" onClick={() => playSound(p.replySound, p.soundVolume, p.customSound)}>Test</Button>
        </Row>
        <Row label="Windows notification" help={notifyNote || "Only while the app is in the background, so you can do something else while it writes."}>
          <Switch label="Windows notification" checked={p.systemNotify} onChange={(systemNotify) => {
            if (!systemNotify) { set({ systemNotify }); return; }
            void askSystemNotifications().then((ok) => { set({ systemNotify: ok }); setNotifyNote(ok ? "" : "Windows didn't allow notifications for Homunculus. You can allow them in Windows Settings → Notifications."); });
          }} />
        </Row>
      </Group>
      <Group icon="eyeOff" title="Spoilers">
        <Row label="Spoiler-free cards" help="Character and story sheets hide the definition until you click Show. The chat is not affected.">
          <Switch label="Spoiler-free cards" checked={p.spoilerFree} onChange={(spoilerFree) => set({ spoilerFree })} />
        </Row>
      </Group>
    </div>
  );
}

// ------------------------------------------------------------------ Chat
export function ChatSection() {
  const p = usePrefs();
  return (
    <div className="settings-page" data-testid="settings-chat-body">
      <Group icon="info" title="Under each message" help="What a message shows besides its text.">
        <Row label="Date and time"><Switch label="Date and time" checked={p.showTime} onChange={(showTime) => set({ showTime })} /></Row>
        <Row label="Message number" help="Its place in the branch on screen."><Switch label="Message number" checked={p.showNumber} onChange={(showNumber) => set({ showNumber })} /></Row>
        <Row label="Token counts" help="Text and reasoning, separately. ~ means estimated."><Switch label="Token counts" checked={p.showTokens} onChange={(showTokens) => set({ showTokens })} /></Row>
        <Row label="Swipe arrows" help="‹ 2/3 › to move between versions of a reply."><Switch label="Swipe arrows" checked={p.swipeArrows} onChange={(swipeArrows) => set({ swipeArrows })} /></Row>
        <Row label="Swipe with the trackpad" help="Two fingers sideways on the last reply: left for the previous version, right for the next (or a new one)."><Switch label="Swipe with the trackpad" checked={p.gestures} onChange={(gestures) => set({ gestures })} /></Row>
      </Group>
      <Group icon="book" title="Reading">
        <Row label="Text width" help="How wide the lines of the chat may get.">
          <Segmented small label="Text width" value={p.chatWidth} onChange={(chatWidth) => set({ chatWidth })}
            options={[{ value: "narrow", label: "Narrow" }, { value: "medium", label: "Medium" }, { value: "wide", label: "Wide" }, { value: "full", label: "Full" }]} />
        </Row>
        <Row label="Model thinking" help="What a reasoning model thought before replying.">
          <Segmented small label="Model thinking" value={p.thinking} onChange={(thinking) => set({ thinking })}
            options={[{ value: "hidden", label: "Hidden" }, { value: "folded", label: "Folded" }, { value: "open", label: "Open" }]} />
        </Row>
      </Group>
      <Group icon="hourglass" title="While a reply arrives">
        <Row label="Smooth text" help="Words appear evenly instead of in bursts."><Switch label="Smooth text" checked={p.smoothText} onChange={(smoothText) => set({ smoothText })} /></Row>
        <Row label="Speed" help="Words per second, when Smooth text is on.">
          <Range label="Smooth text speed" value={p.smoothSpeed} min={10} max={150} step={5} shown={`${p.smoothSpeed} w/s`} disabled={!p.smoothText} onChange={(smoothSpeed) => set({ smoothSpeed })} />
        </Row>
        <Row label="Follow the reply" help="Scroll with it as it grows. Scrolling up stops following."><Switch label="Follow the reply" checked={p.followReply} onChange={(followReply) => set({ followReply })} /></Row>
        <Row label="Continue when cut off" help="If the model stops because it reached its length limit, ask it to go on, in the same message.">
          <Switch label="Continue when cut off" checked={p.autoContinue} onChange={(autoContinue) => set({ autoContinue })} />
        </Row>
        <Row label="At most" help="Times in a row, so it never loops.">
          <select aria-label="Continue at most" value={p.continueTimes} disabled={!p.autoContinue} onChange={(e) => set({ continueTimes: Number(e.target.value) })}>
            {[1, 2, 3, 5].map((n) => <option key={n} value={n}>{n} {n === 1 ? "time" : "times"}</option>)}
          </select>
        </Row>
      </Group>
      <Group icon="file" title="Formatting" help="How the text of messages is drawn. Nothing here changes what is saved or what the AI is sent.">
        <MessageLookRows />
      </Group>
    </div>
  );
}

// ------------------------------------------------------------------ Appearance: pictures and reading
export function PicturesAndReadingGroup() {
  const p = usePrefs();
  return (
    <Group icon="figure" title="Pictures and reading" help="The chat's text and the pictures beside it.">
      <Row label="Line spacing" help="Space between the lines of the story text.">
        <Range label="Line spacing" value={p.lineSpacing} min={1.2} max={2.2} step={0.04} shown={p.lineSpacing.toFixed(2)} onChange={(lineSpacing) => set({ lineSpacing })} />
      </Row>
      <Row label="Avatars in the chat" help="A picture of who is speaking, beside each message.">
        <Segmented small label="Avatars in the chat" value={p.avatarShape} onChange={(avatarShape) => set({ avatarShape })}
          options={[{ value: "hidden", label: "Hidden" }, { value: "round", label: "Round" }, { value: "square", label: "Square" }]} />
      </Row>
      <Row label="Avatar size">
        <Segmented small label="Avatar size" value={p.avatarSize} onChange={(avatarSize) => set({ avatarSize })}
          options={[{ value: "small", label: "Small" }, { value: "medium", label: "Medium" }, { value: "large", label: "Large" }]} />
      </Row>
      <Row label="Card size in collections" help="Characters, Stories, Card Browser: the size they open with. Each page can still change it.">
        <Segmented small label="Card size in collections" value={p.cardSize} onChange={(cardSize) => set({ cardSize })}
          options={[{ value: "s", label: "S" }, { value: "m", label: "M" }, { value: "l", label: "L" }]} />
      </Row>
    </Group>
  );
}

// ------------------------------------------------------------------ Data
interface Place { dir: string; portable: boolean }
interface BackupsInfo { dir: string; count: number; last: number | null }
const when = (secs: number | null) => (secs ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(secs * 1000)) : "never");

export function DataSection({ notify, trashCount }: { notify: (title: string, lines?: string[]) => void; trashCount: number }) {
  const p = usePrefs();
  const [place, setPlace] = useState<Place | null>(null);
  const [backups, setBackups] = useState<BackupsInfo | null>(null);
  const [busy, setBusy] = useState<"" | "backup" | "export">("");
  const refresh = async () => {
    if (!isDesktop) return;
    const { invoke } = await import("@tauri-apps/api/core");
    setPlace(await invoke<Place>("data_location"));
    setBackups(await invoke<BackupsInfo>("backups_info"));
  };
  useEffect(() => { void refresh().catch(() => {}); }, []);
  const open = async (path: string) => {
    const { revealItemInDir } = await import("@tauri-apps/plugin-opener");
    await revealItemInDir(path).catch((e) => notify("Couldn't open the folder", [String(e)]));
  };
  const backupNow = async () => {
    setBusy("backup");
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const path = await invoke<string | null>("backup_database");
      await invoke("prune_backups", { keep: p.keepBackups });
      notify("Backed up", path ? [path] : ["There is nothing to back up yet."]);
      await refresh();
    } catch (e) { notify("Couldn't back up", [e instanceof Error ? e.message : String(e)]); }
    finally { setBusy(""); }
  };
  const exportAll = async () => {
    setBusy("export");
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      notify("Exported everything", [await invoke<string>("export_database")]);
    } catch (e) { notify("Couldn't export", [e instanceof Error ? e.message : String(e)]); }
    finally { setBusy(""); }
  };
  const desktopOnly = "In the desktop app.";
  return (
    <div className="settings-page" data-testid="settings-data-body">
      <Group icon="folder" title="Where your things are" help={place?.portable ? "Everything lives in one folder next to the app (portable): copy the folder and you have it all." : "Everything lives in the app's data folder on this PC."}>
        <Row label="Data folder" help={place?.dir ?? desktopOnly}>
          <Button small variant="bordered" disabled={!place} onClick={() => place && void open(place.dir)}>Open Folder</Button>
        </Row>
        <Row label="Back up now" help={backups ? `A copy of the whole database in the backups folder. Last backup: ${when(backups.last)} · ${backups.count} kept.` : `A copy of the whole database. ${desktopOnly}`}>
          <Button small variant="bordered" disabled={!isDesktop || busy !== ""} data-testid="backup-now" onClick={() => void backupNow()}>{busy === "backup" ? "Backing Up…" : "Back Up Now"}</Button>
        </Row>
      </Group>
      <Group icon="clock" title="Automatic backups" help="Made when the app opens, if the last backup is older than you choose here.">
        <Row label="Back up">
          <Segmented small label="Automatic backups" value={p.autoBackup} onChange={(autoBackup) => set({ autoBackup })}
            options={[{ value: "off", label: "Off" }, { value: "daily", label: "Daily" }, { value: "weekly", label: "Weekly" }]} />
        </Row>
        <Row label="Keep" help="The oldest backups go first.">
          <select aria-label="Backups to keep" value={p.keepBackups} onChange={(e) => set({ keepBackups: Number(e.target.value) })}>
            {[3, 5, 10, 20].map((n) => <option key={n} value={n}>{n} backups</option>)}
          </select>
        </Row>
      </Group>
      <Group icon="trash" title="Trash and export">
        <Row label="Empty the Trash" help={`Items older than this leave for good when the app opens. Something still in use stays. In the Trash now: ${trashCount}.`}>
          <select aria-label="Empty the Trash" data-testid="empty-trash-days" value={p.emptyTrashDays} onChange={(e) => set({ emptyTrashDays: Number(e.target.value) })}>
            <option value={0}>Never</option><option value={7}>After 7 days</option><option value={30}>After 30 days</option><option value={90}>After 90 days</option>
          </select>
        </Row>
        <Row label="Export everything" help="One file with all of it: characters, stories, chats, lorebooks, presets, agents and settings (the database), saved in Downloads. API keys are not in it.">
          <Button small variant="bordered" disabled={!isDesktop || busy !== ""} onClick={() => void exportAll()}>{busy === "export" ? "Exporting…" : "Export…"}</Button>
        </Row>
        <Row label="Import a SillyTavern folder" help="Comes with its own part of the plan, at the end.">
          <Button small variant="bordered" disabled>Later</Button>
        </Row>
      </Group>
    </div>
  );
}
