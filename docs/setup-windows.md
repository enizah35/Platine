# Mise en place sous Windows (PC de Hugo)

Objectif : faire tourner Platine en local (bot + Lavalink + PostgreSQL) avec Docker Desktop, puis vérifier que
la voix fonctionne avec le chiffrement DAVE de Discord.

Durée : environ 1 h la première fois.

---

## 1. Outils à installer

### 1.1 WSL2 + Docker Desktop

1. Ouvrir **PowerShell en administrateur** et lancer :
   ```powershell
   wsl --install
   ```
   Redémarrer le PC si on le demande. Ubuntu s'installe par défaut. Au premier lancement, choisir un nom
   d'utilisateur et un mot de passe Linux.
2. Installer **Docker Desktop** : https://www.docker.com/products/docker-desktop/
   - À l'installation, laisser cochée l'option **« Use WSL 2 instead of Hyper-V »**.
   - Dans Docker Desktop : *Settings → Resources → WSL integration* : activer l'intégration pour **Ubuntu**.
   - *Settings → Resources* : au moins **4 Go de RAM** pour Docker (Lavalink seul peut prendre 1 Go).
3. Vérifier, dans un terminal Ubuntu (WSL) :
   ```bash
   docker version
   docker compose version   # doit afficher v2.x
   ```

> **Conseil :** cloner le dépôt **dans le système de fichiers WSL** (ex. `~/code/platine`), pas sous `C:\`.
> Docker y est beaucoup plus rapide et on évite les soucis de fins de ligne.

### 1.2 Node.js, corepack et pnpm

Dans Ubuntu (WSL), installer Node **24 LTS** (minimum **22.12**) avec nvm :

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
# fermer et rouvrir le terminal
nvm install 24
node --version   # v24.x (>= 22.12 obligatoire)
corepack enable  # active pnpm à la version fixée dans package.json
pnpm --version   # 10.x
```

### 1.3 Git et le dépôt

```bash
sudo apt update && sudo apt install -y git
mkdir -p ~/code && cd ~/code
git clone git@github.com:<compte>/platine.git   # ou l'URL HTTPS du dépôt privé
cd platine
pnpm install
pnpm lint && pnpm typecheck && pnpm test
```

---

## 2. Créer les deux applications Discord

À faire **deux fois** sur https://discord.com/developers/applications : une application **`Platine Dev`**
(pour les essais) et une application **`Platine`** (pour la production, plus tard sur le VPS).

Pour chacune :

