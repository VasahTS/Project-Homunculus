// Homunculus 2 — Tauri build script. Author: CLAUDE, 2026-10-23.
fn main() {
    // The window/exe icon is baked into the program here. Cargo did not notice a new icon on its own and kept
    // the old one (D-093), so tell it to redo this step whenever a file in icons/ changes.
    for icon in ["icon.ico", "icon.png", "icon.icns", "32x32.png", "128x128.png", "128x128@2x.png"] {
        println!("cargo:rerun-if-changed=icons/{icon}");
    }
    tauri_build::build()
}
