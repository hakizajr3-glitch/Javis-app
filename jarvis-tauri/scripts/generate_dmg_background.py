#!/usr/bin/env python3
"""Generate a polished DMG background image for JARVIS installer."""

from PIL import Image, ImageDraw, ImageFont
import os

W, H = 658, 498
img = Image.new("RGB", (W, H), (10, 14, 26))
draw = ImageDraw.Draw(img)

# Concentric accent rectangles
for r in range(25, W // 2, 6):
    a = int(max(0, min(12, 12 - r * 0.025)))
    draw.rectangle(
        [W // 2 - r, H // 2 - r * H // W, W // 2 + r, H // 2 + r * H // W],
        outline=(18 + a, 26 + a, 46 + a),
    )

# Top accent line
draw.line([(60, 90), (W - 60, 90)], fill=(0, 180, 216), width=1)

# Bottom accent line
draw.line([(80, H - 70), (W - 80, H - 70)], fill=(0, 180, 216), width=1)

# Load fonts
try:
    font_lg = ImageFont.truetype("/System/Library/Fonts/SFNSDisplay-Bold.otf", 28)
    font_md = ImageFont.truetype("/System/Library/Fonts/SFNSDisplay-Regular.otf", 13)
    font_sm = ImageFont.truetype("/System/Library/Fonts/SFNSDisplay-Regular.otf", 11)
except Exception:
    font_lg = ImageFont.load_default()
    font_md = font_lg
    font_sm = font_lg

# Title
title = "J.A.R.V.I.S."
tw = draw.textlength(title, font=font_lg)
draw.text(((W - tw) // 2, 48), title, fill=(0, 212, 255), font=font_lg)

# Subtitle
sub = "Just A Rather Very Intelligent System"
sw = draw.textlength(sub, font=font_md)
draw.text(((W - sw) // 2, 82), sub, fill=(100, 120, 140), font=font_md)

# Arrow pointing to Applications area
arr_x, arr_y = W - 170, H - 140
draw.line([(arr_x, arr_y - 15), (arr_x, arr_y + 15)], fill=(0, 212, 255), width=2)
draw.line([(arr_x - 8, arr_y + 5), (arr_x, arr_y + 15)], fill=(0, 212, 255), width=2)
draw.line([(arr_x + 8, arr_y + 5), (arr_x, arr_y + 15)], fill=(0, 212, 255), width=2)
# Single-line text to avoid multiline anchor issue
txt1 = "Drag to"
draw.text((arr_x, arr_y + 26), txt1, fill=(0, 212, 255), font=font_sm, anchor="mt")
txt2 = "Applications"
draw.text((arr_x, arr_y + 40), txt2, fill=(0, 212, 255), font=font_sm, anchor="mt")

# Bottom tagline
tag = "macOS 12+  ·  Apple Silicon & Intel"
tw2 = draw.textlength(tag, font=font_sm)
draw.text(((W - tw2) // 2, H - 24), tag, fill=(60, 70, 90), font=font_sm)

# Corner dots
for x, y in [(22, 22), (W - 22, 22), (22, H - 22), (W - 22, H - 22)]:
    draw.rectangle([x - 4, y - 4, x + 4, y + 4], fill=None, outline=(0, 212, 255), width=1)

out_path = os.path.join(os.path.dirname(__file__), "dmg-background.png")
img.save(out_path, "PNG")
print(f"Background saved: {out_path}  ({W}x{H})")
