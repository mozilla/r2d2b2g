#! /usr/bin/env python
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import os
import sys
import json
import subprocess

with open(os.environ["LOCALES_FILE"], 'r') as f:
  locales = json.load(f)

for key in locales.keys():
  path = os.path.join("gaia-l10n", key)

  # If the local clone already exists, pull and update it; otherwise, clone it.
  if os.path.exists(path):
    args = ["hg", "--cwd", path, "pull", "-u"]
  else:
    args = ["hg", "clone", "http://hg.mozilla.org/gaia-l10n/" + key, path]

  print ">", " ".join(args)
  sys.stdout.flush()
  subprocess.call(args)
