"""Logements sociaux par bâtiment, d'après le répertoire national (RPLS) et la Ville de Paris.

Produit public/social-15e.json : pour chaque bâtiment qui contient des
logements sociaux, [nombre de logements sociaux, catégorie, source, adresses] :
  - catégorie « social » : immeuble d'un bailleur social, hors cible de la
    prospection (grisé sur la carte) ;
  - catégorie « mixte » : copropriété où un bailleur possède quelques
    logements ; reste ciblée, la fiche l'indique ;
  - source « rpls » : répertoire des logements locatifs des bailleurs sociaux
    (SDES, data.gouv.fr), chaque logement à son adresse, au 1er janvier ;
  - source « paris » : logements sociaux financés à Paris (opendata.paris.fr),
    pour les acquisitions plus récentes que le répertoire ;
  - adresses : identifiants BAN des adresses du bâtiment qui ont des
    logements sociaux (utile pour un bloc mixte à plusieurs adresses).

Rattachement : par l'adresse (fichier public/adresses-15e.json), sinon par les
coordonnées du logement (dans le bâtiment).
Catégorie : un immeuble inscrit au registre des copropriétés est « mixte »,
sauf si les logements sociaux y sont presque tous les lots (≥ 80 %) ; un
immeuble hors registre est « social », sauf si l'estimation du nombre de
logements montre qu'ils n'en sont qu'une petite part (< 50 %).

Les choix faits dans l'appli (case « Logement social » de la fiche) restent
prioritaires.

À lancer après scripts/donnees-adresses.py et scripts/donnees-bal.py :
    python scripts/donnees-social.py
"""

import csv
import io
import json
import math
import re
import unicodedata
import urllib.request
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BATIMENTS = ROOT / "public" / "batiments-15e.geojson"
ADRESSES = ROOT / "public" / "adresses-15e.json"
BAL = ROOT / "public" / "bal-15e.json"
SORTIE = ROOT / "public" / "social-15e.json"
COMMUNE = "75115"  # Paris 15e
CODE_POSTAL = "75015"
RPLS = "https://data.statistiques.developpement-durable.gouv.fr/dido/api/v1/datafiles/f3c2f2cb-8fb1-40fd-8733-964247744c9a"
PARIS = "https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/logements-sociaux-finances-a-paris/exports/json"
CELL = 0.0005
ID_BAN = re.compile(r"^(.+)_(\d{5})(?:_([a-z0-9]+))?$")
REP = {"BIS": "B", "TER": "T", "QUATER": "Q"}


def lire(url):
    req = urllib.request.Request(url, headers={"User-Agent": "carte-prospection (logements sociaux 15e)"})
    with urllib.request.urlopen(req, timeout=600) as r:
        return r.read().decode("utf-8")


def norm(s):
    s = unicodedata.normalize("NFD", s or "").encode("ascii", "ignore").decode().upper()
    return " ".join(re.sub(r"[^A-Z0-9 ]", " ", s).split())


def lambert93(x, y):
    """Lambert-93 → (longitude, latitude) en degrés (RGF93 / GRS80)."""
    n, c, xs, ys, e = 0.7256077650532670, 11754255.426096, 700000, 12655612.049876, 0.08181919104281579
    lon = math.radians(3) + math.atan((x - xs) / (ys - y)) / n
    li = -math.log(math.hypot(x - xs, y - ys) / c) / n
    phi = 2 * math.atan(math.exp(li)) - math.pi / 2
    for _ in range(8):
        phi = 2 * math.atan(((1 + e * math.sin(phi)) / (1 - e * math.sin(phi))) ** (e / 2) * math.exp(li)) - math.pi / 2
    return math.degrees(lon), math.degrees(phi)


def dans(x, y, anneau):
    c = False
    for k in range(len(anneau)):
        (x1, y1), (x2, y2) = anneau[k], anneau[k - 1]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            c = not c
    return c


