#!/usr/bin/python

# Override default Gaia profile settings with our own values.

import json
import sys

settings_file = 'gaia/profile/settings.json'
override_file = 'build/override-settings.json'

with open(settings_file, 'r') as f:
  settings = json.load(f)

with open(override_file, 'r') as f:
  overrides = json.load(f)

for key in overrides['set'].keys():
  settings[key] = overrides['set'][key]

for key in overrides['remove']:
  if key in settings:
    del settings[key]

with open(settings_file, 'wb') as f:
  json.dump(settings, f, indent=2)

# Comments about the overridden settings in override-settings.json, since JSON
# can't contain comments:

# debug.oop.disabled:
# Disable OOP to enable use of the remote debugger.
# Also disable it on Windows/Linux to work around repaint problems (bug 799768).
# On Windows, disabling OOP also worked around a B2G startup crash (bug 795484),
# although it doesn't appear to be necessary anymore.
