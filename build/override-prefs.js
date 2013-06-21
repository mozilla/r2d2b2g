// Prefs that override GRE/Gaia prefs.  Note that other such prefs are in
// prosthesis/defaults/preferences/prefs.js, but these load earlier, so this
// file is useful for prefs that are accessed before addons are loaded.

// Disable the battery API so Gaia doesn't shut down the Simulator on machines
// with a dead or missing battery that it misinterprets as a low power state.
//
// This has to be here to affect the state of BatteryManager, which checks it
// before addons have loaded.
//
user_pref("dom.battery.enabled", false);
