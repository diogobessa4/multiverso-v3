# Scripts

## cadastrar-funkos.js

Cadastrador em lote de Funkos. Lê imagens de `imagens/`, sobe pro
bucket Supabase Storage `produtos` e insere registros em
`public.produtos` usando a service_role key (bypassa RLS).

### Pré-requisitos

1. `.env.local` na raiz do projeto com:
   ```
   SUPABASE_URL=https://uhoqwqydaestneliwozi.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=eyJhbG...
   ```
   (já no `.gitignore` — nunca commite)

2. Dependências instaladas:
   ```
   npm install
   ```

3. Imagens na pasta `imagens/` (qualquer combinação de
   `.jpg .jpeg .png .webp .avif`).

### Como rodar

```
npm run cadastrar-funkos
```

ou diretamente:

```
node scripts/cadastrar-funkos.js
```

### Fluxo

1. **Lista** todos os arquivos de imagem em `imagens/`.
2. **Parser** extrai o nome do produto a partir do filename (remove
   tokens "funko"/"pop"/"funkopop", colapsa hífens órfãos,
   capitaliza preservando hífens internos: `minn-erva → Minn-Erva`).
3. **Preview** em tabela mostra: arquivo → nome derivado, categoria
   (`funko`), preço (`0.01`), estoque (`1`), `numero_serie` (`null`).
4. **Confirmação** interativa: `s` confirma, qualquer outra coisa
   aborta.
5. Pra cada item:
   - upload do arquivo binário pro bucket (path `<uuid>.<ext>`)
   - INSERT em `produtos` com a URL pública
   - se INSERT falhar, **remove** o upload (rollback)
   - se INSERT OK, **move** o arquivo pra `imagens/cadastrados/`
6. **Resumo** final: cadastrados / pulados / falhas (com motivo).

### Recuperação de falha

Arquivos que falharem **continuam em `imagens/`** (não foram movidos
pra `cadastrados/`). Basta rodar de novo — eles aparecem no próximo
preview. Os que já foram cadastrados estão em `imagens/cadastrados/`
e não voltam pro preview.

### Ajustes futuros

Constantes no topo do script:

- `CATEGORIA = 'funko'` — fixo deste lote
- `PRECO = 0.01`, `ESTOQUE = 1` — também fixos
- `EMOJI = ''` — sem emoji quando há foto
- `numero_serie: null` — todos os arquivos deste lote sem número
