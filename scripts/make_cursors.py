#!/usr/bin/env python3
"""Génère les curseurs 8 bit noir et blanc (PNG 32x32, grille 16x16 agrandie x2) :
poing fermé (navigation) et doigt d'honneur (survol d'un élément cliquable, et au clic).
Stdlib uniquement. Usage : python3 scripts/make_cursors.py   ->  frontend/cursors/{fist,flip}.png"""
import os, struct, zlib

SKIN, SHADE, INK = (255, 255, 255, 255), (168, 168, 168, 255), (0, 0, 0, 255)   # noir et blanc
N, SCALE = 16, 2

def rect(g, x0, x1, y0, y1, v=1):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            g[y][x] = v

def outline(g):
    """Contour noir autour de toute zone remplie (voisins 4-connexes)."""
    out = [row[:] for row in g]
    for y in range(N):
        for x in range(N):
            if g[y][x] == 0 and any(0 <= y + dy < N and 0 <= x + dx < N and g[y + dy][x + dx] > 0
                                    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                out[y][x] = 3
    return out

def fist():
    g = [[0] * N for _ in range(N)]
    for x0 in (3, 6, 9, 12):                      # 4 phalanges serrées (vue de face)
        rect(g, x0, x0 + 1, 3, 3)
    rect(g, 2, 13, 4, 12)                         # paume + doigts repliés
    for x in (5, 8, 11):                          # séparations entre les doigts
        rect(g, x, x, 4, 7, 2)
    rect(g, 2, 9, 8, 10)                          # pouce en travers
    rect(g, 2, 9, 11, 11, 2)                      # ombre sous le pouce
    rect(g, 4, 11, 13, 14)                        # poignet
    return outline(g)

def flip():
    g = [[0] * N for _ in range(N)]
    rect(g, 7, 9, 1, 8)                           # majeur dressé
    rect(g, 7, 7, 3, 8, 2)                        # ombre du majeur
    rect(g, 3, 6, 5, 8)                           # index replié
    rect(g, 10, 12, 6, 8)                         # annulaire replié
    rect(g, 13, 14, 8, 10)                        # auriculaire
    rect(g, 3, 14, 9, 12)                         # poing
    rect(g, 2, 5, 10, 12)                         # pouce
    rect(g, 3, 5, 10, 10, 2)
    rect(g, 5, 11, 13, 14)                        # poignet
    return outline(g)

def png(g, path):
    pal = {0: (0, 0, 0, 0), 1: SKIN, 2: SHADE, 3: INK}
    w = N * SCALE
    raw = b""
    for y in range(w):
        raw += b"\x00" + b"".join(bytes(pal[g[y // SCALE][x // SCALE]]) for x in range(w))
    chunk = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d))
    data = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, w, 8, 6, 0, 0, 0)) \
        + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
    open(path, "wb").write(data)

if __name__ == "__main__":
    d = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend", "cursors")
    os.makedirs(d, exist_ok=True)
    for name, g in (("fist", fist()), ("flip", flip())):
        png(g, os.path.join(d, name + ".png"))
        print(name); print("\n".join("".join((" ", "█", "▒", "#")[v] for v in row) for row in g))
