#!/usr/bin/env python3
"""
Tests del modulo de gradeadas (services/graded/): parser de titulos, adaptador
de la Browse API en modo simulado, motor de inferencia por ciclo de vida y
validez del esquema SQL. Sin dependencias externas: biblioteca estandar.

Uso:  python3 tests/test_graded.py
"""

import importlib.util
import json
import os
import sqlite3
import sys
import unittest

PROJ = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
GRADED_DIR = os.path.join(PROJ, "services", "graded")
FIXTURES_DIR = os.path.join(PROJ, "tests", "fixtures", "graded")
SCHEMA_PATH = os.path.join(GRADED_DIR, "schema.sql")


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


ebay_source = _load("graded_ebay_source", os.path.join(GRADED_DIR, "ebay_source.py"))
infer = _load("graded_infer", os.path.join(GRADED_DIR, "infer.py"))


class TestParseTitle(unittest.TestCase):
    """Extraccion conservadora de (gradeadora, grado) de titulos reales."""

    CASES_OK = [
        ("Charizard VMAX 020/189 Alt Art PSA 10 GEM MINT Darkness Ablaze", ("PSA", 10.0)),
        ("PSA10 Pikachu Illustrator promo", ("PSA", 10.0)),
        ("psa 10 gem mint charizard", ("PSA", 10.0)),
        ("PSA-10 Espeon Gold Star", ("PSA", 10.0)),
        ("PSA GEM MT 10 Mewtwo Base Set", ("PSA", 10.0)),
        ("PSA graded 9 Blastoise", ("PSA", 9.0)),
        ("Umbreon VMAX Alt Art BGS 9.5 Quad+", ("BGS", 9.5)),
        ("CGC 8.5 Blastoise Base Set Shadowless", ("CGC", 8.5)),
        ("SGC 10 Lugia Neo Genesis", ("SGC", 10.0)),
        ("Vintage Charizard PSA 4.5 played", ("PSA", 4.5)),
        ("Charizard #10 of set, PSA 9", ("PSA", 9.0)),
        ("PSA 10 Charizard... yes PSA 10!", ("PSA", 10.0)),
    ]

    CASES_TRAMPA = [
        "Charizard VMAX PSA 10 pop report deep dive",  # listing SOBRE el pop report
        "Charizard VMAX pack fresh not PSA graded NM",  # negacion
        "Charizard raw NM no PSA",                      # negacion
        "PSA-style custom slab Charizard display",      # imitacion
        "PSA like slab protector case",                 # imitacion
        "PSA 9 PSA 10 lot of 2 Charizard",              # dos grados: lote, ambiguo
        "PSA BGS CGC mixed graded lot 10 cards",        # varias gradeadoras
        "SGC 10 / PSA crossover candidate",             # dos gradeadoras
        "Charizard 010/189 holo rare NM",               # sin gradeadora
        "PSA Charizard slab",                           # gradeadora sin grado
        "PSA 100 point pristine replica",               # grado invalido
        "Charizard PSA 10.5 custom label",              # grado inexistente
        "",                                             # vacio
        None,                                           # nulo
    ]

    def test_titulos_validos(self):
        for title, expected in self.CASES_OK:
            with self.subTest(title=title):
                self.assertEqual(ebay_source.parse_title(title), expected)

    def test_titulos_trampa_devuelven_none(self):
        for title in self.CASES_TRAMPA:
            with self.subTest(title=title):
                self.assertEqual(ebay_source.parse_title(title), (None, None))


