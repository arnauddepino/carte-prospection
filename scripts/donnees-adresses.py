"""Adresses de chaque bâtiment, d'après la Base Adresse Nationale et le cadastre.

Produit public/adresses-15e.json :
  - « rues » : nom de chaque voie, par code (début de l'identifiant BAN,
    ex. « 75115_3392 » → « Rue Leblanc ») ;
  - « batiments » : pour chaque bâtiment, ses adresses (identifiants BAN, ex.
    « 75115_3392_00010_b »), triées par rue puis par numéro.

Un bâtiment dessiné d'un seul bloc par OpenStreetMap peut ainsi porter
plusieurs adresses (12, 14, 16 rue X), suivies une à une dans l'appli.

Rattachement : le point BAN est au centre de la parcelle, pas sur la façade.
L'adresse va donc au bâtiment qui couvre la plus grande part de sa parcelle
cadastrale ; à défaut (parcelle sans bâtiment connu), au bâtiment le plus
proche du point, à moins de 15 m.

Usage (à relancer pour mettre à jour, sans dépendance) :
    python scripts/donnees-adresses.py
"""

import csv
import gzip
import io
import json
import math
import re
import urllib.request
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BATIMENTS = ROOT / "public" / "batiments-15e.geojson"
SORTIE = ROOT / "public" / "adresses-15e.json"
COMMUNE = "75115"  # Paris 15e
BAN = "https://adresse.data.gouv.fr/data/ban/adresses/latest/csv/adresses-75.csv.gz"
CADASTRE = f"https://cadastre.data.gouv.fr/data/etalab-cadastre/latest/geojson/communes/75/{COMMUNE}/cadastre-{COMMUNE}-parcelles.json.gz"
DISTANCE_MAX = 15  # m
PAS = 1.5  # m : maillage des points testés dans une parcelle
CELL = 0.0005
M_PAR_DEG = 111320
COS = math.cos(math.radians(48.84))
# Identifiant BAN : « <voie>_<numéro sur 5 chiffres>[_<suffixe>] ».
ID_BAN = re.compile(r"^(.+)_(\d{5})(?:_([a-z0-9]+))?$")


def telecharger(url):
    req = urllib.request.Request(url, headers={"User-Agent": "carte-prospection (adresses 15e)"})
    with urllib.request.urlopen(req, timeout=300) as r:
        return gzip.decompress(r.read())


def dans(x, y, anneau):
    c = False
    for k in range(len(anneau)):
        (x1, y1), (x2, y2) = anneau[k], anneau[k - 1]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            c = not c
    return c


def distance_segment(px, py, ax, ay, bx, by):
    ax, ay = (ax - px) * COS * M_PAR_DEG, (ay - py) * M_PAR_DEG
    bx, by = (bx - px) * COS * M_PAR_DEG, (by - py) * M_PAR_DEG
    dx, dy = bx - ax, by - ay
    l2 = dx * dx + dy * dy
    t = max(0.0, min(1.0, -(ax * dx + ay * dy) / l2)) if l2 else 0.0
    return math.hypot(ax + t * dx, ay + t * dy)


def anneaux_de(g):
    if g["type"] == "Polygon":
        return [g["coordinates"][0]]
    if g["type"] == "MultiPolygon":
        return [p[0] for p in g["coordinates"]]
    return []


def boite(anneau):
    xs, ys = [p[0] for p in anneau], [p[1] for p in anneau]
    return min(xs), min(ys), max(xs), max(ys)


def cellules(b):
    for i in range(int(b[0] / CELL), int(b[2] / CELL) + 1):
        for j in range(int(b[1] / CELL), int(b[3] / CELL) + 1):
            yield i, j


