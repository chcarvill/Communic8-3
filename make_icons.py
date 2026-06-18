from PIL import Image, ImageDraw

SIZE = 256

def new_canvas():
    return Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))

# ── Creation icon: a seedling / sprout, sage green, representing "building the thing" ──
def make_creation_icon(path):
    img = new_canvas()
    d = ImageDraw.Draw(img)
    sage = (122, 155, 126, 255)
    sage_dark = (74, 107, 79, 255)
    soil = (90, 74, 58, 255)

    cx = SIZE // 2

    # soil mound
    d.ellipse([cx - 70, 178, cx + 70, 220], fill=soil)

    # stem
    d.line([(cx, 178), (cx, 110)], fill=sage_dark, width=10)

    # left leaf
    d.pieslice([cx - 70, 80, cx + 10, 160], start=120, end=260, fill=sage)
    # right leaf
    d.pieslice([cx - 10, 80, cx + 70, 160], start=280, end=420, fill=sage)

    # small bud at top
    d.ellipse([cx - 16, 64, cx + 16, 96], fill=sage_dark)

    img.save(path)

# ── Application icon: an outward arrow / megaphone-ish burst, clay/terracotta, representing "doing the thing" ──
def make_application_icon(path):
    img = new_canvas()
    d = ImageDraw.Draw(img)
    clay = (201, 125, 93, 255)
    clay_dark = (138, 79, 54, 255)

    cx, cy = SIZE // 2, SIZE // 2

    # outer ring (motion / repetition)
    d.arc([cx - 100, cy - 100, cx + 100, cy + 100], start=200, end=160, fill=clay, width=10)

    # central arrow shaft
    d.line([(cx - 50, cy + 30), (cx + 40, cy - 30)], fill=clay_dark, width=14)

    # arrow head
    d.polygon([
        (cx + 60, cy - 50),
        (cx + 20, cy - 46),
        (cx + 54, cy - 12),
    ], fill=clay_dark)

    # small dot trail (repetition cue)
    d.ellipse([cx - 78, cy + 46, cx - 58, cy + 66], fill=clay)
    d.ellipse([cx - 50, cy + 60, cx - 34, cy + 76], fill=clay)

    img.save(path)

make_creation_icon("/home/claude/communic8-marketing/assets/icon-creation.png")
make_application_icon("/home/claude/communic8-marketing/assets/icon-application.png")
print("done")
