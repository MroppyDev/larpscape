"""Render a 512x512 animated GIF: the Larpscape gold 'L' (from favicon.svg) as the
centerpiece on the homepage night-sky background (the hero `sky` gradient + twinkling
stars + moon glow). Seamless loop. Output: homepage/public/larpscape-discord-512.gif

Palette is lifted verbatim from homepage/index.html + favicon.svg so it matches brand.
"""
import math, os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

S = 512                      # square canvas
N = 30                       # frames (seamless: every cycle is an integer over the loop)
MS = 64                      # ms per frame -> 1.92s loop
SS = 2                       # supersample factor for crisp edges, downscale at the end
W = S * SS
COLORS = 128                 # shared palette size (dark scene needs few hues)

FONT = r"C:\Windows\Fonts\georgiab.ttf"   # Georgia Bold, matches favicon
OUT = os.path.join(os.path.dirname(__file__), "..", "homepage", "public", "larpscape-discord-512.gif")

# --- homepage `sky` linearGradient stops (offset, #hex) ---
SKY = [(0.00, (0x0c, 0x0a, 0x12)),
       (0.55, (0x24, 0x1a, 0x28)),
       (0.85, (0x3d, 0x2a, 0x25)),
       (1.00, (0x4d, 0x35, 0x26))]
STAR = (0xe9, 0xdd, 0xb8)            # homepage star fill
MOON = (0xef, 0xe0, 0xb4)           # homepage moon disc
MOONGLOW = (0xf3, 0xe2, 0xb0)       # homepage moonglow inner
GOLD = (0xf1, 0xc8, 0x5a)           # favicon letter fill
INK = (0x17, 0x10, 0x08)            # favicon letter stroke
FRAME_OUT = (0x8d, 0x7d, 0x62)      # favicon outer frame stroke
FRAME_IN = (0x24, 0x1d, 0x12)       # favicon inner frame stroke


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def sky_color(yf):
    """Vertical gradient color at normalized y (0=top,1=bottom)."""
    for i in range(len(SKY) - 1):
        o0, c0 = SKY[i]
        o1, c1 = SKY[i + 1]
        if yf <= o1:
            t = 0 if o1 == o0 else (yf - o0) / (o1 - o0)
            return lerp(c0, c1, t)
    return SKY[-1][1]


def make_background():
    """The static night-sky: gradient + soft moon glow + moon disc (drawn once)."""
    bg = Image.new("RGB", (W, W))
    px = bg.load()
    for y in range(W):
        c = sky_color(y / (W - 1))
        for x in range(W):
            px[x, y] = c
    # moon glow upper-right (homepage cx~.80 cy~.23), kept subtle so the L leads
    mx, my = int(W * 0.78), int(W * 0.20)
    glow = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    R = int(W * 0.30)
    for r in range(R, 0, -1):
        a = int(70 * (r / R) ** 0.0)  # placeholder, overwritten below
    # build glow as concentric alpha falloff
    for r in range(R, 0, -2):
        t = r / R
        a = int(90 * (1 - t) ** 2.2)
        gd.ellipse([mx - r, my - r, mx + r, my + r], fill=MOONGLOW + (a,))
    glow = glow.filter(ImageFilter.GaussianBlur(W * 0.02))
    bg = Image.alpha_composite(bg.convert("RGBA"), glow)
    # moon disc
    md = ImageDraw.Draw(bg)
    rr = int(W * 0.052)
    md.ellipse([mx - rr, my - rr, mx + rr, my + rr], fill=MOON + (255,))
    # a couple of craters (homepage)
    md.ellipse([mx - rr*0.5, my - rr*0.5, mx - rr*0.5 + rr*0.34, my - rr*0.5 + rr*0.34],
               fill=(0xe2, 0xd0, 0x9e, 255))
    md.ellipse([mx + rr*0.2, my + rr*0.25, mx + rr*0.2 + rr*0.24, my + rr*0.25 + rr*0.24],
               fill=(0xe2, 0xd0, 0x9e, 255))
    return bg.convert("RGB")


# deterministic star field (x,y,radius,phase) over the supersampled canvas
import random
random.seed(7)
STARS = []
for _ in range(46):
    x = random.uniform(0.04, 0.96) * W
    y = random.uniform(0.03, 0.62) * W      # upper ~2/3, like the hero
    r = random.uniform(0.6, 2.0) * SS
    ph = random.random()                    # twinkle phase
    STARS.append((x, y, r, ph))

# one slow shooting star that enters & exits within the loop (seamless: absent at ends)
SHOOT_WINDOW = (0.12, 0.30)                 # active fraction of the loop


