"""Build offline regional outlines from Natural Earth v5.1.2 (public domain).

Usage: python3 scripts/build-atlas-regions.py path/to/ne_10m_admin_1_states_provinces.geojson
Upstream: https://github.com/nvkelso/natural-earth-vector/tree/v5.1.2/geojson
Terms: https://www.naturalearthdata.com/about/terms-of-use/
The outlines are generalized for navigation, not designation or legal boundaries.
"""

import json
import math
import sys
from collections import defaultdict
from pathlib import Path


# The source records departments/provinces in these countries. Group them by
# their parent region, using stable IDs instead of translated labels as keys.
GROUPS = {
    "IT": {
        "Abruzzo": ("65", "Абруццо"), "Apulia": ("75", "Апулия"),
        "Basilicata": ("77", "Базиликата"), "Calabria": ("78", "Калабрия"),
        "Campania": ("72", "Кампания"), "Emilia-Romagna": ("45", "Эмилия-Романья"),
        "Friuli-Venezia Giulia": ("36", "Фриули — Венеция-Джулия"),
        "Lazio": ("62", "Лацио"), "Liguria": ("42", "Лигурия"),
        "Lombardia": ("25", "Ломбардия"), "Marche": ("57", "Марке"),
        "Molise": ("67", "Молизе"), "Piemonte": ("21", "Пьемонт"),
        "Sardegna": ("88", "Сардиния"), "Sicily": ("82", "Сицилия"),
        "Toscana": ("52", "Тоскана"), "Trentino-Alto Adige": ("32", "Трентино — Альто-Адидже"),
        "Umbria": ("55", "Умбрия"), "Valle d'Aosta": ("23", "Валле-д’Аоста"),
        "Veneto": ("34", "Венето"),
    },
    "FR": {
        "Auvergne-Rhône-Alpes": ("ARA", "Овернь — Рона — Альпы"),
        "Bourgogne-Franche-Comté": ("BFC", "Бургундия — Франш-Конте"),
        "Bretagne": ("BRE", "Бретань"), "Centre-Val de Loire": ("CVL", "Центр — Долина Луары"),
        "Corse": ("COR", "Корсика"), "Grand Est": ("GES", "Гранд-Эст"),
        "Hauts-de-France": ("HDF", "О-де-Франс"), "Île-de-France": ("IDF", "Иль-де-Франс"),
        "Normandie": ("NOR", "Нормандия"), "Nouvelle-Aquitaine": ("NAQ", "Новая Аквитания"),
        "Occitanie": ("OCC", "Окситания"), "Pays de la Loire": ("PDL", "Пеи-де-ла-Луар"),
        "Provence-Alpes-Côte-d'Azur": ("PAC", "Прованс — Альпы — Лазурный Берег"),
    },
    "ES": {
        "Andalucía": ("AN", "Андалусия"), "Aragón": ("AR", "Арагон"),
        "Asturias": ("AS", "Астурия"), "Canary Is.": ("CN", "Канарские острова"),
        "Cantabria": ("CB", "Кантабрия"), "Castilla-La Mancha": ("CM", "Кастилия — Ла-Манча"),
        "Castilla y León": ("CL", "Кастилия и Леон"), "Cataluña": ("CT", "Каталония"),
        "Ceuta": ("CE", "Сеута"), "Extremadura": ("EX", "Эстремадура"),
        "Foral de Navarra": ("NC", "Наварра"), "Galicia": ("GA", "Галисия"),
        "Islas Baleares": ("IB", "Балеарские острова"), "La Rioja": ("RI", "Риоха"),
        "Madrid": ("MD", "Мадрид"), "Melilla": ("ML", "Мелилья"),
        "Murcia": ("MC", "Мурсия"), "País Vasco": ("PV", "Страна Басков"),
        "Valenciana": ("VC", "Валенсия"),
    },
}

COUNTRIES = {"IT", "FR", "ES", "NL", "CH", "DE", "AT", "GR", "PT", "GB"}
UK_AREAS = {
    "England": ("ENG", "Англия"), "Scotland": ("SCT", "Шотландия"),
    "Wales": ("WLS", "Уэльс"), "Northern Ireland": ("NIR", "Северная Ирландия"),
}


