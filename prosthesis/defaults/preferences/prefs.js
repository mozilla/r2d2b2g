// B2G Desktop's UA string doesn't include "Mobile", which various sites sniff
// to determine if the device in question is a mobile device, which is how
// we want them to think of the Simulator, so we override the string with one
// that includes the word.
//
// Note that we need to update this string each time we update the version
// of B2G we ship to one on a different train (i.e. with a different major
// version number).
user_pref("general.useragent.override", "Mozilla/5.0 (Mobile; rv:18.0) Gecko/18.0 Firefox/18.0");

// Don't go to sleep so quickly.
user_pref("power.screen.timeout", 86400);

// Enable remote debugging and other tools.
user_pref("devtools.debugger.remote-enabled", true);
user_pref("marionette.defaultPrefs.enabled", false);
