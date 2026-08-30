#!/usr/bin/env python3
"""
Adaptador de la eBay Browse API para el modulo de gradeadas.

Dos modos, decididos por la presencia de credenciales:

  REAL      EBAY_APP_ID y EBAY_CERT_ID en el entorno (o pasados al constructor).
            La peticion queda CONSTRUIDA y lista: OAuth client-credentials contra
            /identity/v1/oauth2/token y busqueda paginada contra
            /buy/browse/v1/item_summary/search. Cuando llegue la aprobacion de la
            llave basta exportar las dos variables: mismo codigo, cero cambios.

  SIMULADO  Sin credenciales lee fixtures JSON con la MISMA forma que la
            respuesta de la Browse API (tests/fixtures/graded/browse_<slug>.json)
            y lo anuncia claramente por stderr. Todo lo demas (normalizacion,
            esquema, inferencia) es identico en ambos modos: el dia que la llave
            llegue no hay "modo test" que desmontar.

La normalizacion produce dicts con las claves de graded_listings +
listing_observations (services/graded/schema.sql). La resolucion
titulo -> instrumento es un subproyecto aparte (PLAN.md seccion 9): aqui
instrument_key viene de la consulta que genero la busqueda, NO se deduce del
titulo libre.

parse_title() extrae (gradeadora, grado) del titulo de forma CONSERVADORA: ante
cualquier ambiguedad devuelve (None, None). Es preferible perder cobertura a
contaminar la serie de PSA 10 con un lote mixto, un slab de imitacion o un
listing sobre el pop report.
"""

import base64
import json
import os
import re
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
PROJ = os.path.abspath(os.path.join(HERE, "..", ".."))
DEFAULT_FIXTURES = os.path.join(PROJ, "tests", "fixtures", "graded")

# --- Constantes de la Browse API ---------------------------------------------
OAUTH_TOKEN_URL = "https://api.ebay.com/identity/v1/oauth2/token"
OAUTH_SCOPE = "https://api.ebay.com/oauth/api_scope"   # scope basico: suficiente para Browse
BROWSE_SEARCH_URL = "https://api.ebay.com/buy/browse/v1/item_summary/search"
MARKETPLACE_ID = "EBAY_US"       # el mercado graded liquido es el americano (USD)
CATEGORY_CCG_SINGLES = "183454"  # CCG Individual Cards: filtra sobres, lotes de juego, etc.
PAGE_LIMIT = 200                 # maximo por pagina que permite item_summary/search
MAX_PAGES = 25                   # tope defensivo: 25*200 = 5000 items por consulta;
                                 # la cuota gratuita es ~5000 llamadas/DIA (PLAN.md 3.2)

# --- Parser de titulos --------------------------------------------------------
GRADERS = ("PSA", "BGS", "CGC", "SGC")

# Gradeadora como token: delante \b, detras cualquier cosa que no sea letra,
# para tolerar "PSA10" (pegado) y "PSA-10" ademas de "PSA 10".
_GRADER_RE = re.compile(r"\b(PSA|BGS|CGC|SGC)(?![A-Z])")

# Negaciones en las 3 palabras previas: "not PSA graded", "no PSA", "non PSA",
# "not graded by PSA". EXCEPTO cuando la negacion se consume en una frase hecha
# que no niega el gradeo: "No Reserve PSA 10" es una subasta legitima.
_NEGATION = {"NOT", "NO", "NON", "NEVER", "UNGRADED", "ISNT", "ISN'T", "WITHOUT"}
_NEG_CONSUMED_BY = {"RESERVE", "RESERVES", "RETURNS", "REFUNDS"}

# Lotes y multiplicadores: "lot of 3 PSA 10", "bundle", "2x PSA 10". Un solo
# grado mencionado pero VARIAS cartas: el precio es del lote, no de una carta,
# y colarlo contaminaria la serie igual que un slab de imitacion.
_LOT_RE = re.compile(r"\b(LOTS?|BUNDLE|SET OF \d{1,2}|\d+\s?X|X\d+)\b")

# Imitaciones justo despues de la gradeadora: "PSA-style", "PSA like", "PSA type".
_STYLE_RE = re.compile(r"^[\s\-]*(STYLE|LIKE|TYPE|LOOK|LOOKING|QUALITY|EQUIVALENT|COPY|REPLICA|CUSTOM)\b")

