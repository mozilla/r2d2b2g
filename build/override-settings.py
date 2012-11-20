#!/usr/bin/python

# Override default Gaia profile settings with our own values.

import json

settings_file = 'gaia/profile/settings.json'
override_file = 'build/override-settings.json'

with open(settings_file, 'r') as f:
  settings = json.load(f)

with open(override_file, 'r') as f:
  overrides = json.load(f)

for key in overrides['remove']:
  if key in settings:
    del settings[key]

with open(settings_file, 'wb') as f:
  json.dump(settings, f, indent=0)
