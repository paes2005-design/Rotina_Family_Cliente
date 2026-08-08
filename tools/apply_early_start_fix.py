from pathlib import Path
p=Path('client-time-guard-v2.js')
s=p.read_text(encoding='utf-8')
old='const atrasoInicio=minutosCompletosAtraso(j.inicio,agora),banco=await db();'
new='const atrasoInicio=minutosCompletosAtraso(agora,j.inicio),banco=await db();'
if s.count(old)!=1:
    raise SystemExit('chamada de atraso do início não encontrada exatamente uma vez')
p.write_text(s.replace(old,new,1),encoding='utf-8')
