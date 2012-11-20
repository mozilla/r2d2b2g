#!/usr/bin/python

# Override default Gaia profile settings with our own values.

import json

settings_file = 'gaia/profile/settings.json'
override_file = 'settings.json'

with open(settings_file, 'r') as f:
  settings = json.load(f)

with open(override_file, 'r') as f:
  overrides = json.load(f)

for key in overrides.keys():
  settings[key] = overrides[key]

with open(settings_file, 'wb') as f:
  json.dump(settings, f, indent=0)