def simplify_open(points, tolerance):
    """Douglas–Peucker on a line with a bounded, iterative work stack."""
    keep = {0, len(points) - 1}
    pending = [(0, len(points) - 1)]
    while pending:
        start, end = pending.pop()
        a, b = points[start], points[end]
        dx, dy = b[0] - a[0], b[1] - a[1]
        length = dx * dx + dy * dy
        farthest = tolerance * tolerance
        split = None
        for i in range(start + 1, end):
            px, py = points[i][0] - a[0], points[i][1] - a[1]
            t = min(1, max(0, (px * dx + py * dy) / length)) if length else 0
            distance = (px - dx * t) ** 2 + (py - dy * t) ** 2
            if distance > farthest:
                split, farthest = i, distance
        if split is not None:
            keep.add(split)
            pending.extend(((start, split), (split, end)))
    return [points[i] for i in sorted(keep)]


def simplify_ring(ring):
    points = ring[:-1]
    if len(points) < 3:
        return None
    # Split a closed ring into two open arcs before simplification.
    a = min(range(len(points)), key=lambda i: tuple(points[i]))
    points = points[a:] + points[:a]
    b = max(range(1, len(points)), key=lambda i: math.dist(points[0], points[i]))
    fitted = simplify_open(points[:b + 1], 0.012)[:-1] + simplify_open(points[b:] + points[:1], 0.012)
    if len(fitted) < 4:
        fitted = points + points[:1]
    rounded = [[round(x, 4), round(y, 4)] for x, y in fitted]
    return rounded if len({tuple(p) for p in rounded}) >= 3 else None


def area(ring):
    return abs(sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(ring, ring[1:]))) / 2


def region_key(country, props):
    if country == "FR" and props["type_en"] != "Metropolitan department":
        return None
    if country == "NL" and props["type_en"] != "Province":
        return None
    if country in GROUPS:
        code, label = GROUPS[country][props["region"]]
        return f"{country}-{code}", label
    if country == "GB":
        code, label = UK_AREAS[props["geonunit"]]
        return f"{country}-{code}", label
    return props["adm1_code"], props["name_ru"] or props["name"]


def build(source):
    countries = defaultdict(lambda: defaultdict(list))
    for feature in json.loads(source.read_text(encoding="utf-8"))["features"]:
        props = feature["properties"]
        country = props["iso_a2"]
        if country not in COUNTRIES:
            continue
        key = region_key(country, props)
        if not key:
            continue
        geometry = feature["geometry"]
        polygons = geometry["coordinates"] if geometry["type"] == "MultiPolygon" else [geometry["coordinates"]]
        for polygon in polygons:
            # Keep the largest landmass even for small districts, and omit
            # insignificant coastal islets before shipping the vector data.
            if area(polygon[0]) < 0.001 and polygon != max(polygons, key=lambda p: area(p[0])):
                continue
            outer = simplify_ring(polygon[0])
            if outer:
                holes = [fitted for ring in polygon[1:] if area(ring) >= 0.001 if (fitted := simplify_ring(ring))]
                countries[country][key].append([outer, *holes])
    target = Path(__file__).resolve().parents[1] / "client/public/editorial/regions-v1"
    target.mkdir(parents=True, exist_ok=True)
    expected = {"IT": 20, "FR": 13, "ES": 19, "NL": 12, "CH": 26, "DE": 16, "AT": 9, "GR": 14, "PT": 20, "GB": 4}
    assert {code: len(regions) for code, regions in countries.items()} == expected
    for country, regions in sorted(countries.items()):
        features = [
            {"type": "Feature", "properties": {"id": code, "name": label},
             "geometry": {"type": "MultiPolygon", "coordinates": polygons}}
            for (code, label), polygons in sorted(regions.items())
        ]
        output = {"type": "FeatureCollection", "features": features}
        (target / f"{country}.geojson").write_text(
            json.dumps(output, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8",
        )


if __name__ == "__main__":
    build(Path(sys.argv[1]))
