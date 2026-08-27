from pathlib import Path

p=Path('client-offline-execution-integrity-v1.js')
s=p.read_text(encoding='utf-8')
old="import { getFirestore, collection, query, where, onSnapshot, doc, getDoc, getDocFromCache, updateDoc, setDoc } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';"
new="import { getFirestore, doc, getDocFromCache, updateDoc, setDoc } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';"
if old not in s:
    raise SystemExit('Import residual esperado não encontrado')
s=s.replace(old,new,1)
p.write_text(s,encoding='utf-8')
print('CACHE_FIRST_IMPORTS_LIMPOS=OK')
