const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;
const HOST = '0.0.0.0';

app.use(express.json());

// Boot the Discord bot client in background
let botModule = null;

// Serve root index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Serve soundboard audio files
const audioDir = path.join(__dirname, 'commands', '🔊 Soundboard', 'audio');
app.get('/api/audio/:file', (req, res) => {
  const safeFile = path.basename(req.params.file);
  const filePath = path.join(audioDir, safeFile);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Audio file not found' });
  }
  const ext = path.extname(safeFile).toLowerCase();
  const mimeMap = {
    '.mp3': 'audio/mpeg',
    '.m4a': 'audio/mp4',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg'
  };
  res.setHeader('Content-Type', mimeMap[ext] || 'audio/mpeg');
  res.setHeader('Accept-Ranges', 'bytes');
  fs.createReadStream(filePath).pipe(res);
});

// API: Bot Status
app.get('/api/status', (req, res) => {
  const client = botModule ? botModule.client : null;
  const config = botModule ? botModule.config : require('./botconfig/config.json');

  const isReady = client && client.isReady && client.isReady();
  const botState = isReady ? 'ready' : (client && client.ws ? 'standby' : 'offline');

  res.json({
    botState,
    botUser: client && client.user ? {
      username: client.user.username,
      tag: client.user.tag,
      id: client.user.id,
      avatar: client.user.displayAvatarURL ? client.user.displayAvatarURL() : null
    } : {
      username: 'Clan Multipurpose Bot',
      tag: 'ClanBot#0000',
      id: '863876115584385074'
    },
    prefix: config.prefix || '//',
    totalCommands: client && client.commands ? client.commands.size : 625,
    ping: client && client.ws ? client.ws.ping || 0 : 0,
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage(),
    nodeVersion: process.version,
    hasToken: Boolean(process.env.token && !process.env.token.includes('GET from'))
  });
});

// API: Commands List
app.get('/api/commands', (req, res) => {
  const client = botModule ? botModule.client : null;
  if (!client || !client.commands || client.commands.size === 0) {
    // Fallback: scan commands directory directly
    const list = [];
    const commandsDir = path.join(__dirname, 'commands');
    if (fs.existsSync(commandsDir)) {
      const categories = fs.readdirSync(commandsDir);
      for (const cat of categories) {
        const catDir = path.join(commandsDir, cat);
        if (fs.statSync(catDir).isDirectory()) {
          const files = fs.readdirSync(catDir).filter(f => f.endsWith('.js'));
          for (const file of files) {
            try {
              const cmd = require(path.join(catDir, file));
              list.push({
                name: cmd.name || path.basename(file, '.js'),
                category: cmd.category || cat.replace(/[^\w\s-]/g, '').trim(),
                description: cmd.description || 'No description provided.',
                usage: cmd.usage || `//${cmd.name || path.basename(file, '.js')}`,
                aliases: cmd.aliases || []
              });
            } catch (e) {}
          }
        }
      }
    }
    return res.json(list);
  }

  const list = [];
  client.commands.forEach((cmd, key) => {
    list.push({
      name: cmd.name || key,
      category: cmd.category || 'General',
      description: cmd.description || 'No description provided.',
      usage: cmd.usage || `//${cmd.name || key}`,
      aliases: cmd.aliases || [],
      cooldown: cmd.cooldown || 1
    });
  });
  res.json(list);
});

// API: Soundboard List
app.get('/api/soundboard', (req, res) => {
  if (!fs.existsSync(audioDir)) return res.json([]);
  const files = fs.readdirSync(audioDir);
  const clips = files.map(file => {
    const ext = path.extname(file);
    const name = path.basename(file, ext);
    return {
      name,
      file,
      url: `/api/audio/${encodeURIComponent(file)}`,
      format: ext.replace('.', '')
    };
  });
  res.json(clips);
});

// API: Radio Stations
app.get('/api/radio', (req, res) => {
  try {
    const stations = require('./botconfig/radiostations.json');
    res.json(stations);
  } catch (e) {
    res.json({});
  }
});

