"""Nombre de boîtes aux lettres par bâtiment, d'après le registre des copropriétés.

Produit public/bal-15e.json :
  - « registre » : pour chaque bâtiment rattaché à une ou plusieurs copropriétés du
    Registre national d'immatriculation des copropriétés (ANAH, data.gouv.fr), le
    nombre de lots à usage d'habitation, les numéros d'immatriculation, le nom
    d'usage et l'adresse de référence ;
  - « estimation » : pour les autres bâtiments d'habitation, une estimation
    surface au sol × nombre d'étages, calibrée sur les bâtiments du registre.

Les saisies faites dans l'appli (colonne prospections.bal) restent prioritaires.

Usage (à relancer pour mettre à jour, sans dépendance) :
    python scripts/donnees-bal.py
"""

import csv
import io
import json
import math
import statistics
import urllib.request
from collections import defaultdict
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BATIMENTS = ROOT / "public" / "batiments-15e.geojson"
SORTIE = ROOT / "public" / "bal-15e.json"
COMMUNE = "75115"  # Paris 15e
DATASET = "https://www.data.gouv.fr/api/1/datasets/registre-national-dimmatriculation-des-coproprietes/"
DISTANCE_MAX = 25  # m : rattachement à un bâtiment voisin si le point n'est dans aucun
CELL = 0.0005
M_PAR_DEG = 111320
COS = math.cos(math.radians(48.84))

# Types OSM pour lesquels une estimation de logements a un sens.
HABITATION = {"yes", "apartments", "residential", "house", "terrace", "dormitory", "detached", "semidetached_house"}
# « yes » est un bâtiment générique : bureaux, équipements et halls en font
# souvent partie. On l'estime seulement s'il est anonyme et de taille courante,
# avec un plafond.
GENERIQUE_AIRE_MAX = 2500  # m² au sol
GENERIQUE_PLAFOND = 150  # logements


def fichier_le_plus_recent():
    """URL du dernier fichier complet du registre (actualisation quotidienne)."""
    with urllib.request.urlopen(DATASET, timeout=60) as r:
        ressources = json.load(r)["resources"]
    csvs = [x for x in ressources if x.get("format") == "csv" and (x.get("filesize") or 0) > 100_000_000]
    csvs.sort(key=lambda x: x.get("last_modified") or x.get("created_at"), reverse=True)
    return csvs[0]["url"], (csvs[0].get("last_modified") or "")[:10]


def coproprietes(url):
    """Copropriétés de la commune, lues au fil du téléchargement (~400 Mo)."""
    req = urllib.request.Request(url, headers={"User-Agent": "carte-prospection (extraction 15e)"})
    with urllib.request.urlopen(req, timeout=900) as r:
        lignes = csv.DictReader(io.TextIOWrapper(r, encoding="utf-8", errors="replace", newline=""))
        return [x for x in lignes if x.get("commune") == COMMUNE and x.get("latitude") and x.get("longitude")]


def aire(anneau):
    a = 0.0
    for i in range(len(anneau)):
        (x1, y1), (x2, y2) = anneau[i - 1], anneau[i]
        a += (x1 * COS * M_PAR_DEG) * (y2 * M_PAR_DEG) - (x2 * COS * M_PAR_DEG) * (y1 * M_PAR_DEG)
    return abs(a) / 2


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