class TestEbayBrowseSource(unittest.TestCase):
    """Adaptador: modo simulado con fixtures y peticiones reales construidas."""

    def setUp(self):
        self._saved = {k: os.environ.pop(k, None) for k in ("EBAY_APP_ID", "EBAY_CERT_ID")}

    def tearDown(self):
        for k, v in self._saved.items():
            if v is not None:
                os.environ[k] = v

    def test_sin_credenciales_modo_fixtures(self):
        src = ebay_source.EbayBrowseSource(fixtures_dir=FIXTURES_DIR, verbose=False)
        self.assertEqual(src.mode, "fixtures")

    def test_fetch_fixtures_normaliza(self):
        src = ebay_source.EbayBrowseSource(fixtures_dir=FIXTURES_DIR, verbose=False)
        rows = src.fetch_listings(
            "Charizard VMAX PSA 10",
            instrument_key="en:swsh3-20:holo:unlimited|PSA|10",
            observed_at="2026-08-20",
        )
        self.assertEqual(len(rows), 7)
        by_id = {r["listing_id"]: r for r in rows}

        # Subasta: precio = puja actual, no el precio de salida.
        auction = by_id["v1|110001|0"]
        self.assertEqual(auction["is_auction"], 1)
        self.assertEqual(auction["price"], 432.0)
        self.assertEqual(auction["currency"], "USD")
        self.assertEqual(auction["bid_count"], 17)
        self.assertEqual((auction["grader"], auction["grade"]), ("PSA", 10.0))

        # Precio fijo con titulo "PSA10" pegado.
        fixed = by_id["v1|110002|0"]
        self.assertEqual(fixed["is_auction"], 0)
        self.assertEqual(fixed["price"], 499.99)
        self.assertEqual((fixed["grader"], fixed["grade"]), ("PSA", 10.0))

        # Trampas: el parser NO adivina.
        for trap_id in ("v1|110003|0", "v1|110004|0", "v1|110007|0"):
            self.assertEqual((by_id[trap_id]["grader"], by_id[trap_id]["grade"]),
                             (None, None), trap_id)

        # BGS 9.5 y listing multiple.
        self.assertEqual((by_id["v1|110005|0"]["grader"], by_id["v1|110005|0"]["grade"]),
                         ("BGS", 9.5))
        self.assertEqual(by_id["v1|110006|0"]["quantity"], 4)

        # Claves comunes del esquema en todas las filas.
        for r in rows:
            self.assertEqual(r["source"], "fixture")
            self.assertEqual(r["observed_at"], "2026-08-20")
            self.assertEqual(r["status"], "active")
            self.assertEqual(r["instrument_key"], "en:swsh3-20:holo:unlimited|PSA|10")

    def test_fixture_inexistente_error_claro(self):
        src = ebay_source.EbayBrowseSource(fixtures_dir=FIXTURES_DIR, verbose=False)
        with self.assertRaises(FileNotFoundError):
            src.fetch_listings("consulta sin fixture")

    def test_con_credenciales_modo_real_y_peticiones_construidas(self):
        src = ebay_source.EbayBrowseSource(app_id="fake-app", cert_id="fake-cert", verbose=False)
        self.assertEqual(src.mode, "real")

        tok_req = src._build_token_request()
        self.assertEqual(tok_req.full_url, ebay_source.OAUTH_TOKEN_URL)
        self.assertEqual(tok_req.get_method(), "POST")
        headers = {k.lower(): v for k, v in tok_req.header_items()}
        self.assertTrue(headers["authorization"].startswith("Basic "))
        self.assertIn(b"grant_type=client_credentials", tok_req.data)

        search_req = src._build_search_request("tok123", "charizard psa 10", offset=200)
        self.assertTrue(search_req.full_url.startswith(ebay_source.BROWSE_SEARCH_URL + "?"))
        self.assertIn("q=charizard+psa+10", search_req.full_url)
        self.assertIn("offset=200", search_req.full_url)
        self.assertIn("limit=%d" % ebay_source.PAGE_LIMIT, search_req.full_url)
        headers = {k.lower(): v for k, v in search_req.header_items()}
        self.assertEqual(headers["authorization"], "Bearer tok123")
        self.assertEqual(headers["x-ebay-c-marketplace-id"], ebay_source.MARKETPLACE_ID)


