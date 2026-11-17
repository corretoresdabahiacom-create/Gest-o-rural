# Gestão Rural

SaaS de gestão para fazendas de gado: finanças (colaboradores, despesas, receitas, obrigações de férias e 13º), rebanho, pesagem com projeção de venda, estoque, relatórios exportáveis e PWA instalável.

**Stack:** React 19 + TypeScript + Vite + Tailwind 4 · Firebase Authentication + Cloud Firestore · Cloudflare Workers (assets estáticos) · vite-plugin-pwa.

## Rodar localmente

```bash
npm install
cp .env.example .env.local   # preencha com a configuração web do Firebase
npm run dev
```

Testes:

```bash
npm test             # testes unitários (cálculos, validação, relatórios, alertas, CSV)
npm run test:rules   # Security Rules no emulador do Firestore (requer Java 11+)
```

## 1. Configurar o Firebase

1. Em <https://console.firebase.google.com> crie um projeto (o Google Analytics é opcional).
2. **Authentication → Método de login →** ative **E-mail/senha**.
3. **Authentication → Configurações → Domínios autorizados →** adicione o domínio publicado (hoje `gest-o-rural.pintolimadistribuidora.workers.dev`) e o domínio próprio, se houver.
4. **Firestore Database → Criar banco** em modo de produção, região `southamerica-east1` (São Paulo).
5. **Configurações do projeto → Seus apps → Web (`</>`)**: registre o app e copie os valores de `firebaseConfig` para as variáveis `VITE_FIREBASE_*`.
6. Publique as regras e índices:

   ```bash
   npx firebase login
   npx firebase use --add          # escolha o projeto
   npx firebase deploy --only firestore:rules,firestore:indexes
   ```

> As chaves `VITE_FIREBASE_*` são públicas por design (identificam o projeto). Quem protege os dados são as **Firestore Security Rules** (`firestore.rules`). Nenhuma credencial administrativa é usada no navegador.

O Firebase Storage **não é necessário**: o logotipo opcional é reduzido a 256 px e salvo no próprio documento da fazenda.

## 2. Publicar no Cloudflare (Worker com assets estáticos)

O site é um Worker do Cloudflare que serve a pasta `dist` (`wrangler.jsonc`, com `not_found_handling: single-page-application` para as rotas da SPA). A configuração web do Firebase vem de `.env.production`, que é pública por design.

```bash
npm run build
npx wrangler login      # conta dona do Worker
npx wrangler deploy
```

Hoje o Worker **não está ligado ao GitHub**: cada versão é publicada com `wrangler deploy`. Para publicar a cada push, conecte o repositório em **Workers & Pages → gest-o-rural → Settings → Builds** (build `npm run build`, deploy `npx wrangler deploy`). O app avisa o usuário quando há uma nova versão disponível.

## 3. Primeiro acesso

1. Abra o site, clique em **Criar conta** e cadastre a fazenda. Os tipos de mão de obra e as categorias iniciais são criados automaticamente.
2. Para instalar no celular:
   - **Android/Chrome:** menu ⋮ → *Instalar app*.
   - **iPhone/Safari:** Compartilhar → *Adicionar à Tela de Início*.
3. Para dar acesso a outras pessoas, use **Configurações → Usuários autorizados → Convidar**: o link de convite é copiado para enviar por WhatsApp ou e-mail. A pessoa abre o link, cria conta com o mesmo e-mail, confirma o e-mail, toca em **Já confirmei** e aceita o convite. Quem já tem fazenda vê o convite no topo do app.

Decisões de arquitetura: [docs/ARQUITETURA.md](docs/ARQUITETURA.md).

## Módulos

| Módulo | O que faz |
|---|---|
| Administração | Dashboard, colaboradores, planilha de despesas, obrigações (férias e 13º) e relatórios financeiros |
| **Rebanho** (menu Rebanho) | Lotes e animais, categorias, entrada (compra e nascimento), venda com despesas, mortes, transferências, vacinação, inventário (atual, histórico, conferência física e reconciliação) e 20 relatórios |
| **Estoque** (menu Estoque) | Insumos, medicamentos, alimentação, combustíveis e ferramentas: entradas e saídas com custo médio, contagem física, estorno, estoque mínimo com alerta, baixa automática na vacinação, compra lançada no financeiro e 6 relatórios |
| **Pesagem** (Rebanho → Pesagem) | Planilha individual e coletiva, GMD, histórico com correções rastreáveis, evolução por animal e por lote, **projeção de venda** (vender hoje ou esperar, com GMD, preço da @ e custo diário), painel, 11 relatórios e importação de Excel/CSV |

> Ao atualizar uma versão anterior, publique as regras novas (console do Firebase → Firestore → Regras, ou `npx firebase deploy --only firestore:rules,firestore:indexes`). Em fazendas criadas antes do módulo de rebanho, use "Criar categorias padrão" na primeira visita ao Rebanho.
