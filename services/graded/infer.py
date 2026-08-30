#!/usr/bin/env python3
"""
Motor de inferencia de ventas por ciclo de vida de listing (PLAN.md seccion 5).

eBay cerro su API de ventas cerradas y scrapear "sold" viola sus ToS, asi que la
venta no se OBSERVA: se INFIERE del historico diario de cada listing activo.
Dado el historico de observaciones, al desaparecer un listing se clasifica:

  subasta terminada con pujas          -> venta CONFIRMADA al precio final (alta)
  subasta sin pujas                    -> no vendido (no genera venta)
  precio fijo que desaparece y NO
    reaparece en la ventana            -> venta PROBABLE ~ ultimo ask (media)
  reaparicion (mismo vendedor, titulo
    similar, precio parecido)          -> relistado, no venta
  bajadas progresivas y desaparicion   -> venta con Best Offer estimada =
                                          ultimo ask x factor de descuento (baja)
  decremento de cantidad en multiple   -> venta parcial CONFIRMADA (alta),
                                          incluso con el listing aun vivo

Cada venta inferida lleva method, confidence en [0,1] y detail con la evidencia
completa, de forma que pueda re-puntuarse o descartarse a posteriori.

ADVERTENCIA DE CALIBRACION: todos los umbrales y confianzas de este modulo estan
SIN CALIBRAR. Son valores razonables a ojo, pendientes de ajustar contra la
muestra de ventas reales de Terapeak (PLAN.md, "calibracion contra verdad de
campo": que % de desapariciones son ventas, que descuento medio aplica Best
Offer). Hasta entonces las confianzas son ORDINALES (alta > media > baja), no
probabilidades medidas, y el factor de descuento es una suposicion declarada.
"""

import difflib
import json
from dataclasses import dataclass
from datetime import date, timedelta

# --- Parametros del estimador --------------------------------------------------
# TODOS SIN CALIBRAR hasta que exista la muestra de Terapeak. Cada uno con nombre
# para que la calibracion sea un cambio de constantes, no de codigo.

# Dias sin reaparecer para dar una desaparicion de precio fijo por venta probable.
# Viene de la heuristica de PLAN.md ("14 dias"); Terapeak dira la ventana real.
RELIST_WINDOW_DAYS = 14

# Umbral difflib.SequenceMatcher para considerar dos titulos "el mismo objeto"
# al buscar relistados. 0.90 tolera puntuacion y emojis anadidos, no otra carta.
TITLE_SIMILARITY_MIN = 0.90

# Tolerancia relativa de precio para el relistado ("precio parecido"). Los
# relistados suelen repetir o subir un poco el ask; 15% es una conjetura.
RELIST_PRICE_TOLERANCE = 0.15

# Factor precio_estimado = ultimo_ask * factor cuando se infiere Best Offer.
# ES EL PARAMETRO MAS DUDOSO DEL MODULO: el descuento medio real de Best Offer
# solo se conocera midiendo la muestra de Terapeak. Se declara en detail de cada
# venta que lo use.
BEST_OFFER_DISCOUNT = 0.90

# Numero minimo de bajadas de precio consecutivas para leer "vendedor negociando"
# y activar la rama Best Offer en vez de la de precio fijo simple.
MIN_PROGRESSIVE_DROPS = 2

# Confianzas por metodo, en [0,1]. ORDINALES hasta calibrar: alta > media > baja.
CONF_AUCTION = 0.95           # fin de subasta con pujas: el mecanismo garantiza venta
CONF_QTY_DECREMENT = 0.90     # decremento de stock: evento estructural, casi inequivoco
CONF_FIXED_DISAPPEARED = 0.60 # desaparicion sin relistado: pudo retirarse sin vender
CONF_BEST_OFFER = 0.35        # ademas de lo anterior, el precio final es una estimacion

# Metodos (valores de inferred_sales.method).
METHOD_AUCTION = "auction_confirmed"
METHOD_FIXED = "fixed_disappeared"
METHOD_BEST_OFFER = "best_offer_estimated"
METHOD_QTY = "quantity_decrement"

# Desenlaces de la clasificacion (no todos generan venta).
OUT_ACTIVE = "active"                 # sigue vivo a fecha as_of
OUT_PENDING = "pending_window"        # desaparecido, pero la ventana de relistado no vencio
OUT_SALE_CONFIRMED = "sale_confirmed" # subasta con pujas
OUT_NOT_SOLD = "not_sold"             # subasta sin pujas
OUT_RELISTED = "relisted"             # reaparecido: no venta
OUT_SALE_PROBABLE = "sale_probable"   # fijo desaparecido sin relistado
OUT_SALE_ESTIMATED = "sale_estimated" # bajadas progresivas + desaparicion (Best Offer)
OUT_AMBIGUOUS = "ended_ambiguous"     # sin evidencia suficiente: NO se infiere nada
OUT_NO_OBS = "no_observations"