# Grado: separadores opcionales, hasta 3 palabras de relleno toleradas
# ("PSA GEM MINT 10", "BGS graded 9.5"), y el numero 1..10 en pasos de 0.5.
# El (?!\.\d) rechaza "10.5" y similares: no existen como grado.
_GRADE_RE = re.compile(
    r"^[\s\-:#]*(?:(?:GEM|MINT|MT|GRADE|GRADED)[\s\-]+){0,3}(10|[1-9](?:\.5)?)\b(?!\.\d)"
)


def parse_title(title):
    """(grader, grade) extraidos del titulo libre, o (None, None).

    CONSERVADOR por diseno: devuelve (None, None) ante negaciones ("not PSA
    graded"), imitaciones ("PSA-style"), listings sobre el pop report, menciones
    de varias gradeadoras o de varios grados, gradeadora sin grado y grados
    invalidos. Jamas adivina: un None honesto se filtra aguas abajo, un valor
    inventado envenena la serie.
    """
    if not title:
        return None, None
    up = re.sub(r"\s+", " ", str(title).upper()).strip()
    # Listings SOBRE el pop report (guias, informes): el numero que acompana a
    # "PSA" no es el grado de una carta en venta.
    if "POP REPORT" in up:
        return None, None
    # Lotes/bundles/multiplicadores: aunque haya un unico grado, el precio no es
    # el de UNA carta. Conservador: fuera.
    if _LOT_RE.search(up):
        return None, None
    candidates = []
    for m in _GRADER_RE.finditer(up):
        before_tokens = re.findall(r"[A-Z0-9']+", up[: m.start()])[-3:]
        for i, tok in enumerate(before_tokens):
            if tok in _NEGATION:
                nxt = before_tokens[i + 1] if i + 1 < len(before_tokens) else None
                if nxt not in _NEG_CONSUMED_BY:
                    return None, None
        rest = up[m.end():]
        if _STYLE_RE.match(rest):
            return None, None
        gm = _GRADE_RE.match(rest)
        candidates.append((m.group(1), float(gm.group(1)) if gm else None))
    if not candidates:
        return None, None
    graders = {g for g, _ in candidates}
    grades = {gr for _, gr in candidates if gr is not None}
    # Varias gradeadoras (lote/crossover), varios grados (lote) o ninguna
    # mencion con grado: ambiguo, no se adivina.
    if len(graders) != 1 or len(grades) != 1:
        return None, None
    return graders.pop(), grades.pop()


def _slug(query):
    return re.sub(r"[^a-z0-9]+", "_", str(query).lower()).strip("_")


def _money(block):
    """(valor float, divisa) de un bloque {'value': '432.00', 'currency': 'USD'}."""
    if not block or block.get("value") in (None, ""):
        return None, None
    try:
        return float(block["value"]), block.get("currency")
    except (TypeError, ValueError):
        return None, None


