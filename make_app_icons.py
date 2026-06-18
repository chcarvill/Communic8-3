from PIL import Image, ImageDraw

def make_app_icon(size, path):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    paper = (250, 247, 242, 255)
    sage = (122, 155, 126, 255)
    sage_dark = (74, 107, 79, 255)
    clay = (201, 125, 93, 255)
    clay_dark = (138, 79, 54, 255)
    ink = (31, 41, 55, 255)

    # rounded square background (maskable-safe: keep content within ~80% safe zone)
    pad = int(size * 0.06)
    radius = int(size * 0.22)
    d.rounded_rectangle([pad, pad, size - pad, size - pad], radius=radius, fill=paper, outline=ink, width=max(2, size // 80))

    cx, cy = size // 2, size // 2
    r = size * 0.16

    # two overlapping circles: sage (creation) and clay (application) — the core duality of the app
    offset = size * 0.10
    d.ellipse([cx - offset - r, cy - r, cx - offset + r, cy + r], fill=sage)
    d.ellipse([cx + offset - r, cy - r, cx + offset + r, cy + r], fill=clay)

    # small connecting calendar-tick mark beneath, representing "anchored to time"
    tick_w = size * 0.30
    tick_h = size * 0.05
    d.rounded_rectangle(
        [cx - tick_w / 2, cy + r + size * 0.06, cx + tick_w / 2, cy + r + size * 0.06 + tick_h],
        radius=tick_h / 2,
        fill=ink,
    )

    img.save(path)

make_app_icon(192, "/home/claude/communic8-marketing/assets/app-icon-192.png")
make_app_icon(512, "/home/claude/communic8-marketing/assets/app-icon-512.png")
print("done")
