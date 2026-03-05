#!/usr/bin/env python3
"""Generate SkillFoundry logo/avatar for GitHub (512x512)."""

from PIL import Image, ImageDraw, ImageFont
import math
import os

SIZE = 512
CENTER = SIZE // 2
BG = (22, 22, 30)
CYAN = (80, 200, 230)
CYAN_DARK = (50, 140, 170)
CYAN_GLOW = (100, 220, 250)
ORANGE = (240, 160, 50)
ORANGE_GLOW = (255, 190, 80)
WHITE = (240, 240, 245)
DARK = (15, 15, 22)

BOLD_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"

img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)

# --- Background: rounded square ---
radius = 64
draw.rounded_rectangle([0, 0, SIZE - 1, SIZE - 1], radius=radius, fill=BG)

# --- Subtle radial gradient overlay (darker edges) ---
for i in range(SIZE):
    for j in range(SIZE):
        dx = i - CENTER
        dy = j - CENTER
        dist = math.sqrt(dx * dx + dy * dy) / (SIZE * 0.6)
        if dist > 1.0:
            dist = 1.0
        alpha = int(40 * dist * dist)
        if alpha > 0:
            r, g, b, a = img.getpixel((i, j))
            nr = max(0, r - alpha)
            ng = max(0, g - alpha)
            nb = max(0, b - alpha)
            img.putpixel((i, j), (nr, ng, nb, a))

draw = ImageDraw.Draw(img)

# --- Anvil shape (stylized) ---
# The anvil is the core identity of SkillFoundry's quality gates

# Anvil body - horn on left, wide face on top
anvil_cx = CENTER
anvil_cy = CENTER + 30

# Base (wide, flat bottom)
base_w = 180
base_h = 24
draw.rounded_rectangle(
    [anvil_cx - base_w//2, anvil_cy + 60, anvil_cx + base_w//2, anvil_cy + 60 + base_h],
    radius=6, fill=CYAN_DARK
)

# Waist (narrower middle connecting to base)
waist_w = 100
waist_h = 35
draw.rectangle(
    [anvil_cx - waist_w//2, anvil_cy + 28, anvil_cx + waist_w//2, anvil_cy + 62],
    fill=CYAN_DARK
)

# Face (wide top surface where you hammer)
face_w = 220
face_h = 30
draw.rounded_rectangle(
    [anvil_cx - face_w//2, anvil_cy - 2, anvil_cx + face_w//2, anvil_cy + 30],
    radius=8, fill=CYAN
)

# Horn (pointed left extension)
horn_points = [
    (anvil_cx - face_w//2, anvil_cy + 2),
    (anvil_cx - face_w//2, anvil_cy + 26),
    (anvil_cx - face_w//2 - 65, anvil_cy + 20),
]
draw.polygon(horn_points, fill=CYAN)

# Hardy hole (small dark square on face)
draw.rectangle(
    [anvil_cx + 30, anvil_cy + 4, anvil_cx + 44, anvil_cy + 18],
    fill=DARK
)

# Pritchel hole (small dark circle on face)
draw.ellipse(
    [anvil_cx + 55, anvil_cy + 6, anvil_cx + 67, anvil_cy + 18],
    fill=DARK
)

# --- Sparks flying from anvil (representing quality/forging) ---
spark_positions = [
    (anvil_cx - 40, anvil_cy - 30, 4),
    (anvil_cx - 65, anvil_cy - 50, 3),
    (anvil_cx - 20, anvil_cy - 55, 3),
    (anvil_cx + 15, anvil_cy - 40, 4),
    (anvil_cx + 50, anvil_cy - 48, 3),
    (anvil_cx + 70, anvil_cy - 35, 2),
    (anvil_cx - 80, anvil_cy - 25, 2),
    (anvil_cx - 50, anvil_cy - 65, 2),
    (anvil_cx + 35, anvil_cy - 62, 2),
    (anvil_cx + 85, anvil_cy - 20, 3),
    (anvil_cx - 30, anvil_cy - 75, 2),
    (anvil_cx + 10, anvil_cy - 70, 3),
]

for sx, sy, sr in spark_positions:
    draw.ellipse([sx - sr, sy - sr, sx + sr, sy + sr], fill=ORANGE_GLOW)
    # Inner bright core
    if sr > 2:
        draw.ellipse([sx - sr//2, sy - sr//2, sx + sr//2, sy + sr//2], fill=(255, 230, 150))

# --- Spark trails (short lines going upward/outward) ---
trail_data = [
    (anvil_cx - 65, anvil_cy - 50, anvil_cx - 75, anvil_cy - 70),
    (anvil_cx - 20, anvil_cy - 55, anvil_cx - 25, anvil_cy - 80),
    (anvil_cx + 50, anvil_cy - 48, anvil_cx + 65, anvil_cy - 72),
    (anvil_cx + 35, anvil_cy - 62, anvil_cx + 40, anvil_cy - 85),
    (anvil_cx - 50, anvil_cy - 65, anvil_cx - 60, anvil_cy - 88),
    (anvil_cx + 10, anvil_cy - 70, anvil_cx + 8, anvil_cy - 92),
]

for x1, y1, x2, y2 in trail_data:
    draw.line([(x1, y1), (x2, y2)], fill=ORANGE, width=1)

# --- "SF" text above ---
sf_font = ImageFont.truetype(BOLD_PATH, 72)
text = "SF"
bbox = sf_font.getbbox(text)
tw = bbox[2] - bbox[0]
th = bbox[3] - bbox[1]
tx = CENTER - tw // 2
ty = 55

# Text shadow
draw.text((tx + 2, ty + 2), text, fill=(10, 10, 15), font=sf_font)
# Main text
draw.text((tx, ty), text, fill=WHITE, font=sf_font)

# --- Thin accent line under "SF" ---
line_y = ty + th + 18
draw.line([(CENTER - 60, line_y), (CENTER + 60, line_y)], fill=CYAN, width=2)

# --- Small diamond accent ---
dy = line_y
draw.polygon([
    (CENTER, dy - 5),
    (CENTER + 5, dy),
    (CENTER, dy + 5),
    (CENTER - 5, dy),
], fill=CYAN_GLOW)

# --- Save ---
output_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "docs")
output_path = os.path.join(output_dir, "logo.png")

# Save as PNG with transparency
img.save(output_path, "PNG", optimize=True)

# Also save a square version without transparency (for GitHub avatar upload)
avatar = Image.new("RGB", (SIZE, SIZE), BG)
avatar.paste(img, (0, 0), img)
avatar_path = os.path.join(output_dir, "avatar.png")
avatar.save(avatar_path, "PNG", optimize=True)

print(f"Logo (transparent): {output_path} ({os.path.getsize(output_path) // 1024}KB)")
print(f"Avatar (solid bg):  {avatar_path} ({os.path.getsize(avatar_path) // 1024}KB)")