class EbayBrowseSource:
    """Fuente de listings gradeadas: Browse API real o fixtures, misma salida."""

    def __init__(self, app_id=None, cert_id=None, fixtures_dir=None, verbose=True):
        self.app_id = app_id if app_id is not None else os.environ.get("EBAY_APP_ID")
        self.cert_id = cert_id if cert_id is not None else os.environ.get("EBAY_CERT_ID")
        self.fixtures_dir = fixtures_dir or DEFAULT_FIXTURES
        self.mode = "real" if (self.app_id and self.cert_id) else "fixtures"
        if verbose and self.mode == "fixtures":
            print(
                "[graded/ebay_source] SIN credenciales eBay (EBAY_APP_ID/EBAY_CERT_ID): "
                "MODO SIMULADO, leyendo fixtures de %s. Cuando llegue la llave, basta "
                "exportar las variables: este mismo codigo pasa a la Browse API real."
                % self.fixtures_dir,
                file=sys.stderr,
            )

    # --- Modo real: la peticion queda construida y lista -----------------------
    def _build_token_request(self):
        """POST OAuth client-credentials. Basic auth = base64(app_id:cert_id)."""
        basic = base64.b64encode(
            ("%s:%s" % (self.app_id, self.cert_id)).encode("utf-8")
        ).decode("ascii")
        body = urllib.parse.urlencode(
            {"grant_type": "client_credentials", "scope": OAUTH_SCOPE}
        ).encode("ascii")
        return urllib.request.Request(
            OAUTH_TOKEN_URL,
            data=body,
            headers={
                "Authorization": "Basic " + basic,
                "Content-Type": "application/x-www-form-urlencoded",
            },
            method="POST",
        )

    def _build_search_request(self, token, query, offset=0):
        """GET item_summary/search paginado, acotado a cartas CCG sueltas."""
        params = urllib.parse.urlencode(
            {
                "q": query,
                "category_ids": CATEGORY_CCG_SINGLES,
                "limit": PAGE_LIMIT,
                "offset": offset,
            }
        )
        return urllib.request.Request(
            BROWSE_SEARCH_URL + "?" + params,
            headers={
                "Authorization": "Bearer " + token,
                "X-EBAY-C-MARKETPLACE-ID": MARKETPLACE_ID,
                "Accept": "application/json",
            },
            method="GET",
        )

    def _fetch_real(self, query):
        """Paginacion completa contra la Browse API. Solo corre con credenciales."""
        with urllib.request.urlopen(self._build_token_request()) as resp:
            token = json.load(resp)["access_token"]
        items, offset = [], 0
        for _ in range(MAX_PAGES):
            req = self._build_search_request(token, query, offset)
            with urllib.request.urlopen(req) as resp:
                page = json.load(resp)
            items.extend(page.get("itemSummaries") or [])
            total = int(page.get("total") or 0)
            offset += PAGE_LIMIT
            if offset >= total:
                break
        return items

    # --- Modo simulado ----------------------------------------------------------
    def _fetch_fixtures(self, query):
        path = os.path.join(self.fixtures_dir, "browse_%s.json" % _slug(query))
        if not os.path.exists(path):
            have = sorted(
                f for f in os.listdir(self.fixtures_dir) if f.startswith("browse_")
            ) if os.path.isdir(self.fixtures_dir) else []
            raise FileNotFoundError(
                "Modo simulado: no existe fixture %s para la consulta %r. "
                "Fixtures disponibles: %s" % (path, query, have)
            )
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f).get("itemSummaries") or []

    # --- API publica ------------------------------------------------------------
    def fetch_listings(self, query, instrument_key=None, observed_at=None):
        """Listings normalizados para la consulta. Misma salida en ambos modos."""
        raw = self._fetch_real(query) if self.mode == "real" else self._fetch_fixtures(query)
        observed_at = observed_at or datetime.now(timezone.utc).strftime("%Y-%m-%d")
        return [self.normalize(it, instrument_key, observed_at) for it in raw]

    def normalize(self, item, instrument_key=None, observed_at=None):
        """itemSummary de la Browse API -> dict con las claves del esquema.

        Para subastas el precio relevante es currentBidPrice (la puja mas alta);
        'price' en la API es el precio de salida y NO es un precio de mercado.
        """
        title = item.get("title") or ""
        grader, grade = parse_title(title)
        buying = item.get("buyingOptions") or []
        is_auction = 1 if "AUCTION" in buying else 0
        price, currency = _money(item.get("currentBidPrice")) if is_auction else (None, None)
        if price is None:
            price, currency = _money(item.get("price"))
        quantity = None
        avail = item.get("estimatedAvailabilities") or []
        if avail:
            quantity = avail[0].get("estimatedAvailableQuantity")
        return {
            "listing_id": item.get("itemId"),
            "source": "ebay" if self.mode == "real" else "fixture",
            "instrument_key": instrument_key,
            "title": title,
            "grader": grader,
            "grade": grade,
            "price": price,
            "currency": currency,
            "is_auction": is_auction,
            "bid_count": item.get("bidCount"),
            "quantity": quantity,
            "seller": (item.get("seller") or {}).get("username"),
            "observed_at": observed_at,
            "status": "active",  # item_summary/search solo devuelve listings vivos
        }


# --- Proyecciones al esquema (el upsert real es cosa del cargador) -------------
def to_listing_row(n):
    """Dict normalizado -> fila de graded_listings (primera vez que se ve)."""
    return {
        "listing_id": n["listing_id"], "source": n["source"],
        "instrument_key": n["instrument_key"], "title": n["title"],
        "grader": n["grader"], "grade": n["grade"], "price": n["price"],
        "currency": n["currency"], "is_auction": n["is_auction"],
        "bid_count": n["bid_count"], "quantity": n["quantity"],
        "seller": n["seller"], "first_seen": n["observed_at"],
        "last_seen": n["observed_at"], "last_status": n["status"],
    }


def to_observation_row(n):
    """Dict normalizado -> fila de listing_observations."""
    return {
        "listing_id": n["listing_id"], "source": n["source"],
        "observed_at": n["observed_at"],
        "price": n["price"], "bid_count": n["bid_count"],
        "quantity": n["quantity"], "status": n["status"],
    }
