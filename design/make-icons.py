#!/usr/bin/env python3
"""Regenerate the static logo files that show the tonearm at rest.

The animated logo (src/components/layout/SpinningLogo.tsx) draws the arm in SVG
over the record picture. Places that cannot run the animation (app icons, the
social preview image, the docs site fallback) use these PNGs instead, with the
arm in its rest position (rotate(-25deg) around the pivot 94,6).

Needs only the standard library and `rsvg-convert` (librsvg). Run from webapp/:

    python3 design/make-icons.py

The 32 px favicons (favicon.ico, favicon-32.png) and logo-96/320 are left as
they are: the arm cannot be read at favicon size, and logo-96/320 get the arm
from the component.
"""
import base64
import subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent
PUBLIC = HERE.parent / "public"
DISC = HERE / "logo-crop.png"  # same framing as public/logo-*.png

# Tokens from src/styles/variables.css (dark theme values)
ARM_LIGHT = "#fbe3a6"  # --color-primary-light
NAVY = "#071327"       # --color-on-primary / --color-background

# Same geometry as SpinningLogo.tsx, in the logo's 100 x 100 box
ARM = f"""<g transform="rotate(-25 94 6)">
  <path d="M94 6 L86 56 L77 70" fill="none" stroke="{NAVY}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M94 6 L86 56 L77 70" fill="none" stroke="{ARM_LIGHT}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="71" y="64" width="12" height="9" rx="2" transform="rotate(33 77 68.5)" fill="{ARM_LIGHT}" stroke="{NAVY}" stroke-width="1.5"/>
  <circle cx="94" cy="6" r="7" fill="{ARM_LIGHT}" stroke="{NAVY}" stroke-width="1.5"/>
  <circle cx="94" cy="6" r="2.5" fill="{NAVY}"/>
</g>"""

# Logo + arm at rest spans about x -1..114, y -2..101: a 116-unit square box
# centred on that keeps the arm inside the image.
BOX = (-1.5, -8, 116, 116)


def logo_group(href: str) -> str:
    return f'<image href="{href}" x="0" y="0" width="100" height="100"/>\n{ARM}'


def render(svg: str, out: Path, size: tuple[int, int]) -> None:
    tmp = HERE / ".tmp-icon.svg"
    tmp.write_text(svg)
    try:
        subprocess.run(
            ["rsvg-convert", "-w", str(size[0]), "-h", str(size[1]), "-o", str(out), str(tmp)],
            check=True,
        )
    finally:
        tmp.unlink()
    print(f"wrote {out.relative_to(HERE.parent)} {size[0]}x{size[1]}")


def square(href: str, background: str | None, pad: float = 0.0) -> str:
    """Square image; pad = extra units around the box (maskable safe zone)."""
    x, y, w, h = BOX
    x, y, w, h = x - pad, y - pad, w + 2 * pad, h + 2 * pad
    bg = f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{background}"/>' if background else ""
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x} {y} {w} {h}">'
        f"{bg}{logo_group(href)}</svg>"
    )


def og(href: str) -> str:
    """1200 x 630 social preview: logo with arm centred on navy."""
    scale = 5.1  # logo disc about 510 px tall
    x, y, w, h = BOX
    tx = 600 - (x + w / 2) * scale
    ty = 315 - 50 * scale  # centre the disc vertically
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">'
        f'<rect width="1200" height="630" fill="{NAVY}"/>'
        f'<g transform="translate({tx:.1f} {ty:.1f}) scale({scale})">{logo_group(href)}</g></svg>'
    )


def arm_only() -> str:
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{" ".join(map(str, BOX))}">{ARM}</svg>\n'


def main() -> None:
    href = "data:image/png;base64," + base64.b64encode(DISC.read_bytes()).decode()
    master = HERE / "logo-with-arm.png"
    render(square(href, None), master, (1024, 1024))
    (HERE / "logo-arm.svg").write_text(arm_only())
    print("wrote design/logo-arm.svg")

    render(square(href, None), PUBLIC / "icon-192.png", (192, 192))
    render(square(href, None), PUBLIC / "icon-512.png", (512, 512))
    # iOS fills transparency with black: give the touch icon the navy surface
    render(square(href, NAVY, pad=6), PUBLIC / "apple-touch-icon.png", (180, 180))
    # Maskable: the whole logo well inside the central 80 % safe circle (about 0.74)
    render(square(href, NAVY, pad=30), PUBLIC / "icon-maskable-512.png", (512, 512))
    render(og(href), PUBLIC / "og-image.png", (1200, 630))


if __name__ == "__main__":
    main()
