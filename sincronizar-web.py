"""Copia la app del PC al sitio web (index con el libreto al lado)."""
import os, shutil

ORIGEN = r"D:/PROGRAMACION IA/LIBRETO-HERODES"
DESTINO = r"D:/PROGRAMACION IA/LIBRETO-HERODES-WEB"

for a in ("app.js", "estilos.css"):
    shutil.copy(os.path.join(ORIGEN, "public", a), os.path.join(DESTINO, a))
shutil.copy(os.path.join(ORIGEN, "datos", "libreto-datos.js"), os.path.join(DESTINO, "libreto-datos.js"))

html = open(os.path.join(ORIGEN, "public", "index.html"), encoding="utf-8").read()
html = html.replace('<script src="../datos/libreto-datos.js"></script>', '<script src="libreto-datos.js"></script>')
html = html.replace('<meta name="viewport" content="width=device-width, initial-scale=1">',
 '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
 '<meta name="robots" content="noindex, nofollow">\n'
 '<meta name="apple-mobile-web-app-capable" content="yes">\n'
 '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">\n'
 '<meta name="theme-color" content="#0d1014">\n'
 '<link rel="manifest" href="app.webmanifest">')
open(os.path.join(DESTINO, "index.html"), "w", encoding="utf-8").write(html)
print("web sincronizada")
