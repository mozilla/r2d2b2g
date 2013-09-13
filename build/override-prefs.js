// Prefs that override GRE/Gaia prefs.  Note that other such prefs are in
// prosthesis/defaults/preferences/prefs.js, but these load earlier, so this
// file is useful for prefs that are accessed before addons are loaded.

user_pref("devtools.debugger.enable-content-actors", true);
user_pref("devtools.debugger.prompt-connection", false);
user_pref("b2g.adb.timeout", 0);