class TestInferLifecycle(unittest.TestCase):
    """Cada escenario sintetico debe clasificarse exactamente como declara."""

    @classmethod
    def setUpClass(cls):
        with open(os.path.join(FIXTURES_DIR, "lifecycle_scenarios.json"), encoding="utf-8") as f:
            cls.scenarios = json.load(f)["scenarios"]

    def test_escenarios(self):
        self.assertGreaterEqual(len(self.scenarios), 8)
        for sc in self.scenarios:
            with self.subTest(scenario=sc["name"]):
                result = infer.classify(
                    sc["listing"], sc["observations"], sc["as_of"],
                    other_listings=sc.get("other_listings", ()),
                )
                exp = sc["expected"]
                self.assertEqual(result["outcome"], exp["outcome"], sc["name"])
                got = sorted(result["sales"], key=lambda s: (s["sale_date_est"], s["method"]))
                want = sorted(exp["sales"], key=lambda s: (s["sale_date_est"], s["method"]))
                self.assertEqual(len(got), len(want), sc["name"])
                for g, w in zip(got, want):
                    self.assertEqual(g["method"], w["method"])
                    self.assertEqual(g["sale_date_est"], w["sale_date_est"])
                    self.assertAlmostEqual(g["price_est"], w["price_est"], places=2)
                    self.assertGreaterEqual(g["confidence"], w["confidence_min"])
                    self.assertLessEqual(g["confidence"], w["confidence_max"])
                    if "units" in w:
                        self.assertEqual(g["detail"]["units"], w["units"])

    def test_toda_venta_lleva_metodo_confianza_y_evidencia(self):
        valid_methods = {infer.METHOD_AUCTION, infer.METHOD_FIXED,
                         infer.METHOD_BEST_OFFER, infer.METHOD_QTY}
        for sc in self.scenarios:
            result = infer.classify(sc["listing"], sc["observations"], sc["as_of"],
                                    other_listings=sc.get("other_listings", ()))
            for sale in result["sales"]:
                with self.subTest(scenario=sc["name"], method=sale["method"]):
                    self.assertIn(sale["method"], valid_methods)
                    self.assertGreaterEqual(sale["confidence"], 0.0)
                    self.assertLessEqual(sale["confidence"], 1.0)
                    self.assertEqual(sale["inferred_at"], sc["as_of"])
                    self.assertEqual(sale["listing_id"], sc["listing"]["listing_id"])
                    self.assertEqual(sale["instrument_key"], sc["listing"]["instrument_key"])
                    self.assertIsInstance(sale["detail"], dict)
                    self.assertTrue(sale["detail"])  # evidencia nunca vacia
                    json.dumps(sale["detail"])       # serializable para la columna TEXT

    def test_best_offer_declara_factor_sin_calibrar(self):
        sc = next(s for s in self.scenarios if s["name"].startswith("bajadas_progresivas"))
        result = infer.classify(sc["listing"], sc["observations"], sc["as_of"])
        sale = result["sales"][0]
        self.assertEqual(sale["detail"]["discount_factor"], infer.BEST_OFFER_DISCOUNT)
        self.assertIn("SIN CALIBRAR", sale["detail"]["calibration"])

    def test_orden_confianzas_ordinal(self):
        # Alta (subasta, stock) > media (fijo desaparecido) > baja (best offer).
        self.assertGreater(infer.CONF_AUCTION, infer.CONF_FIXED_DISAPPEARED)
        self.assertGreater(infer.CONF_QTY_DECREMENT, infer.CONF_FIXED_DISAPPEARED)
        self.assertGreater(infer.CONF_FIXED_DISAPPEARED, infer.CONF_BEST_OFFER)

    def test_classify_all_detecta_relistado_entre_listings(self):
        sc = next(s for s in self.scenarios if s["name"].startswith("reaparicion"))
        listings = [sc["listing"]] + sc["other_listings"]
        obs = {sc["listing"]["listing_id"]: sc["observations"]}
        results = {r["listing_id"]: r for r in infer.classify_all(listings, obs, sc["as_of"])}
        self.assertEqual(results[sc["listing"]["listing_id"]]["outcome"], infer.OUT_RELISTED)


class TestSchema(unittest.TestCase):
    """El esquema debe ejecutar tal cual y aceptar las filas que produce el codigo."""

    def setUp(self):
        self.con = sqlite3.connect(":memory:")
        with open(SCHEMA_PATH, encoding="utf-8") as f:
            self.con.executescript(f.read())

    def tearDown(self):
        self.con.close()

    def test_tablas_esperadas(self):
        names = {r[0] for r in self.con.execute(
            "SELECT name FROM sqlite_master WHERE type='table'")}
        for t in ("graded_listings", "listing_observations", "inferred_sales"):
            self.assertIn(t, names)

    def test_inserciones_desde_el_codigo(self):
        # Normalizacion -> filas de snapshot y observacion.
        os.environ.pop("EBAY_APP_ID", None)
        os.environ.pop("EBAY_CERT_ID", None)
        src = ebay_source.EbayBrowseSource(fixtures_dir=FIXTURES_DIR, verbose=False)
        rows = src.fetch_listings("Charizard VMAX PSA 10",
                                  instrument_key="en:swsh3-20:holo:unlimited|PSA|10",
                                  observed_at="2026-08-20")
        for n in rows:
            self.con.execute(
                "INSERT INTO graded_listings VALUES (:listing_id,:source,:instrument_key,"
                ":title,:grader,:grade,:price,:currency,:is_auction,:bid_count,:quantity,"
                ":seller,:first_seen,:last_seen,:last_status)",
                ebay_source.to_listing_row(n))
            self.con.execute(
                "INSERT INTO listing_observations VALUES (:listing_id,:observed_at,"
                ":price,:bid_count,:quantity,:status)",
                ebay_source.to_observation_row(n))
        self.assertEqual(
            self.con.execute("SELECT COUNT(*) FROM graded_listings").fetchone()[0], 7)

        # Inferencia -> fila de inferred_sales con detail JSON.
        with open(os.path.join(FIXTURES_DIR, "lifecycle_scenarios.json"), encoding="utf-8") as f:
            sc = json.load(f)["scenarios"][0]
        result = infer.classify(sc["listing"], sc["observations"], sc["as_of"])
        for sale in result["sales"]:
            self.con.execute(
                "INSERT INTO inferred_sales VALUES (:listing_id,:instrument_key,"
                ":inferred_at,:sale_date_est,:price_est,:method,:confidence,:detail)",
                infer.sale_to_row(sale))
        stored = self.con.execute(
            "SELECT method, confidence, detail FROM inferred_sales").fetchall()
        self.assertEqual(len(stored), 1)
        self.assertEqual(stored[0][0], infer.METHOD_AUCTION)
        self.assertIsInstance(json.loads(stored[0][2]), dict)


if __name__ == "__main__":
    unittest.main(verbosity=2)
