# menu-margin-agent

> An AI agent that reads restaurant POS data and delivers weekly CFO-level insights on menu profitability.

**Status:** work in progress. Public launch coming.

Built with the [Vercel AI SDK](https://sdk.vercel.ai), targeting **Google Gemini** (free tier) or **Anthropic Claude** (pro tier) with a one-line model swap.

## What it does

- Reads dishes, recipes, and sales history
- Ranks dishes by margin, revenue, and volume
- Simulates the revenue impact of price changes
- Detects supplier cost creep and demand trends
- Delivers a weekly Markdown brief the owner can act on

## Quickstart

```bash
git clone https://github.com/asmar-io/menu-margin-agent.git
cd menu-margin-agent
npm install
cp .env.example .env       # then edit .env and add your Gemini key
npm run seed               # generates the "Chez Fatima" demo restaurant
npm run report examples/chez-fatima/data.db
```

## Model tiers

| Tier | Model | Cost | Use case |
|---|---|---|---|
| `free` | `gemini-2.5-flash` | free tier | demos, open-source, low-stakes |
| `pro` | `claude-sonnet-4-6` | pay-per-token | production, higher stakes |

Swap tiers with one env var. Same tools, same prompts, same output shape.

## License

MIT © Tohami Ben ([asmar-io](https://github.com/asmar-io))
