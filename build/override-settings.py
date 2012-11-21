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

for key in overrides['remove']:
  if key in settings:
    del settings[key]

# Disable OOP on Windows and Linux to work around repaint problems (bug 799768).
# On Windows, disabling OOP also worked around a B2G startup crash (bug 795484),
# although it doesn't appear to be necessary anymore.
if sys.platform == 'win32' or sys.platform.startswith('linux'):
  settings['debug.oop.disabled'] = True

with open(settings_file, 'wb') as f:
  json.dump(settings, f, indent=2)
