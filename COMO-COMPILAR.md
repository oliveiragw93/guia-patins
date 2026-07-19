# Guia de Patins — projeto Android (Capacitor)

Este é o projeto completo, pronto pra compilar. Eu não consegui rodar o build
final aqui no meu ambiente — o Gradle precisa baixar de `services.gradle.org`,
que fica fora da lista de domínios liberados na minha sandbox (bloqueio de rede,
não é um problema do projeto). Mas montei tudo até o ponto exato em que só falta
isso: a estrutura Android nativa já está gerada, com ícone e nome do app configurados.

Duas formas de terminar isso — escolha a que preferir:

---

## Opção A — Android Studio (mais direto)

**Pré-requisitos:** [Android Studio](https://developer.android.com/studio) instalado
(ele já vem com o Android SDK e resolve o Gradle sozinho).

1. Descompacte este pacote em qualquer pasta.
2. Abra um terminal nela e rode:
   ```
   npm install
   ```
3. Abra a pasta `android/` inteira no Android Studio (**File → Open**, aponte pra
   pasta `android`, não pra raiz do projeto).
4. Espere o Gradle sincronizar sozinho (primeira vez demora alguns minutos, baixa
   tudo que precisa).
5. Conecte o celular por USB com **Depuração USB** ativada (Configurações →
   Sobre o telefone → toque 7x em "Número da versão" → Opções do desenvolvedor →
   Depuração USB), ou use um emulador.
6. Clique no botão ▶️ **Run** — o Android Studio compila, instala e abre o app
   direto no celular conectado.

Pra gerar um `.apk` que você pode guardar/transferir manualmente, em vez de rodar
direto: **Build → Build Bundle(s) / APK(s) → Build APK(s)**. O arquivo sai em
`android/app/build/outputs/apk/debug/app-debug.apk` — copia esse arquivo pro
celular e instala (pode precisar liberar "Instalar de fontes desconhecidas" nas
configurações do Android).

## Opção B — Antigravity (ou qualquer IDE agente com terminal)

Mesma coisa, mas deixando o agente rodar os comandos:

1. Abra a pasta descompactada no Antigravity.
2. Peça pra ele rodar `npm install` e depois `npx cap sync android`.
3. Peça pra compilar: `cd android && ./gradlew assembleDebug`.
4. O APK sai em `android/app/build/outputs/apk/debug/app-debug.apk`.
5. Transfere esse arquivo pro celular (cabo USB, ou Google Drive, o que for mais
   fácil) e instala por lá.

Como você está numa máquina com acesso normal à internet (sem o bloqueio de rede
que eu tenho), o Gradle baixa o que precisa sem problema — é literalmente o mesmo
comando que eu tentei rodar aqui e travou só por causa da sandbox.

---

## O que já está pronto neste projeto

- App id: `com.billu.guiapatins` / Nome: **Guia de Patins**
- Ícone do launcher já configurado em todas as densidades (mdpi → xxxhdpi)
- Conteúdo: `www/index.html` é o guia completo (188 manobras de patins + 379
  de modalidades complementares, tudo já revisado e com biblioteca de mídia)
- `capacitor.config.json` — cor de fundo, nome, appId já configurados

## Se editar o conteúdo do guia depois

O app roda a partir de `www/index.html`. Se eu te mandar uma versão nova do
guia, é só substituir esse arquivo e rodar `npx cap sync android` de novo antes
de recompilar — isso copia o HTML atualizado pra dentro do projeto Android.

## Assinatura para publicar na Play Store (se decidir mais pra frente)

O APK de debug (`assembleDebug`) só instala manualmente, não pode ir pra Play
Store. Pra isso, precisaria gerar uma keystore de assinatura e rodar
`assembleRelease` — mas aí entra a taxa de US$25 da conta de desenvolvedor
Google, então só vale a pena se você decidir publicar de verdade. Por ora,
como você só quer rodar no seu celular, o `assembleDebug` já resolve.