1. **New Application** → donner le nom → accepter les conditions.
2. Onglet **General Information** : noter l'**Application ID** (= `DISCORD_CLIENT_ID`).
3. Onglet **Bot** :
   - **Reset Token** → copier le token (= `DISCORD_TOKEN`). Il ne s'affiche qu'une fois. **Ne jamais le
     coller dans le dépôt, un ticket ou un message.**
   - Décocher **Public Bot** (seul Hugo peut l'inviter).
   - **Privileged Gateway Intents** : tout laisser **désactivé** (Presence, Server Members, Message Content).
     Le bot n'utilise que les intents non privilégiés **Guilds** et **GuildVoiceStates**, déclarés dans le code.
4. Onglet **Installation** (ou **OAuth2 → URL Generator**) :
   - Scopes : **`bot`** et **`applications.commands`**.
   - Permissions du bot : **View Channels**, **Send Messages**, **Embed Links**, **Connect**, **Speak**.
   - Copier l'URL générée : elle sert à inviter le bot sur un serveur.

### Serveur de test

1. Dans Discord : **+** → *Créer un serveur* → « Platine test ». Y créer un salon vocal (ex. « Musique »).
2. Ouvrir l'URL d'invitation de **Platine Dev** et choisir ce serveur.
3. Activer le **mode développeur** de Discord (*Paramètres → Avancés → Mode développeur*), puis :
   - clic droit sur le serveur → **Copier l'identifiant du serveur** (= `DISCORD_GUILD_ID`) ;
   - clic droit sur le salon vocal → **Copier l'identifiant du salon** (utile pour le test DAVE, §5).

---

## 3. Remplir `.env`

```bash
cp .env.example .env
```

Ouvrir `.env` (ex. `code .env` ou `nano .env`) et remplir :

| Variable | Valeur |
|---|---|
| `DISCORD_TOKEN` | token du bot **Platine Dev** |
| `DISCORD_CLIENT_ID` | Application ID de **Platine Dev** |
| `DISCORD_GUILD_ID` | identifiant du serveur de test |
| `LAVALINK_PASSWORD` | une longue chaîne aléatoire, ex. sortie de `openssl rand -hex 24` |
| `POSTGRES_PASSWORD` | une autre chaîne aléatoire |
| `DATABASE_URL` | la même que dans l'exemple, avec le mot de passe ci-dessus (sert pour `pnpm dev`) |

Les autres valeurs peuvent rester par défaut. `.env` est ignoré par git : vérifier avec `git status` qu'il
n'apparaît pas.

---

## 4. Démarrer la pile en local

Une seule fois : créer le dossier des plugins Lavalink et le donner à l'utilisateur du conteneur (uid 322),
sinon Lavalink ne peut pas y télécharger le plugin YouTube :

```bash
mkdir -p lavalink/plugins && sudo chown 322:322 lavalink/plugins
```

Puis :

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
docker compose -f docker-compose.yml -f docker-compose.dev.yml ps
```

Au premier démarrage, Lavalink télécharge le plugin **youtube-source** dans `lavalink/plugins/` (une minute
environ). Attendre que la colonne **STATUS** affiche `(healthy)` :

| Service | Healthcheck | Port local (dev uniquement) |
|---|---|---|
| `postgres` | `pg_isready` | 127.0.0.1:5432 |
| `lavalink` | `GET /version` authentifié | 127.0.0.1:2333 |
| `bot` | `GET /healthz` | 127.0.0.1:8080 |

> **Tant que la tâche 0.4 n'est pas livrée**, le bot n'a pas encore d'endpoint `/healthz` et s'arrête aussitôt :
> le service `bot` redémarre en boucle ou reste `unhealthy`. C'est normal. Pour cette étape, on peut ne démarrer
> que les deux autres : `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d lavalink postgres`.

Vérifications manuelles (PowerShell ou WSL) :

```bash
# Lavalink répond et le plugin YouTube est chargé
curl -H "Authorization: <LAVALINK_PASSWORD>" http://127.0.0.1:2333/version
curl -H "Authorization: <LAVALINK_PASSWORD>" http://127.0.0.1:2333/v4/info      # "plugins": [{"name":"youtube-plugin", ...}]
curl -H "Authorization: <LAVALINK_PASSWORD>" "http://127.0.0.1:2333/v4/loadtracks?identifier=ytsearch:daft%20punk%20one%20more%20time"
# Journal de Lavalink
docker compose -f docker-compose.yml -f docker-compose.dev.yml logs -f lavalink
# Bot (après la tâche 0.4)
curl http://127.0.0.1:8080/healthz
```

Arrêter : `docker compose -f docker-compose.yml -f docker-compose.dev.yml down` (ajouter `-v` efface **aussi**
la base de données).

### Ports Windows réservés (erreur « bind: An attempt was made to access a socket… »)

Windows réserve parfois des plages de ports (service **winnat**, souvent après une mise à jour ou avec Hyper-V).
Si Docker refuse de publier 2333, 5432 ou 8080 :

```powershell
# PowerShell en administrateur
net stop winnat
net start winnat
```

Puis relancer `docker compose … up -d`. Pour voir les plages réservées :
`netsh interface ipv4 show excludedportrange protocol=tcp`.

---

## 5. Test voix DAVE (critère de la tâche 0.2)

But : vérifier que **Lavalink 4.2.2 + Shoukaku 4.3.0** (voir `docs/adr/0001-client-lavalink.md`) arrivent à
rejoindre un salon vocal et à jouer de l'audio avec le chiffrement **DAVE** exigé par Discord.

On utilise un **bot jetable**, hors du dépôt, pour ne pas toucher au code de Platine.

1. Lavalink doit tourner et être `healthy` (§4).
2. Dans WSL, **hors du dépôt** :
   ```bash
   mkdir -p ~/code/spike-dave && cd ~/code/spike-dave
   npm init -y && npm pkg set type=module
   npm install discord.js@14 shoukaku@4.3.0
   ```
3. Créer `spike.mjs` :
   ```js
   import { Client, Events, GatewayIntentBits } from 'discord.js';
   import { Connectors, Shoukaku } from 'shoukaku';

   const { DISCORD_TOKEN, LAVALINK_PASSWORD, GUILD_ID, VOICE_CHANNEL_ID } = process.env;
   const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });
   const shoukaku = new Shoukaku(
     new Connectors.DiscordJS(client),
     [{ name: 'local', url: '127.0.0.1:2333', auth: LAVALINK_PASSWORD }],
     { resume: true, resumeTimeout: 60, reconnectTries: 3 },
   );
   shoukaku.on('error', (name, error) => console.error(`[lavalink ${name}]`, error));

   let started = false;
   async function start() {
     if (started || !client.isReady() || !shoukaku.getIdealNode()) return;
     started = true;
     const player = await shoukaku.joinVoiceChannel({
       guildId: GUILD_ID,
       channelId: VOICE_CHANNEL_ID,
       shardId: 0,
       deaf: true,
     });
     player.on('closed', (e) => console.error(`ÉCHEC voix : code ${e.code} ${e.reason}`));
     player.on('exception', (e) => console.error('Erreur de lecture', e.exception));
     player.on('start', () => console.log('OK : lecture démarrée, écouter dans le salon'));
     const result = await player.node.rest.resolve('ytsearch:daft punk one more time');
     if (result?.loadType !== 'search' || result.data.length === 0) throw new Error('Recherche YouTube vide');
     await player.playTrack({ track: { encoded: result.data[0].encoded } });
   }
   shoukaku.on('ready', () => void start());
   client.once(Events.ClientReady, () => void start());
   client.login(DISCORD_TOKEN);
   ```
4. Lancer (remplacer les valeurs) :
   ```bash
   DISCORD_TOKEN=... LAVALINK_PASSWORD=... GUILD_ID=... VOICE_CHANNEL_ID=... node spike.mjs
   ```
   Être soi-même connecté au salon vocal pour écouter.

**Critère de réussite :**
- le bot rejoint le salon, `OK : lecture démarrée` s'affiche et **on entend le morceau** ;
- aucune ligne `ÉCHEC voix : code 4017` ni message « E2EE » / « DAVE protocol required » dans la console ;
- dans `docker compose … logs lavalink`, pas d'erreur de connexion voix (`WebSocket closed`, `4017`, `DAVE`).

**Si ça échoue avec 4017 :** noter la sortie complète (console + logs Lavalink) et la transmettre : on bascule
alors sur `lavalink-client` (repli prévu dans l'ADR 0001).

Supprimer ensuite le dossier `~/code/spike-dave`.

---

## 6. Problèmes fréquents

| Symptôme | Cause probable | Solution |
|---|---|---|
| `lavalink` jamais `healthy`, logs « Failed to download plugin » | Pas d'accès à `maven.lavalink.dev` | Vérifier la connexion / l'antivirus, puis `docker compose … restart lavalink` |
| `lavalink` s'arrête, « password » dans l'erreur | `LAVALINK_PASSWORD` vide dans `.env` | Remplir `.env`, relancer |
| `POSTGRES_PASSWORD manquant dans .env` | Variable obligatoire absente | Remplir `.env` |
| Recherche YouTube vide ou « Sign in to confirm you're not a bot » | YouTube bloque l'IP ou un client | Voir le risque R1 du plan ; **ne pas** activer l'OAuth avec un compte personnel |
| Port refusé au démarrage | Ports réservés par Windows | `net stop winnat` / `net start winnat` (§4) |
