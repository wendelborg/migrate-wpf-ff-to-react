/**
 * WebView entry point.
 *
 * This file is the `lib.entry` for the IIFE bundle consumed by WPF's
 * WebView2 host. It:
 *   1. Imports all page registrations so the registry is populated.
 *   2. Re-exports `mount` and `updateProps` so WPF can call them
 *      via `window.__mountPage(...)` / `window.__updateProps(...)`.
 */
import './pages'; // side-effect: registers all pages
export { mount, updateProps } from './pages/registry';
