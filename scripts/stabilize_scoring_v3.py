from pathlib import Path
import re


def read(path):
    return Path(path).read_text(encoding='utf-8')


def write(path, text):
    Path(path).write_text(text, encoding='utf-8')


def replace_once(path, old, new):
    text = read(path)
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: esperado 1 ocorrência, encontrado {count}: {old[:90]!r}')
    write(path, text.replace(old, new, 1))
    print(f'{path}: substituição aplicada')

# 1) O grupo configura apenas a janela adicional de tolerância.
path = 'client-time-guard-v3.js'
replace_once(
    path,
    "const value={dentroLimites:Number(r.dentroLimites??100),atrasoLeve:Number(r.atrasoLeve??75),atrasoMaior:Number(r.atrasoMaior??50),estourado:0};",
    "const fatorJanela=Number(r.janelaAdicionalPct??r.percentualJanelaAdicional??r.dentroLimites??100);\n    const value={dentroLimites:100,atrasoLeve:75,atrasoMaior:50,estourado:0,janelaAdicionalPct:Math.max(0,Math.min(100,Number.isFinite(fatorJanela)?fatorJanela:100))};"
)

# 2) 100/75/50 são faixas de tempo, não multiplicadores de pontos.
replace_once(
    path,
    "const inicio=performance.now(),banco=await db(),pontos=Math.round((Number(t.pontosMaximos)||0)*(faixa.percentual/100));",
    "const inicio=performance.now(),banco=await db(),pontos=faixa.faixa==='estourado'?0:(Number(t.pontosMaximos)||0);"
)

# 3) Tolerância zero não herda percentual configurável.
replace_once(
    path,
    "const faixa=tolerancia===0?{percentual:horarioEstourado?0:Number(regra.dentroLimites??100),faixa:horarioEstourado?'estourado':'dentro-limites',consumoSeg:0,...semTolBase}:classificarConsumoToleranciaSegundos(tolerancia,calc.consumoTotalSeg,regra);",
    "const faixa=tolerancia===0?{percentual:horarioEstourado?0:100,faixa:horarioEstourado?'estourado':'dentro-limites',consumoSeg:0,...semTolBase}:classificarConsumoToleranciaSegundos(tolerancia,calc.consumoTotalSeg,regra);"
)
replace_once(
    path,
    "log('perf.modulo_pronto',{versao:3,commitWaitMs:UX_COMMIT_WAIT_MS});",
    "log('perf.modulo_pronto',{versao:5,commitWaitMs:UX_COMMIT_WAIT_MS,pontuacao:'integral',percentuais:'tempo',toleranciaZero:'independente'});"
)

# 4) Cliente legado usa a mesma regra.
path = 'index-CLIENTE-v6.html'
text = read(path)
text = text.replace(
    "const REGRA_ATRASO_PADRAO = { dentroLimites:100, atrasoLeve:75, atrasoMaior:50, estourado:0 };",
    "const REGRA_ATRASO_PADRAO = { dentroLimites:100, atrasoLeve:75, atrasoMaior:50, estourado:0, janelaAdicionalPct:100 };"
)
text = text.replace(
    "return {dentroLimites:n(r.dentroLimites,100),atrasoLeve:n(r.atrasoLeve,75),atrasoMaior:n(r.atrasoMaior,50),estourado:0};",
    "const fator=n(r.janelaAdicionalPct ?? r.percentualJanelaAdicional ?? r.dentroLimites,100);\n            return {dentroLimites:100,atrasoLeve:75,atrasoMaior:50,estourado:0,janelaAdicionalPct:fator};"
)
text = text.replace(
    "const pts=Math.round((Number(tarefa.pontosMaximos)||0)*(percentual/100));",
    "const pts=percentual===0?0:(Number(tarefa.pontosMaximos)||0);"
)
write(path, text)

# 5) Força recarga dos módulos corrigidos.
path = 'client-ui-pro.js'
text = read(path)
text = re.sub(r"import\('\./client-time-guard-v3\.js\?v=\d+'\)", "import('./client-time-guard-v3.js?v=5')", text)
write(path, text)

path = 'index-CLIENTE-v6.html'
text = read(path)
text = re.sub(r"\.\/client-ui-pro\.js\?v=\d+", "./client-ui-pro.js?v=39", text)
text = re.sub(r"\.\/sw\.js\?v=\d+", "./sw.js?v=42", text)
write(path, text)

path = 'sw.js'
text = read(path)
text = re.sub(r"const CACHE_NAME='rotina-family-cliente-v\d+';", "const CACHE_NAME='rotina-family-cliente-v53';", text)
write(path, text)

print('Estabilização de pontuação e tolerância aplicada.')