def draw_stars(draw, t):
    for (x, y, r, ph) in STARS:
        # twinkle: homepage keyframe opacity .9 -> .25 -> .9 ; one full cycle per loop
        op = 0.575 + 0.325 * math.cos(2 * math.pi * (t + ph))
        a = int(max(0, min(1, op)) * 255)
        draw.ellipse([x - r, y - r, x + r, y + r], fill=STAR + (a,))
        if r > 1.4 * SS:                    # faint cross-glint on the brighter stars
            g = int(a * 0.5)
            draw.line([x - r*2.4, y, x + r*2.4, y], fill=STAR + (g,), width=max(1, SS//2))
            draw.line([x, y - r*2.4, x, y + r*2.4], fill=STAR + (g,), width=max(1, SS//2))


def draw_shooting_star(draw, t):
    a0, a1 = SHOOT_WINDOW
    if not (a0 <= t <= a1):
        return
    k = (t - a0) / (a1 - a0)                 # 0..1 across the streak
    x0, y0 = 0.15 * W, 0.10 * W
    x1, y1 = 0.62 * W, 0.40 * W
    cx = x0 + (x1 - x0) * k
    cy = y0 + (y1 - y0) * k
    fade = math.sin(math.pi * k)             # fade in/out, zero at both ends
    L = 0.10 * W
    dx, dy = (x1 - x0), (y1 - y0)
    n = math.hypot(dx, dy)
    ux, uy = dx / n, dy / n
    for i in range(12):                      # tapered tail
        f = i / 11
        a = int(200 * fade * (1 - f))
        if a <= 0:
            continue
        px, py = cx - ux * L * f, cy - uy * L * f
        rr = (1 - f) * 1.8 * SS
        draw.ellipse([px - rr, py - rr, px + rr, py + rr], fill=(255, 248, 225, a))


def build_glyph_layers(font):
    """Pre-render the gold 'L' (fill + ink stroke) and a blurred glow copy, centered."""
    layer = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    sw = max(2, int(0.012 * W))              # ink outline width (favicon stroke 1.2/20em)
    # measure & center
    bbox = d.textbbox((0, 0), "L", font=font, stroke_width=sw)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    x = (W - tw) / 2 - bbox[0]
    y = (W - th) / 2 - bbox[1] - int(0.01 * W)   # nudge up a hair (serif optical center)
    d.text((x, y), "L", font=font, fill=GOLD + (255,),
           stroke_width=sw, stroke_fill=INK + (255,))
    # glow: blurred gold silhouette (favicon-less, matches the hero glyphglow filter)
    glow = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.text((x, y), "L", font=font, fill=GOLD + (255,), stroke_width=sw, stroke_fill=GOLD + (255,))
    glow = glow.filter(ImageFilter.GaussianBlur(W * 0.018))
    return layer, glow


def draw_frame_border(img):
    """Favicon double frame (outer #8d7d62, inner #241d12) inset from the edge."""
    d = ImageDraw.Draw(img, "RGBA")
    inset = int(0.045 * W)
    rad = int(0.06 * W)
    w_out = max(2, int(0.006 * W))
    w_in = max(1, int(0.004 * W))
    d.rounded_rectangle([inset, inset, W - inset, W - inset], radius=rad,
                        outline=FRAME_OUT + (235,), width=w_out)
    i2 = inset + w_out + int(0.006 * W)
    d.rounded_rectangle([i2, i2, W - i2, W - i2], radius=int(rad * 0.8),
                        outline=FRAME_IN + (235,), width=w_in)


def main():
    try:
        font = ImageFont.truetype(FONT, int(W * 0.62))
    except OSError:
        font = ImageFont.truetype(r"C:\Windows\Fonts\timesbd.ttf", int(W * 0.62))

    bg = make_background()
    glyph, glyph_glow = build_glyph_layers(font)

    frames = []
    for f in range(N):
        t = f / N
        frame = bg.copy().convert("RGBA")

        sky_overlay = Image.new("RGBA", (W, W), (0, 0, 0, 0))
        sd = ImageDraw.Draw(sky_overlay)
        draw_stars(sd, t)
        draw_shooting_star(sd, t)
        frame = Image.alpha_composite(frame, sky_overlay)

        # pulsing glow behind the L (one seamless cycle), then the crisp glyph
        pulse = 0.45 + 0.55 * (0.5 + 0.5 * math.cos(2 * math.pi * t))  # 0.45..1.0
        gl = glyph_glow.copy()
        gl.putalpha(gl.getchannel("A").point(lambda a: int(a * pulse)))
        frame = Image.alpha_composite(frame, gl)
        frame = Image.alpha_composite(frame, glyph)

        draw_frame_border(frame)

        frame = frame.convert("RGB").resize((S, S), Image.LANCZOS)
        frames.append(frame)

    # encode GIF with ONE shared palette across all frames: smaller file, stable
    # colors (no per-frame palette flicker). Build the palette from the brightest
    # frame (shooting star active) so highlights/gold are represented.
    pal_src = frames[min(range(N), key=lambda i: -i)].convert("RGB")
    palette = frames[5].convert("RGB").quantize(colors=COLORS, method=Image.MEDIANCUT)
    qframes = [fr.convert("RGB").quantize(palette=palette, dither=Image.FLOYDSTEINBERG)
               for fr in frames]
    qframes[0].save(OUT, save_all=True, append_images=qframes[1:], duration=MS,
                    loop=0, disposal=1, optimize=True)
    print("wrote", os.path.abspath(OUT), os.path.getsize(OUT), "bytes,", N, "frames")
    # also a static poster (first frame) for non-animated contexts
    poster = os.path.join(os.path.dirname(OUT), "larpscape-discord-512.png")
    frames[0].save(poster)
    print("wrote", os.path.abspath(poster))


if __name__ == "__main__":
    main()
