# Configuração do login Google — Draw Battle Arena

O botão “Continuar com Google” usa Supabase Auth OAuth. O código do jogo está preparado, mas o provedor Google precisa de credenciais próprias antes de o fluxo funcionar.

## 1. Criar credenciais Google OAuth

1. Abra o [Google Cloud Console — Credentials](https://console.cloud.google.com/auth/clients).
2. Crie um cliente OAuth do tipo **Web application**.
3. Em **Authorized JavaScript origins**, adicione:
   - `https://draw-battle-arena.onrender.com`
4. Em **Authorized redirect URIs**, adicione o callback mostrado na página do provedor Google no Supabase. Para este projeto, o formato é:
   - `https://alfcxgmrztuioegejodm.supabase.co/auth/v1/callback`
5. Copie o Client ID e o Client Secret.

## 2. Ativar o provedor no Supabase

1. Abra [Supabase Auth Providers](https://supabase.com/dashboard/project/alfcxgmrztuioegejodm/auth/providers).
2. Abra **Google**, ative o provedor e cole o Client ID e o Client Secret.
3. Salve as alterações.

Nunca coloque o Client Secret no JavaScript, no GitHub ou em variáveis públicas do frontend.

## 3. Permitir o retorno ao jogo

Em [Supabase URL Configuration](https://supabase.com/dashboard/project/alfcxgmrztuioegejodm/auth/url-configuration), configure a URL do site como:

- Site URL: `https://draw-battle-arena.onrender.com`
- Redirect URL permitida: `https://draw-battle-arena.onrender.com`

Adicione também a URL local de desenvolvimento somente se for usar localhost.

## 4. Testar

1. Abra o jogo e clique em **Continuar com Google**.
2. Escolha uma conta Google e aceite a autorização.
3. Confirme que o navegador retorna ao jogo e que o nome aparece preenchido.
4. Crie uma sala e peça a outro jogador para entrar com o código.

O botão e o fluxo OAuth estão implementados no frontend; a conclusão do login depende de concluir os passos de credenciais acima.
