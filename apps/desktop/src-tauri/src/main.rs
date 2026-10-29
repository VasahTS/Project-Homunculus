// Homunculus 2 — native entry point. Author: CLAUDE, 2026-10-23.
// Hides the extra console window on Windows release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    homunculus_lib::run()
}