def main():
    # Bâtiments, indexés par cellule de leur emprise.
    batiments, grille = [], defaultdict(list)
    for f in json.load(open(BATIMENTS, encoding="utf8"))["features"]:
        for a in anneaux_de(f["geometry"]):
            b = boite(a)
            batiments.append((f.get("id") or f["properties"]["@id"], a, b))
            for c in cellules(b):
                grille[c].append(len(batiments) - 1)

    def batiment_en(x, y):
        for k in grille.get((int(x / CELL), int(y / CELL)), ()):
            _, a, b = batiments[k]
            if b[0] <= x <= b[2] and b[1] <= y <= b[3] and dans(x, y, a):
                return k
        return None

    print("Cadastre…")
    parcelles = {}
    for f in json.loads(telecharger(CADASTRE))["features"]:
        parcelles[f["id"]] = anneaux_de(f["geometry"])

    # Bâtiment qui couvre la plus grande part d'une parcelle (points d'un maillage).
    memo = {}

    def batiment_de_parcelle(pid):
        if pid not in memo:
            compte = Counter()
            for a in parcelles.get(pid, []):
                x0, y0, x1, y1 = boite(a)
                dx, dy = PAS / (COS * M_PAR_DEG), PAS / M_PAR_DEG
                y = y0 + dy / 2
                while y < y1:
                    x = x0 + dx / 2
                    while x < x1:
                        if dans(x, y, a):
                            k = batiment_en(x, y)
                            if k is not None:
                                compte[k] += 1
                        x += dx
                    y += dy
            memo[pid] = compte.most_common(1)[0][0] if compte else None
        return memo[pid]

    def batiment_proche(x, y):
        meilleur, dmin = None, DISTANCE_MAX
        i, j = int(x / CELL), int(y / CELL)
        vus = set()
        for di in (-1, 0, 1):
            for dj in (-1, 0, 1):
                for k in grille.get((i + di, j + dj), ()):
                    if k in vus:
                        continue
                    vus.add(k)
                    a = batiments[k][1]
                    d = min(distance_segment(x, y, *a[n - 1], *a[n]) for n in range(len(a)))
                    if d < dmin:
                        meilleur, dmin = k, d
        return meilleur

    print("Base Adresse Nationale…")
    rues, par_batiment = {}, defaultdict(list)
    total = parcelle = proche = 0
    lignes = csv.DictReader(io.StringIO(telecharger(BAN).decode("utf-8")), delimiter=";")
    for x in lignes:
        if x["code_insee"] != COMMUNE:
            continue
        total += 1
        m = ID_BAN.match(x["id"])
        if not m:
            continue
        rues[m.group(1)] = x["nom_voie"]
        k = None
        for pid in filter(None, x["cad_parcelles"].split("|")):
            k = batiment_de_parcelle(pid)
            if k is not None:
                break
        if k is not None:
            parcelle += 1
        else:
            k = batiment_proche(float(x["lon"]), float(x["lat"]))
            if k is None:
                continue
            proche += 1
        rep = x["rep"].lower()
        cle = (x["nom_voie"], int(x["numero"] or 0), rep)
        par_batiment[batiments[k][0]].append((cle, x["id"]))

    sortie = {
        "source": f"Base Adresse Nationale et cadastre (data.gouv.fr), le {date.today().isoformat()}",
        "rues": dict(sorted(rues.items())),
        "batiments": {b: [i for _, i in sorted(set(v))] for b, v in sorted(par_batiment.items())},
    }
    SORTIE.write_text(json.dumps(sortie, ensure_ascii=False, separators=(",", ":")), encoding="utf8")
    n = Counter(min(len(v), 5) for v in sortie["batiments"].values())
    print(f"{total} adresses : {parcelle} par la parcelle, {proche} par proximité, {total - parcelle - proche} sans bâtiment")
    print(f"{len(sortie['batiments'])} bâtiments avec adresse ; nombre d'adresses : {sorted(n.items())} (5 = 5 et plus)")
    print(f"{SORTIE.name} : {SORTIE.stat().st_size // 1024} Ko")


if __name__ == "__main__":
    main()