@dataclass(frozen=True)
class InferConfig:
    """Parametros agrupados para poder recalibrar sin tocar el codigo llamante."""
    relist_window_days: int = RELIST_WINDOW_DAYS
    title_similarity_min: float = TITLE_SIMILARITY_MIN
    relist_price_tolerance: float = RELIST_PRICE_TOLERANCE
    best_offer_discount: float = BEST_OFFER_DISCOUNT
    min_progressive_drops: int = MIN_PROGRESSIVE_DROPS
    conf_auction: float = CONF_AUCTION
    conf_qty_decrement: float = CONF_QTY_DECREMENT
    conf_fixed_disappeared: float = CONF_FIXED_DISAPPEARED
    conf_best_offer: float = CONF_BEST_OFFER


DEFAULT_CONFIG = InferConfig()


def _d(s):
    return date.fromisoformat(str(s)[:10])


def title_similarity(a, b):
    return difflib.SequenceMatcher(None, (a or "").lower(), (b or "").lower()).ratio()


def _price_path(obs):
    return [[o["observed_at"], o.get("price")] for o in obs]


def _progressive_drops(obs):
    """Bajadas de precio entre observaciones consecutivas: [fecha, de, a]."""
    out = []
    for prev, cur in zip(obs, obs[1:]):
        p0, p1 = prev.get("price"), cur.get("price")
        if p0 is not None and p1 is not None and p1 < p0 - 1e-9:
            out.append([cur["observed_at"], p0, p1])
    return out


def _find_relist(listing, other_listings, cfg):
    """Candidato a relistado del mismo listing, o (None, None).

    Relistado = otro listing del MISMO vendedor, aparecido tras la desaparicion
    dentro de la ventana, con titulo casi identico y precio parecido. Si existe,
    la desaparicion NO fue una venta.
    """
    for cand in other_listings or ():
        if cand.get("listing_id") == listing.get("listing_id"):
            continue
        if not listing.get("seller") or cand.get("seller") != listing.get("seller"):
            continue
        if not cand.get("first_seen"):
            continue
        gap = (_d(cand["first_seen"]) - _d(listing["last_seen"])).days
        if gap < 0 or gap > cfg.relist_window_days:
            continue
        sim = title_similarity(listing.get("title"), cand.get("title"))
        if sim < cfg.title_similarity_min:
            continue
        p0, p1 = listing.get("price"), cand.get("price")
        if p0 and p1 is not None and abs(p1 - p0) / p0 > cfg.relist_price_tolerance:
            continue
        return cand, sim
    return None, None


def _sale(listing, as_of, method, confidence, price_est, sale_date_est, detail):
    """Fila logica de inferred_sales; detail queda como dict (JSON al persistir)."""
    return {
        "listing_id": listing.get("listing_id"),
        "instrument_key": listing.get("instrument_key"),
        "inferred_at": as_of,
        "sale_date_est": sale_date_est,
        "price_est": None if price_est is None else round(float(price_est), 2),
        "method": method,
        "confidence": confidence,
        "detail": detail,
    }


def sale_to_row(sale):
    """Venta inferida -> fila insertable: detail serializado a JSON estable."""
    row = dict(sale)
    row["detail"] = json.dumps(sale.get("detail") or {}, ensure_ascii=False, sort_keys=True)
    return row


