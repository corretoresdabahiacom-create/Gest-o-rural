# AgroGestão

SaaS de administração financeira para fazendas de gado: colaboradores, lançamentos em planilha, obrigações (férias, 13º) com lembretes, relatórios exportáveis e PWA instalável.

**Stack:** React 19 + TypeScript + Vite + Tailwind 4 · Firebase Authentication + Cloud Firestore · Cloudflare Pages · vite-plugin-pwa.

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
3. **Authentication → Configurações → Domínios autorizados →** adicione o domínio do Cloudflare Pages (ex.: `agrogestao.pages.dev`) e o domínio próprio, se houver.
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

## 2. Publicar no Cloudflare Pages

Em **Workers & Pages → Create → Pages → Connect to Git**, selecione este repositório e configure:

| Campo | Valor |
|---|---|
| Framework preset | Vite |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Variáveis de ambiente | `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`, `NODE_VERSION=22` |

As rotas da SPA funcionam sem configuração extra, porque o Pages serve o `index.html` quando não há `404.html`. Cada push na `main` gera um novo deploy. O app avisa o usuário quando há uma nova versão disponível.

## 3. Primeiro acesso

1. Abra o site, clique em **Criar conta** e cadastre a fazenda. Os tipos de mão de obra e as categorias iniciais são criados automaticamente.
2. Para instalar no celular:
   - **Android/Chrome:** menu ⋮ → *Instalar app*.
   - **iPhone/Safari:** Compartilhar → *Adicionar à Tela de Início*.
3. Para dar acesso a outras pessoas, use **Configurações → Usuários autorizados → Convidar**. A pessoa cria conta com o mesmo e-mail, confirma o e-mail pelo link recebido e aceita o convite.

Decisões de arquitetura: [docs/ARQUITETURA.md](docs/ARQUITETURA.md).
