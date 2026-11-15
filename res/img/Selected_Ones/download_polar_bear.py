#!/usr/bin/env python3
"""Downloads the replacement polar bear photo (public domain, NOAA) (all free to use) into this folder.
Run in Terminal:  python3 download_polar_bear.py
All images come from Wikimedia Commons. Licences and credit lines are in CREDITS_selected.md."""
import os, time, urllib.request
HERE = os.path.dirname(os.path.abspath(__file__))
IMAGES = [
 {
  "file": "03_Arctic sea ice 2012_polar bear NOAA.jpg",
  "url": "https://thumb.wikimedia.org/wikipedia/commons/thumb/8/87/Anim1865_-_Flickr_-_NOAA_Photo_Library.jpg/1920px-Anim1865_-_Flickr_-_NOAA_Photo_Library.jpg"
 }
]
ok = 0
for it in IMAGES:
    out = os.path.join(HERE, it["file"])
    if os.path.exists(out) and os.path.getsize(out) > 1000:
        ok += 1; continue
    req = urllib.request.Request(it["url"], headers={"User-Agent": "EarthInformationJukebox/1.0 (NASA Space Apps project)"})
    try:
        with urllib.request.urlopen(req, timeout=180) as r, open(out, "wb") as f:
            f.write(r.read())
        ok += 1; print("ok  ", it["file"])
    except Exception as e:
        print("FAIL", it["file"], e)
    time.sleep(1)
print(f"\n{ok}/{len(IMAGES)} images in {HERE}")