// API: Command Simulator
app.post('/api/simulate-command', (req, res) => {
  const { command } = req.body;
  if (!command) return res.status(400).json({ error: 'Command is required' });

  const raw = command.startsWith('//') ? command.slice(2).trim() : command.trim();
  const parts = raw.split(/\s+/);
  const cmdName = parts[0].toLowerCase();
  const args = parts.slice(1);

  // Handlers for common simulated commands
  if (cmdName === 'calc' || cmdName === 'calculator') {
    const expr = args.join(' ');
    try {
      // Safe math evaluator using regex check
      if (/^[0-9+\-*/().%^ \t]+$/.test(expr)) {
        const evaluated = Function(`'use strict'; return (${expr})`)();
        return res.json({
          title: '🧮 Calculator Result',
          description: `\`\`\`js\n${expr} = ${evaluated}\n\`\`\``,
          color: '#57F287'
        });
      } else {
        return res.json({
          title: '🧮 Calculator Error',
          description: 'Expression contains invalid mathematical characters.',
          color: '#ED4245'
        });
      }
    } catch (e) {
      return res.json({
        title: '🧮 Calculator Error',
        description: `Syntax error in calculation: ${e.message}`,
        color: '#ED4245'
      });
    }
  }

  if (cmdName === '8ball') {
    const answers = [
      'It is certain.', 'It is decidedly so.', 'Without a doubt.', 'Yes definitely.',
      'You may rely on it.', 'As I see it, yes.', 'Most likely.', 'Outlook good.',
      'Yes.', 'Signs point to yes.', 'Reply hazy, try again.', 'Ask again later.',
      'Better not tell you now.', 'Cannot predict now.', 'Concentrate and ask again.',
      'Don\'t count on it.', 'My reply is no.', 'My sources say no.', 'Outlook not so good.',
      'Very doubtful.'
    ];
    const question = args.join(' ') || 'Will this work?';
    const answer = answers[Math.floor(Math.random() * answers.length)];
    return res.json({
      title: '🎱 Magic 8-Ball',
      description: `**Question:** ${question}\n**Answer:** ${answer}`,
      color: '#5865F2'
    });
  }

  if (cmdName === 'ping') {
    const ping = botModule && botModule.client && botModule.client.ws ? botModule.client.ws.ping || 42 : 42;
    return res.json({
      title: '🏓 Pong!',
      description: `**Bot Latency:** \`${ping}ms\`\n**API Latency:** \`18ms\`\n**Web Dashboard:** \`Online (Port 3000)\``,
      color: '#57F287'
    });
  }

  if (cmdName === 'botinfo' || cmdName === 'stats') {
    const client = botModule ? botModule.client : null;
    const uptimeM = Math.floor(process.uptime() / 60);
    const uptimeS = Math.floor(process.uptime() % 60);
    return res.json({
      title: '📊 Bot Information & Statistics',
      description: `**Bot Name:** Clan Multipurpose Bot\n**Node.js:** ${process.version}\n**Total Commands:** ${client ? client.commands.size : 625}\n**Uptime:** ${uptimeM}m ${uptimeS}s\n**Memory RSS:** ${(process.memoryUsage().rss / 1024 / 1024).toFixed(2)} MB\n**Platform:** ${process.platform} (${process.arch})\n**Developer:** Tomato#6966`,
      color: '#5865F2'
    });
  }

  if (cmdName === 'joke') {
    const jokes = [
      'Why do programmers prefer dark mode? Because light attracts bugs.',
      'There are only 10 types of people in the world: those who understand binary, and those who do not.',
      'Why was the JavaScript developer sad? Because he didn\'t know how to \'null\' his feelings.',
      'A SQL query walks into a bar, walks up to two tables and asks: "Can I join you?"',
      'How many programmers does it take to change a light bulb? None, it\'s a hardware problem.'
    ];
    return res.json({
      title: '😄 Random Joke',
      description: jokes[Math.floor(Math.random() * jokes.length)],
      color: '#FEE75C'
    });
  }

  if (cmdName === 'fact') {
    const facts = [
      'Honey never spoils. Archaeologists have found pots of honey in ancient Egyptian tombs that are over 3,000 years old and still perfectly edible.',
      'The first computer bug was an actual real moth found stuck in a Harvard Mark II computer relay in 1947.',
      'Octopuses have three hearts, nine brains, and blue blood.',
      'Bananas are curved because they grow towards the sun against gravity (negative geotropism).'
    ];
    return res.json({
      title: '💡 Random Fact',
      description: facts[Math.floor(Math.random() * facts.length)],
      color: '#57F287'
    });
  }

  if (cmdName === 'flip' || cmdName === 'coinflip') {
    const result = Math.random() < 0.5 ? 'Heads' : 'Tails';
    return res.json({
      title: '🪙 Coin Flip',
      description: `The coin landed on **${result}**!`,
      color: '#FEE75C'
    });
  }

  if (cmdName === 'dice' || cmdName === 'roll') {
    const roll = Math.floor(Math.random() * 6) + 1;
    return res.json({
      title: '🎲 Dice Roll',
      description: `You rolled a **${roll}** (1-6)!`,
      color: '#EB459E'
    });
  }

  if (cmdName === 'daily') {
    return res.json({
      title: '💸 Daily Economy Reward',
      description: `You claimed your daily reward of **💵 500 Coins**!\nCome back in 24 hours to claim again.`,
      color: '#57F287'
    });
  }

  if (cmdName === 'balance' || cmdName === 'bal') {
    return res.json({
      title: '💰 Your Bank Balance',
      description: `**Wallet:** \`$1,250\`\n**Bank:** \`$15,400 / $50,000\`\n**Net Worth:** \`$16,650\`\n**Rank:** #12 on the server`,
      color: '#FEE75C'
    });
  }

  if (cmdName === 'slots') {
    const bet = parseInt(args[0]) || 100;
    const symbols = ['🍎', '🍒', '🍋', '⭐', '💎', '7️⃣'];
    const s1 = symbols[Math.floor(Math.random() * symbols.length)];
    const s2 = symbols[Math.floor(Math.random() * symbols.length)];
    const s3 = symbols[Math.floor(Math.random() * symbols.length)];
    const won = s1 === s2 && s2 === s3;
    const partial = s1 === s2 || s2 === s3 || s1 === s3;
    const winnings = won ? bet * 10 : (partial ? bet * 2 : 0);

    return res.json({
      title: '🎰 Slot Machine',
      description: `**[ ${s1} | ${s2} | ${s3} ]**\n\n${won ? `🎉 **JACKPOT!** You won **$${winnings}**!` : (partial ? `✨ **Two of a kind!** You won **$${winnings}**!` : `❌ You lost **$${bet}**. Better luck next time!`)}`,
      color: won || partial ? '#57F287' : '#ED4245'
    });
  }

  // Fallback for any of the 625 commands: look up metadata and render simulated execution
  const client = botModule ? botModule.client : null;
  const cmd = client && client.commands ? (client.commands.get(cmdName) || client.commands.get(client.aliases.get(cmdName))) : null;
  if (cmd) {
    return res.json({
      title: `⚡ Command //${cmd.name}`,
      description: `**Category:** ${cmd.category || 'General'}\n**Description:** ${cmd.description || 'No description'}\n**Usage:** \`${cmd.usage || '//' + cmd.name}\`\n**Aliases:** ${cmd.aliases && cmd.aliases.length > 0 ? cmd.aliases.map(a => '`' + a + '`').join(', ') : 'None'}\n\n*Command loaded into bot registry and ready for Discord execution.*`,
      color: '#5865F2'
    });
  }

  return res.json({
    title: `❓ Unknown Command: ${cmdName}`,
    description: `Could not find command \`//${cmdName}\` in the 625 bot commands directory. Try checking the **Command Explorer** tab.`,
    color: '#ED4245'
  });
});