def classify(listing, observations, as_of, other_listings=(), config=DEFAULT_CONFIG):
    """Clasifica el ciclo de vida de UN listing a fecha as_of.

    listing        : dict con las claves de graded_listings
    observations   : dicts con las claves de listing_observations (cualquier orden)
    as_of          : fecha ISO de hoy para el motor (reproducible en backtest)
    other_listings : resto de listings conocidos, para detectar relistados

    Devuelve {"listing_id", "outcome", "sales": [...], "detail": {...}}.
    Las ventas parciales por decremento de cantidad se emiten aunque el listing
    siga vivo; el desenlace final se decide solo al desaparecer.
    """
    cfg = config
    obs = sorted(observations or [], key=lambda o: o["observed_at"])
    result = {"listing_id": listing.get("listing_id"), "outcome": OUT_NO_OBS,
              "sales": [], "detail": {}}
    if not obs:
        return result

    sales = []
    is_auction = bool(listing.get("is_auction"))

    # 1) Ventas parciales CONFIRMADAS por decremento de cantidad. Evento
    #    estructural: el contador de stock solo baja porque alguien compro.
    #    Se detectan tambien en listings todavia activos.
    if not is_auction:
        for prev, cur in zip(obs, obs[1:]):
            qp, qc = prev.get("quantity"), cur.get("quantity")
            if qp is not None and qc is not None and qc < qp:
                sales.append(_sale(
                    listing, as_of, METHOD_QTY, cfg.conf_qty_decrement,
                    price_est=prev.get("price"),  # ask vigente cuando ocurrio la compra
                    sale_date_est=cur["observed_at"],
                    detail={
                        "qty_before": qp, "qty_after": qc, "units": qp - qc,
                        "interval": [prev["observed_at"], cur["observed_at"]],
                        "price_at_interval_start": prev.get("price"),
                        "price_at_interval_end": cur.get("price"),
                    },
                ))

    last = obs[-1]
    ended = last.get("status") == "ended"
    gone_days = (_d(as_of) - _d(last["observed_at"])).days
    present = (not ended) and gone_days <= 0

    # 2) Subastas: el fin es un evento duro; no hay ventana de relistado que
    #    esperar. Con pujas, el mecanismo de subasta garantiza la venta al
    #    precio final observado. Sin pujas, no hubo venta.
    if is_auction:
        if present:
            result.update(outcome=OUT_ACTIVE, sales=sales)
            return result
        bids = max((o.get("bid_count") or 0) for o in obs)
        if bids > 0:
            sales.append(_sale(
                listing, as_of, METHOD_AUCTION, cfg.conf_auction,
                price_est=last.get("price"),  # puja mas alta observada
                sale_date_est=last["observed_at"],
                detail={
                    "bid_count": bids,
                    "ended_explicit": ended,  # False = desaparecio sin status 'ended'
                    "n_obs": len(obs),
                    "price_path": _price_path(obs),
                },
            ))
            result.update(outcome=OUT_SALE_CONFIRMED, sales=sales)
            return result
        result.update(outcome=OUT_NOT_SOLD, sales=sales,
                      detail={"bid_count": 0, "n_obs": len(obs)})
        return result

    # 3) Precio fijo aun vivo: nada que concluir sobre el desenlace.
    if present:
        result.update(outcome=OUT_ACTIVE, sales=sales)
        return result

    # 4) Desaparecido: primero descartar relistado (si reaparecio, NO fue venta).
    cand, sim = _find_relist(listing, other_listings, cfg)
    if cand is not None:
        result.update(outcome=OUT_RELISTED, sales=sales, detail={
            "relisted_as": cand.get("listing_id"),
            "title_similarity": round(sim, 3),
            "relist_price": cand.get("price"),
        })
        return result

    # 5) Ventana de relistado sin vencer: todavia no se puede afirmar venta.
    if gone_days < cfg.relist_window_days:
        result.update(outcome=OUT_PENDING, sales=sales, detail={
            "days_gone": gone_days,
            "relist_window_days": cfg.relist_window_days,
        })
        return result

    # 6) Listing multiple desaparecido con stock restante: pudo venderse el
    #    resto de golpe o retirarse. Sin evidencia unitaria NO se infiere nada:
    #    conservador a proposito.
    qty_last = last.get("quantity")
    if qty_last is not None and qty_last > 1:
        result.update(outcome=OUT_AMBIGUOUS, sales=sales, detail={
            "remaining_quantity": qty_last,
            "note": "multiple desaparecido con stock restante: sin inferencia",
        })
        return result

    drops = _progressive_drops(obs)
    last_price = last.get("price")
    if last_price is None:
        result.update(outcome=OUT_AMBIGUOUS, sales=sales,
                      detail={"note": "desaparecido sin precio observado"})
        return result

    # La venta ocurrio entre la ultima observacion y el dia siguiente de sondeo:
    # estimacion puntual = last_seen + 1; el intervalo completo va en detail.
    sale_date = (_d(last["observed_at"]) + timedelta(days=1)).isoformat()
    evidence = {
        "days_gone": gone_days,
        "relist_window_days": cfg.relist_window_days,
        "relist_candidates_checked": len(
            [c for c in other_listings or () if c.get("listing_id") != listing.get("listing_id")]
        ),
        "n_obs": len(obs),
        "price_path": _price_path(obs),
        "sale_date_interval": [last["observed_at"], as_of],
    }

    # 7) Bajadas progresivas y luego desaparicion: patron de vendedor aceptando
    #    Best Offer. El precio final NO se observa: se estima con el factor de
    #    descuento declarado (SIN CALIBRAR), y la confianza es la mas baja.
    if len(drops) >= cfg.min_progressive_drops:
        evidence.update({
            "progressive_drops": drops,
            "last_ask": last_price,
            "discount_factor": cfg.best_offer_discount,
            "calibration": "factor SIN CALIBRAR hasta muestra Terapeak",
        })
        sales.append(_sale(
            listing, as_of, METHOD_BEST_OFFER, cfg.conf_best_offer,
            price_est=last_price * cfg.best_offer_discount,
            sale_date_est=sale_date, detail=evidence,
        ))
        result.update(outcome=OUT_SALE_ESTIMATED, sales=sales)
        return result

    # 8) Precio fijo desaparecido, sin relistado en la ventana: venta probable
    #    al ultimo ask. Confianza media: pudo retirarse sin vender.
    evidence.update({"last_ask": last_price})
    sales.append(_sale(
        listing, as_of, METHOD_FIXED, cfg.conf_fixed_disappeared,
        price_est=last_price, sale_date_est=sale_date, detail=evidence,
    ))
    result.update(outcome=OUT_SALE_PROBABLE, sales=sales)
    return result


def classify_all(listings, observations_by_listing, as_of, config=DEFAULT_CONFIG):
    """Clasifica todos los listings; cada uno ve al resto para detectar relistados."""
    out = []
    for lst in listings:
        out.append(classify(
            lst,
            observations_by_listing.get(lst.get("listing_id"), []),
            as_of,
            other_listings=listings,
            config=config,
        ))
    return out
