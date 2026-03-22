import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseURL: 'https://api.yunjintao.com',
});

export default async function handler(req, res) {
  try {const { model, max_tokens, system, messages } = req.body;

    const response = await client.messages.create({
      model,
      max_tokens,system,
      messages,   });

    res.status(200).json(response); } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