def main():
    # Bâtiments indexés par cellule de leur emprise.
    batiments, grille = [], defaultdict(list)
    for f in json.load(open(BATIMENTS, encoding="utf8"))["features"]:
        g = f["geometry"]
        anneaux = [g["coordinates"][0]] if g["type"] == "Polygon" else [p[0] for p in g["coordinates"]] if g["type"] == "MultiPolygon" else []
        for a in anneaux:
            b = (min(p[0] for p in a), min(p[1] for p in a), max(p[0] for p in a), max(p[1] for p in a))
            batiments.append((f.get("id") or f["properties"]["@id"], a, b))
            for i in range(int(b[0] / CELL), int(b[2] / CELL) + 1):
                for j in range(int(b[1] / CELL), int(b[3] / CELL) + 1):
                    grille[(i, j)].append(len(batiments) - 1)

    def batiment_en(lng, lat):
        for k in grille.get((int(lng / CELL), int(lat / CELL)), ()):
            bid, a, b = batiments[k]
            if b[0] <= lng <= b[2] and b[1] <= lat <= b[3] and dans(lng, lat, a):
                return bid
        return None

    # Adresse normalisée → bâtiment.
    adresses = json.load(open(ADRESSES, encoding="utf8"))
    par_adresse = {}
    for bid, ids in adresses["batiments"].items():
        for i in ids:
            m = ID_BAN.match(i)
            par_adresse[(norm(adresses["rues"][m.group(1)]), int(m.group(2)), (m.group(3) or "").upper())] = (bid, i)

    # ─── Répertoire national (un enregistrement par logement) ───
    print("Répertoire des logements sociaux (RPLS)…")
    millesime = json.loads(lire(RPLS))["millesime"]
    colonnes = "NUMVOIE,INDREP,TYPVOIE,NOMVOIE,X,Y"
    texte = lire(f"{RPLS}/csv?millesime={millesime}&withColumnName=true&withColumnDescription=false&withColumnUnit=false&DEPCOM=eq:{COMMUNE}&columns={colonnes}")
    logements = Counter()  # (rue, numéro, suffixe) → logements
    points = {}
    for x in csv.DictReader(io.StringIO(texte), delimiter=";"):
        rep = (x["INDREP"] or "").upper()
        cle = (norm(f"{x['TYPVOIE']} {x['NOMVOIE']}"), int(x["NUMVOIE"]) if x["NUMVOIE"].isdigit() else None, REP.get(rep, rep))
        logements[cle] += 1
        if x["X"] and x["Y"]:
            points[cle] = lambert93(float(x["X"]), float(x["Y"]))

    sociaux, sources, ban = Counter(), {}, defaultdict(set)
    par_adresse_ok = par_point = perdus = 0
    for cle, n in logements.items():
        trouve = par_adresse.get(cle) or par_adresse.get((cle[0], cle[1], ""))
        bid = trouve and trouve[0]
        if trouve:
            par_adresse_ok += n
            ban[bid].add(trouve[1])
        elif cle in points and (bid := batiment_en(*points[cle])):
            par_point += n
        else:
            perdus += n
            continue
        sociaux[bid] += n
        sources[bid] = "rpls"

    # ─── Ville de Paris : acquisitions récentes absentes du répertoire ───
    print("Logements sociaux financés à Paris…")
    paris = json.loads(lire(f'{PARIS}?where=code_postal%3D%22{CODE_POSTAL}%22'))
    recents = 0
    for p in paris:
        acquisition = (p.get("mode_real") or "").startswith("acquisition")
        if not acquisition or not p.get("geo_point_2d") or not p.get("nb_logmt_total"):
            continue  # constructions neuves : déjà dans le répertoire une fois livrées
        bid = batiment_en(p["geo_point_2d"]["lon"], p["geo_point_2d"]["lat"])
        if bid and bid not in sources:
            sociaux[bid] += p["nb_logmt_total"]
            sources[bid] = "paris"
            recents += 1

    # ─── Catégorie ───
    bal = json.load(open(BAL, encoding="utf8"))
    sortie = {}
    for bid, n in sociaux.items():
        registre = bal["registre"].get(bid)
        estimation = bal["estimation"].get(bid)
        if registre:
            categorie = "social" if n >= 0.8 * registre[0] else "mixte"
        else:
            categorie = "mixte" if estimation and n < 0.5 * estimation else "social"
        sortie[bid] = [n, categorie, sources[bid], sorted(ban[bid])]

    total = par_adresse_ok + par_point + perdus
    SORTIE.write_text(
        json.dumps(
            {
                "source": f"Répertoire des logements locatifs des bailleurs sociaux au {millesime} (SDES) et logements sociaux financés à Paris (Ville de Paris), le {date.today().isoformat()}",
                "batiments": dict(sorted(sortie.items())),
            },
            ensure_ascii=False,
            separators=(",", ":"),
        ),
        encoding="utf8",
    )
    cat = Counter(v[1] for v in sortie.values())
    print(f"{total} logements sociaux : {par_adresse_ok} rattachés par l'adresse, {par_point} par les coordonnées, {perdus} sans bâtiment")
    print(f"{recents} acquisitions récentes de la Ville de Paris ajoutées")
    print(f"{len(sortie)} bâtiments : {cat['social']} sociaux (hors cible), {cat['mixte']} copropriétés mixtes")
    print(f"{SORTIE.name} : {SORTIE.stat().st_size // 1024} Ko")


if __name__ == "__main__":
    main()
