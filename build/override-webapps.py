#!/usr/bin/python

# Filter default apps, removing the ones that distract from testing apps.

import json
import os
import shutil

apps_file = 'gaia/profile/webapps/webapps.json'
overrides_file = 'build/override-webapps.json'

with open(apps_file, 'r') as f:
  apps = json.load(f)

with open(overrides_file, 'r') as f:
  overrides = json.load(f)

for key in overrides['blacklist']:
  if key in apps:
    del apps[key]
  dir = 'gaia/profile/webapps/' + key
  if os.path.exists(dir):
    shutil.rmtree(dir)

with open(apps_file, 'wb') as f:
  json.dump(apps, f, indent=2)
