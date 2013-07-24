// Prefs that override GRE/Gaia prefs.  Note that other such prefs are in
// prosthesis/defaults/preferences/prefs.js, but these load earlier, so this
// file is useful for prefs that are accessed before addons are loaded.

user_pref("services.push.enabled", true);
user_pref("services.push.serverURL", "wss://push.services.mozilla.com");
