#!/usr/bin/env python3
"""Generate an animated GIF demo of SkillFoundry's /forge pipeline."""

from PIL import Image, ImageDraw, ImageFont
import struct
import io
import os

# --- Config ---
WIDTH = 840
HEIGHT = 520
BG = (22, 22, 30)
FG = (204, 204, 204)
GREEN = (80, 200, 120)
YELLOW = (230, 190, 60)
CYAN = (100, 200, 230)
RED = (220, 80, 80)
BLUE = (100, 140, 230)
MAGENTA = (180, 120, 220)
DIM = (100, 100, 120)
HEADER_BG = (30, 30, 42)

FONT_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"
BOLD_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"
FONT_SIZE = 14
LINE_HEIGHT = 20
PADDING = 16

font = ImageFont.truetype(FONT_PATH, FONT_SIZE)
bold = ImageFont.truetype(BOLD_PATH, FONT_SIZE)
small = ImageFont.truetype(FONT_PATH, 12)


def make_frame(lines, cursor_line=None, cursor_col=None):
    """Render a terminal frame with colored text lines."""
    img = Image.new("RGB", (WIDTH, HEIGHT), BG)
    draw = ImageDraw.Draw(img)

    # Window chrome — title bar
    draw.rectangle([0, 0, WIDTH, 32], fill=HEADER_BG)
    # Traffic lights
    draw.ellipse([12, 10, 24, 22], fill=(255, 95, 87))
    draw.ellipse([30, 10, 42, 22], fill=(255, 189, 46))
    draw.ellipse([48, 10, 60, 22], fill=(39, 201, 63))
    draw.text((WIDTH // 2 - 60, 8), "SkillFoundry CLI", fill=DIM, font=small)

    y = 40
    for line in lines:
        x = PADDING
        if isinstance(line, str):
            draw.text((x, y), line, fill=FG, font=font)
        elif isinstance(line, list):
            # List of (text, color, font_choice) tuples
            for segment in line:
                if len(segment) == 3:
                    text, color, f = segment
                    f = bold if f == "bold" else font
                else:
                    text, color = segment
                    f = font
                draw.text((x, y), text, fill=color, font=f)
                bbox = f.getbbox(text)
                x += bbox[2] - bbox[0]
        y += LINE_HEIGHT

    # Cursor block
    if cursor_line is not None and cursor_col is not None:
        cy = 40 + cursor_line * LINE_HEIGHT
        bbox = font.getbbox("M")
        cw = bbox[2] - bbox[0]
        cx = PADDING + cursor_col * cw
        draw.rectangle([cx, cy, cx + cw, cy + LINE_HEIGHT], fill=FG)

    return img


# --- Build frames ---
frames = []
durations = []  # in ms


def add(lines, duration_ms=80, cursor=None):
    cl = cursor[0] if cursor else None
    cc = cursor[1] if cursor else None
    frames.append(make_frame(lines, cl, cc))
    durations.append(duration_ms)


# Shared header
header = [
    [("┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓", DIM)],
    [("│ ", DIM), ("◆ SkillFoundry CLI", CYAN, "bold"), ("    anthropic:claude-sonnet ", DIM),
     ("● ", GREEN), ("team:dev ", DIM), ("● ", GREEN), ("$0.00 ", DIM), ("● ", GREEN), ("14.2k tok", DIM), (" │", DIM)],
    [("┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛", DIM)],
    "",
]

prompt_prefix = [("⟫ ", CYAN, "bold")]

# Frame 1-6: Typing /forge
cmd = "/forge"
for i in range(len(cmd) + 1):
    typed = cmd[:i]
    line = prompt_prefix + [(typed, FG)]
    add(header + [line], duration_ms=120, cursor=(4, 2 + i))

# Frame 7: Enter pressed — blank moment
add(header + [prompt_prefix + [(cmd, FG)]], duration_ms=400)

# Frame 8: Phase 1 starting
phase1_lines = header + [
    prompt_prefix + [(cmd, FG)],
    "",
    [("The Forge", CYAN, "bold"), (" — Starting pipeline", DIM)],
    [("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", DIM)],
    "",
    [("  Phase 1 (Ignite)", YELLOW, "bold"), ("   Validating PRDs...", DIM)],
]
add(phase1_lines, duration_ms=800)

# Frame 9: Phase 1 done
phase1_done = header + [
    prompt_prefix + [(cmd, FG)],
    "",
    [("The Forge", CYAN, "bold"), (" — Pipeline running", DIM)],
    [("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", DIM)],
    "",
    [("  Phase 1 (Ignite)    ", FG), ("✓", GREEN, "bold"), (" 2 PRDs validated", GREEN)],
]
add(phase1_done, duration_ms=600)

# Frame 10: Phase 2 running
phase2_run = phase1_done[:]  + [
    [("  Phase 2 (Forge)     ", FG), ("⠋", YELLOW), (" Implementing stories...", DIM)],
    "",
    [("    STORY-001 ", DIM), ("auth-models       ", FG), ("Architect → Coder → Tester", DIM)],
]
add(phase2_run, duration_ms=800)

# Frame 11: Phase 2 — stories progressing
phase2_prog = phase1_done[:] + [
    [("  Phase 2 (Forge)     ", FG), ("⠹", YELLOW), (" 3/8 stories...", DIM)],
    "",
    [("    STORY-001 ", DIM), ("auth-models       ", FG), ("✓", GREEN, "bold")],
    [("    STORY-002 ", DIM), ("login-api         ", FG), ("✓", GREEN, "bold")],
    [("    STORY-003 ", DIM), ("jwt-middleware    ", FG), ("✓", GREEN, "bold")],
    [("    STORY-004 ", DIM), ("password-reset    ", FG), ("⠋", YELLOW), (" coder...", DIM)],
]
add(phase2_prog, duration_ms=1000)

# Frame 12: Phase 2 — anvil gate
phase2_anvil = phase1_done[:] + [
    [("  Phase 2 (Forge)     ", FG), ("⠸", YELLOW), (" 6/8 stories...", DIM)],
    "",
    [("    STORY-005 ", DIM), ("oauth-provider    ", FG), ("Anvil T2 fail → ", YELLOW), ("Fixer → ", MAGENTA), ("✓", GREEN, "bold")],
    [("    STORY-006 ", DIM), ("session-mgmt      ", FG), ("✓", GREEN, "bold")],
    [("    STORY-007 ", DIM), ("role-permissions  ", FG), ("⠋", YELLOW), (" tester...", DIM)],
]
add(phase2_anvil, duration_ms=1200)

# Frame 13: Phase 2 done
phase2_done = phase1_done[:] + [
    [("  Phase 2 (Forge)     ", FG), ("✓", GREEN, "bold"), (" 8/8 stories implemented", GREEN)],
    [("                       ", FG), ("  Auto-fixes: 1  Retries: 2", DIM)],
]
add(phase2_done, duration_ms=600)

# Frame 14: Phase 3 running
phase3_run = phase2_done[:] + [
    [("  Phase 3 (Temper)    ", FG), ("⠋", YELLOW), (" Validating layers...", DIM)],
]
add(phase3_run, duration_ms=800)

# Frame 15: Phase 3 done
phase3_done = phase2_done[:] + [
    [("  Phase 3 (Temper)    ", FG), ("✓", GREEN, "bold"), (" DB ✓  Backend ✓  Frontend ✓", GREEN)],
]
add(phase3_done, duration_ms=600)

# Frame 16: Phase 4
phase4_done = phase3_done[:] + [
    [("  Phase 4 (Inspect)   ", FG), ("✓", GREEN, "bold"), (" 0 critical, 0 high, 1 low", GREEN)],
]
add(phase4_done, duration_ms=600)

# Frame 17: Phase 5
phase5_done = phase4_done[:] + [
    [("  Phase 5 (Remember)  ", FG), ("✓", GREEN, "bold"), (" 4 entries harvested", GREEN)],
]
add(phase5_done, duration_ms=600)

# Frame 18: Phase 6
phase6_done = phase5_done[:] + [
    [("  Phase 6 (Debrief)   ", FG), ("✓", GREEN, "bold"), (" Scratchpad updated", GREEN)],
]
add(phase6_done, duration_ms=400)

# Frame 19: Final result
final = header + [
    prompt_prefix + [(cmd, FG)],
    "",
    [("The Forge — Complete", CYAN, "bold")],
    [("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", DIM)],
    "",
    [("  Phase 1 (Ignite)    ", FG), ("✓", GREEN, "bold"), (" PRDs validated", GREEN)],
    [("  Phase 2 (Forge)     ", FG), ("✓", GREEN, "bold"), (" 8/8 stories", GREEN)],
    [("  Phase 3 (Temper)    ", FG), ("✓", GREEN, "bold"), (" All layers passing", GREEN)],
    [("  Phase 4 (Inspect)   ", FG), ("✓", GREEN, "bold"), (" Security clean", GREEN)],
    [("  Phase 5 (Remember)  ", FG), ("✓", GREEN, "bold"), (" Knowledge harvested", GREEN)],
    [("  Phase 6 (Debrief)   ", FG), ("✓", GREEN, "bold"), (" Scratchpad updated", GREEN)],
    "",
    [("  Stories: ", DIM), ("8/8", GREEN, "bold"), ("  Auto-fixes: ", DIM), ("1", YELLOW),
     ("  Tokens: ", DIM), ("~142K", FG)],
    "",
    [("  Status: ", DIM), ("FORGED", GREEN, "bold"), (" — Ready for deployment", GREEN)],
    "",
]
add(final, duration_ms=4000)

# --- Save as animated GIF ---
output_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "docs", "demo.gif")

frames[0].save(
    output_path,
    save_all=True,
    append_images=frames[1:],
    duration=durations,
    loop=0,
    optimize=True,
)

file_size = os.path.getsize(output_path)
print(f"Generated: {output_path}")
print(f"Frames: {len(frames)}")
print(f"Size: {file_size / 1024:.0f}KB")
