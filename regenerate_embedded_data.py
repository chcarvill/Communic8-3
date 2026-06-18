#!/usr/bin/env python3
"""
Regenerates data-embedded.js from data.json.

Why this exists:
  Browsers block fetch() of local files under the file:// protocol, so the
  app can't simply fetch("data.json") when you double-click index.html.
  Instead, data-embedded.js wraps the same content in a plain <script> tag
  assignment, which loads instantly with no restrictions.

When to run this:
  Only if you hand-edit data.json directly (e.g. to add a bunch of ideas
  in bulk) and want those changes to show up the next time someone opens
  the app fresh (i.e. before any localStorage save exists, or after
  clearing saved data). If you only ever use the in-app "+ New idea"
  button, you never need to run this.

Usage:
  python3 regenerate_embedded_data.py
"""
import json

with open("data.json", "r", encoding="utf-8") as f:
    data = json.load(f)

with open("data-embedded.js", "w", encoding="utf-8") as f:
    f.write("window.__COMMUNIC8_SEED_DATA__ = ")
    json.dump(data, f, ensure_ascii=False, indent=2)
    f.write(";\n")

print("data-embedded.js regenerated from data.json.")