// API: Set Token
app.post('/api/bot/token', (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Token is required' });

  process.env.token = token;
  if (botModule && botModule.client) {
    botModule.client.login(token)
      .then(() => {
        res.json({ message: 'Logged into Discord successfully!' });
      })
      .catch(e => {
        res.status(400).json({ error: 'Failed to login: ' + e.message });
      });
  } else {
    res.json({ message: 'Token saved to environment.' });
  }
});

// API: Save Config
app.post('/api/bot/config', (req, res) => {
  const { prefix, statusText, statusType, token } = req.body;
  const cfgPath = path.join(__dirname, 'botconfig', 'config.json');
  try {
    const cur = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    if (prefix) cur.prefix = prefix;
    if (statusText) cur.status.text = statusText;
    if (statusType) cur.status.type = statusType;
    if (token) {
      cur.token = token;
      process.env.token = token;
    }
    fs.writeFileSync(cfgPath, JSON.stringify(cur, null, 4));
    res.json({ message: 'Configuration updated successfully!' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Listen on 0.0.0.0:3000
app.listen(PORT, HOST, () => {
  console.log(`[Dashboard] Multipurpose Discord Bot Web Dashboard listening on http://${HOST}:${PORT}`);
  setImmediate(() => {
    try {
      botModule = require('./index.js');
    } catch (e) {
      console.error('[Bot Init Error]:', e);
    }
  });
});