def main():
    batiments = json.load(open(BATIMENTS, encoding="utf8"))["features"]
    anneaux, grille, infos = [], defaultdict(list), {}
    for f in batiments:
        g = f["geometry"]
        rings = [g["coordinates"][0]] if g["type"] == "Polygon" else [p[0] for p in g["coordinates"]] if g["type"] == "MultiPolygon" else []
        if not rings:
            continue
        p = f["properties"]
        try:
            etages = float(str(p.get("building:levels", "")).split(";")[0].replace(",", ".")) or None
        except ValueError:
            etages = None
        infos[f["id"]] = {"aire": sum(aire(r) for r in rings), "etages": etages, "type": p.get("building", "yes"), "nom": p.get("name")}
        for ring in rings:
            xs, ys = [q[0] for q in ring], [q[1] for q in ring]
            i = len(anneaux)
            anneaux.append((f["id"], ring, min(xs), min(ys), max(xs), max(ys)))
            for a in range(int(min(ys) / CELL), int(max(ys) / CELL) + 1):
                for b in range(int(min(xs) / CELL), int(max(xs) / CELL) + 1):
                    grille[(a, b)].append(i)

    url, maj = fichier_le_plus_recent()
    print("Registre :", url)
    copros = coproprietes(url)
    print(len(copros), "copropriétés dans la commune", COMMUNE)

    # Rattachement : bâtiment qui contient le point, sinon le plus proche (≤ 25 m).
    par_batiment = defaultdict(list)
    sans = 0
    for c in copros:
        x, y = float(c["longitude"]), float(c["latitude"])
        ci, cj = int(y / CELL), int(x / CELL)
        cands = {k for di in (-1, 0, 1) for dj in (-1, 0, 1) for k in grille.get((ci + di, cj + dj), [])}
        trouve, inside = None, False
        for k in cands:
            bid, ring, x0, y0, x1, y1 = anneaux[k]
            if x0 <= x <= x1 and y0 <= y <= y1 and dans(x, y, ring):
                trouve, inside = bid, True
                break
        if not trouve:
            meilleur = None
            for k in cands:
                bid, ring, *_ = anneaux[k]
                d = min(distance_segment(x, y, *ring[i - 1], *ring[i]) for i in range(len(ring)))
                if meilleur is None or d < meilleur[1]:
                    meilleur = (bid, d)
            if meilleur and meilleur[1] <= DISTANCE_MAX:
                trouve = meilleur[0]
        if trouve:
            par_batiment[trouve].append((c, inside))
        else:
            sans += 1

    registre = {}
    for bid, liste in par_batiment.items():
        lots = sum(int(c["nombre_lots_habitation"] or 0) for c, _ in liste)
        if lots == 0:
            continue
        registre[bid] = [
            lots,
            ", ".join(c["numero_immatriculation"] for c, _ in liste),
            " / ".join(dict.fromkeys(c["nom_usage_copropriete"].strip() for c, _ in liste if c["nom_usage_copropriete"].strip())),
            liste[0][0]["numero_voie_adresse"].strip().lower(),
        ]

    # Calibration : logements par m² de plancher, sur les bâtiments à une seule copropriété.
    etages_connus = [i["etages"] for i in infos.values() if i["etages"]]
    etages_median = statistics.median(etages_connus)
    ratios = []
    for bid, liste in par_batiment.items():
        info = infos.get(bid)
        if not info or len(liste) != 1 or not liste[0][1] or info["aire"] < 30:
            continue
        lots = int(liste[0][0]["nombre_lots_habitation"] or 0)
        if lots:
            ratios.append(lots / (info["aire"] * (info["etages"] or etages_median)))
    k = statistics.median(ratios)

    estimation = {}
    for bid, info in infos.items():
        if bid in registre or info["type"] not in HABITATION or info["aire"] < 40:
            continue
        generique = info["type"] == "yes"
        if generique and (info["nom"] or info["aire"] > GENERIQUE_AIRE_MAX):
            continue  # bâtiment nommé ou très grand : bureaux, équipement, hall…
        n = round(info["aire"] * (info["etages"] or etages_median) * k)
        if generique:
            n = min(n, GENERIQUE_PLAFOND)
        if n > 0:
            estimation[bid] = n

    json.dump(
        {
            "source": f"Registre national d'immatriculation des copropriétés (ANAH, data.gouv.fr), mis à jour le {maj}",
            "genere_le": date.today().isoformat(),
            "m2_par_logement": round(1 / k),
            "registre": registre,
            "estimation": estimation,
        },
        open(SORTIE, "w", encoding="utf8"),
        separators=(",", ":"),
        ensure_ascii=False,
    )
    print(f"{len(registre)} bâtiments avec registre, {len(estimation)} estimés "
          f"(1 logement pour {round(1 / k)} m² de plancher), {sans} copropriétés non rattachées")
    print("Écrit :", SORTIE, SORTIE.stat().st_size // 1024, "Ko")


if __name__ == "__main__":
    main()
