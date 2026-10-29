"""Gera o catálogo SQL a partir do XLSX oficial TACO (nenhum dado vai ao bundle web).

Fonte: NEPA/UNICAMP, Tabela Brasileira de Composição de Alimentos, 4ª ed., 2011.
A publicação permite reprodução com citação da fonte. O script não converte Tr/NA
em zero: só inclui linhas com os quatro valores numéricos publicados.
"""
import argparse
import hashlib
import io
import json
from pathlib import Path
import urllib.request
import uuid
import xml.etree.ElementTree as ET
import zipfile

URL = "https://www.nepa.unicamp.br/arquivo/uploads/taco-4a-edicao/taco-4a-edicao-2/"
PDF = "https://nepa.unicamp.br/wp-content/uploads/sites/27/2023/10/taco_4_edicao_ampliada_e_revisada.pdf"

def gerar(conteudo):
    ns = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    with zipfile.ZipFile(io.BytesIO(conteudo)) as livro:
        strings = ["".join(t.itertext()) for t in ET.fromstring(livro.read("xl/sharedStrings.xml")).findall("s:si", ns)]
        linhas = ET.fromstring(livro.read("xl/worksheets/sheet1.xml")).findall(".//s:row", ns)
    alimentos, excluidos = [], []
    for linha in linhas:
        valores = {}
        for celula in linha.findall("s:c", ns):
            v = celula.find("s:v", ns)
            valor = v.text if v is not None else ""
            if celula.get("t") == "s":
                valor = strings[int(valor)]
            coluna = "".join(c for c in celula.get("r") if c.isalpha())
            valores[coluna] = valor
        if not str(valores.get("A", "")).isdigit() or not valores.get("B"):
            continue
        numero, nome = int(valores["A"]), valores["B"].strip()
        try:
            kcal, proteinas, gorduras, carboidratos = [float(valores[c]) for c in ["D", "F", "G", "I"]]
            if any(v < 0 or v != v or v == float("inf") for v in [kcal, proteinas, gorduras, carboidratos]):
                raise ValueError("Valor inválido")
        except (ValueError, KeyError):
            excluidos.append(numero)
            continue
        alimentos.append({"id": str(uuid.uuid5(uuid.NAMESPACE_URL, f"{PDF}#alimento-{numero}")), "usuarioId": None, "nome": nome, "marca": "", "preparo": "Conforme descrição TACO", "fonte": f"TACO 4ª ed. — NEPA/UNICAMP, 2011, alimento {numero}. {PDF}", "baseGramas": 100, "porcaoNome": "100 g", "nutrientes": {"kcal": round(kcal, 4), "proteinas": round(proteinas, 4), "carboidratos": round(carboidratos, 4), "gorduras": round(gorduras, 4)}})
    if len(alimentos) < 400:
        raise ValueError("Quantidade inesperada de linhas; revise a estrutura da fonte oficial.")
    return alimentos, excluidos

def main():
    argumentos = argparse.ArgumentParser()
    argumentos.add_argument("--arquivo", type=Path)
    args = argumentos.parse_args()
    conteudo = args.arquivo.read_bytes() if args.arquivo else urllib.request.urlopen(URL, timeout=60).read()
    alimentos, excluidos = gerar(conteudo)
    aspas = lambda s: "'" + s.replace("'", "''") + "'"
    valores = [f"({aspas(a['id'])}::uuid, NULL, {aspas(a['nome'])}, {aspas(json.dumps(a, ensure_ascii=False, separators=(',', ':')))}::jsonb)" for a in alimentos]
    cabecalho = f"-- TACO 4ª edição, NEPA/UNICAMP, 2011. Reprodução permitida com atribuição.\n-- Fonte oficial: {URL}\n-- Publicação e autorização: {PDF}\n-- SHA256 do XLSX: {hashlib.sha256(conteudo).hexdigest()}\n-- {len(alimentos)} alimentos; {len(excluidos)} linhas omitidas por Tr/NA/dado ausente em kcal ou macros.\n-- Os valores vêm das células numéricas originais do XLSX, arredondados a 4 casas.\n"
    sql = cabecalho + "BEGIN;\nINSERT INTO public.nutrition_foods (id, user_id, name, document) VALUES\n" + ",\n".join(valores) + "\nON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, document = EXCLUDED.document, revision = public.nutrition_foods.revision + 1, updated_at = now() WHERE public.nutrition_foods.user_id IS NULL;\nCOMMIT;\n"
    destino = Path(__file__).resolve().parent.parent / "supabase/migrations/202610280002_catalogo_taco.sql"
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_text(sql, encoding="utf-8")
    print(f"Catálogo gerado: {len(alimentos)} alimentos, {len(excluidos)} linhas omitidas. {destino}")

if __name__ == "__main__":
    main()
