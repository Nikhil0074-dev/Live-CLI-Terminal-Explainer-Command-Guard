#!/usr/bin/env python3
"""Render ANSI-coloured terminal text (a .ans file) to a PNG that looks like a terminal window.
Usage: render_terminal.py input.ans output.png [title]
These images are rendered from REAL captured output of the tool, not mock-ups."""
import re, sys
from PIL import Image, ImageDraw, ImageFont

FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"
BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"
SIZE = 15
BG, FG = (30, 32, 40), (214, 218, 228)
PAL = {30: (60, 63, 75), 31: (240, 98, 98), 32: (110, 205, 125), 33: (240, 200, 90), 34: (110, 160, 245),
       35: (200, 130, 240), 36: (95, 205, 215), 37: (220, 220, 220), 97: (255, 255, 255)}
BGPAL = {41: (200, 50, 55), 42: (60, 160, 90), 43: (215, 170, 40), 45: (150, 70, 190), 44: (60, 100, 200)}

def parse(text):
    lines, cur, st = [], [], dict(fg=None, bg=None, bold=False, dim=False)
    for part in re.split(r"(\x1b\[[0-9;]*m)", text):
        m = re.fullmatch(r"\x1b\[([0-9;]*)m", part)
        if m:
            for c in (m.group(1) or "0").split(";"):
                c = int(c or 0)
                if c == 0: st = dict(fg=None, bg=None, bold=False, dim=False)
                elif c == 1: st["bold"] = True
                elif c == 2: st["dim"] = True
                elif c == 22: st["bold"] = False; st["dim"] = False
                elif c == 39: st["fg"] = None
                elif c == 49: st["bg"] = None
                elif c in (90, 91, 92, 93, 94, 95, 96): st["fg"] = PAL[c - 60]
                elif c in (40, 46, 47, 100): st["bg"] = (70, 72, 85)
                elif c in PAL: st["fg"] = PAL[c]
                elif c in BGPAL: st["bg"] = BGPAL[c]
            continue
        segs = part.split("\n")
        for i, s in enumerate(segs):
            if i > 0:
                lines.append(cur); cur = []
            if s: cur.append((s.replace("\r", ""), dict(st)))
    lines.append(cur)
    return lines

def main():
    src, out = sys.argv[1], sys.argv[2]
    title = sys.argv[3] if len(sys.argv) > 3 else "terminal"
    text = open(src, encoding="utf-8", errors="replace").read().rstrip("\n")
    lines = parse(text)
    f, fb = ImageFont.truetype(FONT, SIZE), ImageFont.truetype(BOLD, SIZE)
    cw = int(f.getlength("M")); lh = SIZE + 6
    cols = max((sum(len(s) for s, _ in l) for l in lines), default=20)
    cols = max(cols, 70)
    pad, bar = 18, 34
    W, H = cols * cw + pad * 2, len(lines) * lh + pad * 2 + bar
    img = Image.new("RGB", (W, H), BG); d = ImageDraw.Draw(img)
    d.rectangle([0, 0, W, bar], fill=(48, 51, 62))
    for i, c in enumerate([(255, 95, 86), (255, 189, 46), (39, 201, 63)]):
        d.ellipse([14 + i * 22, 11, 26 + i * 22, 23], fill=c)
    d.text((W // 2 - len(title) * 4, 9), title, fill=(170, 175, 190), font=f)
    y = bar + pad
    for l in lines:
        x = pad
        for s, st in l:
            w = len(s) * cw
            if st["bg"]: d.rectangle([x, y - 2, x + w, y + lh - 3], fill=st["bg"])
            col = st["fg"] or FG
            if st["dim"]: col = tuple(int(c * 0.6) for c in col)
            if st["bg"] and not st["fg"]: col = (255, 255, 255)
            d.text((x, y), s, fill=col, font=fb if st["bold"] else f)
            x += w
        y += lh
    img.save(out)
    print("wrote", out, img.size)
main()
